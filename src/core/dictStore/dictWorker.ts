// @ts-nocheck
/**
 * 移动端词典 Worker — 在 dedicated Worker 中以 OPFS 同步句柄随机读 vendor 解析器,
 * 并承担词典导入的分块落盘写入。
 *
 * 写入走同步句柄而非 createWritable:Safari 的 FileSystemWritableFileStream 会把
 * 已写数据滞留内存(大词典导入直接把 WKWebView 顶到 jetsam 上限,表现为 App 反复
 * 重载);createSyncAccessHandle().write(buf,{at}) 逐块直写磁盘,内存恒定。
 *
 * 打包方式:esbuild 第二入口编译为 IIFE 字符串,以 __LME_DICT_WORKER_SOURCE__
 * define 注入主包(私有分发只有三件套,不能携带独立 worker 文件)。
 *
 * 协议(请求携带 id;应答 {id, ok:true, ...} 或 {id, ok:false, error}):
 *   probe                          -> { opfs: boolean }
 *   load    {dictId, storeId}      -> { wordCount, css, hasMdd, cached }
 *   lookup  {dictId, word}         -> { html: string | null }
 *   getResource {dictId, path}     -> { found: boolean, bytes: ArrayBuffer | null } (transfer 回传)
 *   unload  {dictId}               -> {}
 *   ensureStoreDir {storeId}       -> {}
 *   writeBegin {storeId,slot,size} -> { token }
 *   writeChunk {token, bytes}      -> { pos }   (bytes 为 transfer 的 ArrayBuffer)
 *   writeEnd   {token}             -> { size }
 *   abortImport {storeId}          -> {}        (关闭会话并递归删除目录)
 *
 * 目录布局(与 MobileDictService 导入约定): /lme-dicts/{storeId}/
 *   dict.mdx  res.mdd  res.2.mdd ...  style.css  meta.json
 */
import { createDictEngine } from '../mdx/dictEngineCore';
import { OpfsSyncBackend } from '../mdx/backends/opfsSyncBackend';

/** dictId(settings 词典条目 id) -> 引擎;storeId 变更时重建 */
const engines = new Map();

/** 导入写入会话: token -> { storeId, slot, handle, pos } */
let writeTokenSeq = 0;
const writeSessions = new Map();

async function getBaseDir(create: boolean): Promise<any> {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle('lme-dicts', { create });
}

async function openStoreDir(storeId: string): Promise<any> {
    const base = await getBaseDir(false);
    return base.getDirectoryHandle(storeId, { create: false });
}

/** 导入写入路径:目录若被清理则自动重建 */
async function openStoreDirForWrite(storeId: string): Promise<any> {
    const base = await getBaseDir(true);
    return base.getDirectoryHandle(storeId, { create: true });
}

async function openSyncBackend(dir: any, slot: string): Promise<{ fname: string; backend: any }> {
    const fh = await dir.getFileHandle(slot);
    const size = (await fh.getFile()).size;
    const handle = await fh.createSyncAccessHandle();
    return { fname: slot, backend: new OpfsSyncBackend(handle, size) };
}

async function probeOpfs(): Promise<boolean> {
    try {
        const root = await navigator.storage.getDirectory();
        const base = await root.getDirectoryHandle('lme-dicts', { create: true });
        // 真正验证同步句柄能力(仅 Worker 可用,iOS 16.4+)
        const fh = await base.getFileHandle('.probe', { create: true });
        const h = await fh.createSyncAccessHandle();
        h.close();
        await base.removeEntry('.probe');
        return true;
    } catch {
        return false;
    }
}

async function loadDict(dictId: string, storeId: string): Promise<any> {
    const existing = engines.get(dictId);
    if (existing && existing.storeId === storeId) {
        return {
            wordCount: existing.engine.wordCount,
            css: existing.engine.css,
            hasMdd: existing.hasMdd,
            cached: true,
        };
    }
    if (existing) {
        try { existing.engine.close(); } catch (e) { /* 忽略 */ }
        engines.delete(dictId);
    }

    const dir = await openStoreDir(storeId);

    // meta.json:槽位映射与文件清单
    const metaHandle = await dir.getFileHandle('meta.json');
    const meta = JSON.parse(await (await metaHandle.getFile()).text());

    const mdxBackend = await openSyncBackend(dir, meta.slots.mdx);
    const mddBackends = [];
    for (const slot of meta.mddSlots || []) {
        try {
            mddBackends.push(await openSyncBackend(dir, slot));
        } catch (e) {
            // 单卷缺失不致命:跳过该卷
        }
    }

    let css = null;
    if (meta.slots.css) {
        try {
            const fh = await dir.getFileHandle(meta.slots.css);
            css = await (await fh.getFile()).text();
        } catch (e) {
            // CSS 缺失不致命
        }
    }

    const engine = createDictEngine({
        mdx: { fname: meta.slots.mdx, backend: mdxBackend.backend },
        mdd: mddBackends.map((f) => ({ fname: f.fname, backend: f.backend })),
        css,
    });
    engines.set(dictId, { storeId, engine, hasMdd: mddBackends.length > 0 });
    return {
        wordCount: engine.wordCount,
        css,
        hasMdd: mddBackends.length > 0,
        cached: false,
    };
}

self.onmessage = async (ev: MessageEvent) => {
    const msg = ev.data;
    if (!msg || typeof msg.id !== 'number' || !msg.type) return;

    const reply = (payload: any, transfer?: Transferable[]) => {
        try {
            (self as any).postMessage(Object.assign({ id: msg.id, ok: true }, payload), transfer || []);
        } catch (e) {
            (self as any).postMessage({ id: msg.id, ok: false, error: String((e && e.message) || e) });
        }
    };
    const fail = (e: any) => {
        (self as any).postMessage({ id: msg.id, ok: false, error: String((e && e.message) || e) });
    };

    try {
        switch (msg.type) {
            case 'ping':
                reply({ alive: true });
                break;
            case 'probe':
                reply({ opfs: await probeOpfs() });
                break;
            case 'load':
                reply(await loadDict(msg.dictId, msg.storeId));
                break;
            case 'lookup': {
                const entry = engines.get(msg.dictId);
                if (!entry) throw new Error(`engine not loaded: ${msg.dictId}`);
                reply({ html: entry.engine.lookup(msg.word) });
                break;
            }
            case 'getResource': {
                const entry = engines.get(msg.dictId);
                if (!entry) throw new Error(`engine not loaded: ${msg.dictId}`);
                const bytes = entry.engine.getResource(msg.path);
                if (bytes && bytes.buffer) {
                    reply({ found: true, bytes: bytes.buffer }, [bytes.buffer]);
                } else {
                    reply({ found: false, bytes: null });
                }
                break;
            }
            case 'unload': {
                const entry = engines.get(msg.dictId);
                if (entry) {
                    try { entry.engine.close(); } catch (e) { /* 忽略 */ }
                    engines.delete(msg.dictId);
                }
                reply({});
                break;
            }
            // ── 导入写入:同步句柄分块直写磁盘(内存恒定) ──
            case 'ensureStoreDir': {
                const base = await getBaseDir(true);
                await base.getDirectoryHandle(msg.storeId, { create: true });
                reply({});
                break;
            }
            case 'writeBegin': {
                const dir = await openStoreDirForWrite(msg.storeId);
                const fh = await dir.getFileHandle(msg.slot, { create: true });
                const handle = await fh.createSyncAccessHandle();
                await handle.truncate(0);
                const token = ++writeTokenSeq;
                writeSessions.set(token, { storeId: msg.storeId, slot: msg.slot, handle, pos: 0 });
                reply({ token });
                break;
            }
            case 'writeChunk': {
                const s = writeSessions.get(msg.token);
                if (!s) throw new Error(`invalid write token: ${msg.token}`);
                const u8 = new Uint8Array(msg.bytes);
                let off = 0;
                while (off < u8.length) {
                    const n = s.handle.write(off === 0 ? u8 : u8.subarray(off), { at: s.pos });
                    if (!n || n <= 0) throw new Error('sync handle write returned 0');
                    s.pos += n;
                    off += n;
                }
                reply({ pos: s.pos });
                break;
            }
            case 'writeEnd': {
                const s = writeSessions.get(msg.token);
                if (!s) throw new Error(`invalid write token: ${msg.token}`);
                try {
                    if (typeof s.handle.flush === 'function') s.handle.flush();
                } catch (e) { /* flush 失败不致命,close 也会落盘 */ }
                s.handle.close();
                writeSessions.delete(msg.token);
                reply({ size: s.pos });
                break;
            }
            case 'abortImport': {
                for (const [token, s] of Array.from(writeSessions)) {
                    if (s.storeId === msg.storeId) {
                        try { s.handle.close(); } catch (e) { /* 忽略 */ }
                        writeSessions.delete(token);
                    }
                }
                try {
                    const base = await getBaseDir(false);
                    await base.removeEntry(msg.storeId, { recursive: true });
                } catch (e) {
                    // 目录可能不存在
                }
                reply({});
                break;
            }
            default:
                fail(new Error(`unknown message type: ${msg.type}`));
        }
    } catch (e) {
        fail(e);
    }
};
