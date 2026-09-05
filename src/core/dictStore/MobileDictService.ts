// @ts-nocheck
/**
 * 移动词典服务(主线程)— Worker RPC 客户端 + 引擎缓存 + 降级路由。
 *
 * 路由策略(欧路模式的三层实现):
 *   1. Worker + OPFS 同步句柄(主路径,iOS 16.4+):查词/资源全在 Worker 内随机读
 *   2. 主线程内存引擎(降级档):session 内 DictStore.importToMemory 导入的数据
 *   3. 均不可用 → 抛 DICT_DATA_MISSING,上层提示重新导入
 *
 * 引擎缓存按 settings 词典条目 id;storeId 变更(重新导入)自动重建。
 * 桌面端若存在 source==='store' 的条目(如从移动端同步的设置),同样走本服务 —
 * Worker/OPFS 在 Electron 环境亦可用。
 */
import { createDictEngine } from '../mdx/dictEngineCore';
import { MemoryScannerBackend } from '../mdx/backends/memoryBackend';
import {
    memoryDictRegistry,
    classifyDictFiles,
    importToMemory,
    DictStore,
    type ClassifiedDictFiles,
    type StoredDictMeta,
    type MemoryDictSet,
} from './DictStore';
import {
    loadStoreDicts,
    applyStoreDicts,
    computeReconcile,
} from './storeRegistry';
import { randomUUID } from '../../mocks/crypto';

// esbuild 第二入口(dictWorker IIFE)在构建期以 define 注入
declare const __LME_DICT_WORKER_SOURCE__: string;

/** 导入分块大小:主线程每次只持有这么大的 ArrayBuffer,transfer 给 Worker 直写磁盘 */
const IMPORT_CHUNK = 1024 * 1024;

interface PendingRpc {
    resolve: (v: any) => void;
    reject: (e: Error) => void;
    timer: any;
}

export interface MobileDictRef {
    id: string;
    name: string;
    storeId: string;
}

interface EngineEntry {
    kind: 'worker' | 'memory';
    storeId: string;
    css: string | null;
    wordCount: number;
    /** 仅 memory 档:主线程引擎实例 */
    engine?: ReturnType<typeof createDictEngine>;
}

const RPC_TIMEOUT_DEFAULT = 15000;
const RPC_TIMEOUT_LOAD = 60000;

class MobileDictService {
    private worker: Worker | null = null;
    private workerBroken = false;
    private pending = new Map<number, PendingRpc>();
    private seq = 1;
    private engines = new Map<string, EngineEntry>();
    private caps: { worker: boolean; opfs: boolean } | null = null;

    private createWorker(): Worker | null {
        if (this.workerBroken) return null;
        if (this.worker) return this.worker;
        try {
            const blob = new Blob([__LME_DICT_WORKER_SOURCE__], { type: 'text/javascript' });
            const w = new Worker(URL.createObjectURL(blob));
            w.onmessage = (ev: MessageEvent) => this.onMessage(ev);
            w.onerror = () => {
                // 异步失败(如运行环境禁用 blob worker):置坏并唤醒降级,后续调用不再等超时
                this.workerBroken = true;
                this.worker = null;
                this.failAll('dict worker error');
            };
            this.worker = w;
            return w;
        } catch {
            this.workerBroken = true;
            return null;
        }
    }

    private failAll(reason: string): void {
        for (const p of this.pending.values()) {
            clearTimeout(p.timer);
            p.reject(new Error(reason));
        }
        this.pending.clear();
    }

    private onMessage(ev: MessageEvent): void {
        const data = ev.data;
        if (!data || typeof data.id !== 'number') return;
        const p = this.pending.get(data.id);
        if (!p) return;
        this.pending.delete(data.id);
        clearTimeout(p.timer);
        if (data.ok) p.resolve(data);
        else p.reject(new Error(data.error || 'dict worker error'));
    }

    private call(
        type: string,
        payload: Record<string, any>,
        timeoutMs: number = RPC_TIMEOUT_DEFAULT,
        transfer?: Transferable[]
    ): Promise<any> {
        const w = this.createWorker();
        if (!w) return Promise.reject(new Error('WORKER_UNAVAILABLE'));
        const id = this.seq++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`dict worker rpc timeout: ${type}`));
            }, timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            w.postMessage(Object.assign({ id, type }, payload), transfer || []);
        });
    }

    /** 能力探测(缓存一次):Worker 可创建 + OPFS 同步句柄可用 */
    async probe(): Promise<{ worker: boolean; opfs: boolean }> {
        if (this.caps) return this.caps;
        let worker = false;
        let opfs = false;
        try {
            await this.call('ping', {}, 5000);
            worker = true;
        } catch {
            worker = false;
        }
        if (worker) {
            try {
                const r = await this.call('probe', {}, 10000);
                opfs = !!r.opfs;
            } catch {
                opfs = false;
            }
        }
        this.caps = { worker, opfs };
        return this.caps;
    }

    /** 确保词典引擎就绪;storeId 变更时自动重建 */
    async ensure(dict: MobileDictRef): Promise<EngineEntry> {
        const cached = this.engines.get(dict.id);
        if (cached && cached.storeId === dict.storeId) return cached;

        await this.unload(dict.id);

        const caps = await this.probe();
        if (caps.worker && caps.opfs) {
            try {
                const r = await this.call('load', { dictId: dict.id, storeId: dict.storeId }, RPC_TIMEOUT_LOAD);
                const entry: EngineEntry = {
                    kind: 'worker',
                    storeId: dict.storeId,
                    css: r.css ?? null,
                    wordCount: r.wordCount || 0,
                };
                this.engines.set(dict.id, entry);
                return entry;
            } catch (e) {
                // OPFS 目录缺失(数据被清)等 — 落入内存降级判断
                console.warn(`[LME MobileDict] worker load failed for ${dict.name}:`, e && e.message);
            }
        }

        const mem = memoryDictRegistry.get(dict.storeId);
        if (mem) {
            const engine = createDictEngine({
                mdx: { fname: mem.mdx.fname, backend: new MemoryScannerBackend(mem.mdx.buffer) },
                mdd: mem.mdd.map((v) => ({ fname: v.fname, backend: new MemoryScannerBackend(v.buffer) })),
                css: mem.css,
            });
            const entry: EngineEntry = {
                kind: 'memory',
                storeId: dict.storeId,
                css: mem.css,
                wordCount: engine.wordCount,
                engine,
            };
            this.engines.set(dict.id, entry);
            return entry;
        }

        throw new Error('DICT_DATA_MISSING');
    }

    /** 查词(含三级大小写与 @@@LINK 策略,逻辑在 dictEngineCore) */
    async lookup(dict: MobileDictRef, word: string): Promise<string | null> {
        const entry = await this.ensure(dict);
        if (entry.kind === 'worker') {
            const r = await this.call('lookup', { dictId: dict.id, word });
            return r.html ?? null;
        }
        return entry.engine.lookup(word);
    }

    /** 取词典 CSS(引擎就绪后可用) */
    async getCss(dict: MobileDictRef): Promise<string | null> {
        const entry = await this.ensure(dict);
        return entry.css;
    }

    /** 取 MDD 资源(图片/发音)。dictId 精确优先,其次遍历已加载引擎 — 对应桌面 getMDXResource 策略 */
    async getResource(path: string, dictId?: string): Promise<Uint8Array | null> {
        const ids = dictId && this.engines.has(dictId) ? [dictId] : [...this.engines.keys()];
        for (const id of ids) {
            const entry = this.engines.get(id);
            if (!entry) continue;
            if (entry.kind === 'worker') {
                try {
                    const r = await this.call('getResource', { dictId: id, path }, 20000);
                    if (r.found && r.bytes) return new Uint8Array(r.bytes);
                } catch {
                    // 换下一本
                }
            } else if (entry.engine) {
                const buf = entry.engine.getResource(path);
                if (buf) return buf;
            }
        }
        return null;
    }

    /** 是否有任一词典引擎已加载(供 getMDXResource 决定是否尝试移动路径) */
    hasEngines(): boolean {
        return this.engines.size > 0;
    }

    // ── 词典导入 ──────────────────────────────────────────
    /** 进行中的导入(设置页重渲染时用于恢复进度显示与按钮禁用) */
    currentImport: { name: string; pct: number } | null = null;
    /** 进度订阅:设置页重渲染后重挂 live 进度 */
    private importListeners = new Set<(info: { name: string; pct: number } | null) => void>();

    onImportProgress(cb: (info: { name: string; pct: number } | null) => void): () => void {
        this.importListeners.add(cb);
        return () => this.importListeners.delete(cb);
    }

    private notifyImport(): void {
        for (const cb of this.importListeners) {
            try { cb(this.currentImport); } catch { /* 单个监听器异常不扩散 */ }
        }
    }

    /**
     * 导入一组词典文件(.mdx 必选,.mdd 多卷,.css 可选)。
     * 主路径:Worker 同步句柄逐块直写 OPFS(Safari 的 createWritable 会把已写数据
     * 滞留内存,大词典导入会触发 jetsam 反复重载,故弃用)。
     * 无 Worker/同步句柄时:内存降级档(会话级,单本 100MB 上限)。
     */
    async import(
        files: File[],
        opts: { name?: string; language: string },
        onProgress?: (done: number, total: number) => void
    ): Promise<{ kind: 'opfs' | 'memory'; meta: StoredDictMeta | MemoryDictSet }> {
        if (this.currentImport) throw new Error('IMPORT_BUSY');
        const classified = classifyDictFiles(files);
        if (!classified.mdx) throw new Error('NO_MDX_FILE');
        const name = opts.name || classified.mdx.name.replace(/\.mdx$/i, '');

        const caps = await this.probe();
        if (!(caps.worker && caps.opfs)) {
            this.currentImport = { name, pct: 0 };
            this.notifyImport();
            try {
                return { kind: 'memory', meta: await importToMemory(classified, { name, language: opts.language }, onProgress) };
            } finally {
                this.currentImport = null;
                this.notifyImport();
            }
        }
        return this.importViaWorker(classified, { name, language: opts.language }, onProgress);
    }

    private async importViaWorker(
        classified: ClassifiedDictFiles,
        opts: { name: string; language: string },
        onProgress?: (done: number, total: number) => void
    ): Promise<{ kind: 'opfs'; meta: StoredDictMeta }> {
        const { mdx, css, mdd } = classified;
        const storeId = randomUUID();
        const plan: Array<{ slot: string; file: File }> = [{ slot: 'dict.mdx', file: mdx }];
        mdd.forEach((f, i) => {
            plan.push({ slot: i === 0 ? 'res.mdd' : `res.${i + 1}.mdd`, file: f });
        });
        if (css) plan.push({ slot: 'style.css', file: css });

        const total = plan.reduce((s, p) => s + p.file.size, 0);
        this.currentImport = { name: opts.name, pct: 0 };
        const report = (done: number) => {
            const pct = total > 0 ? Math.floor((done / total) * 100) : 100;
            this.currentImport = { name: opts.name, pct };
            this.notifyImport();
            onProgress && onProgress(done, total);
        };

        try {
            await this.call('ensureStoreDir', { storeId }, 10000);
            let done = 0;
            for (const p of plan) {
                const begin = await this.call('writeBegin', { storeId, slot: p.slot, size: p.file.size }, 15000);
                let pos = 0;
                while (pos < p.file.size) {
                    const end = Math.min(pos + IMPORT_CHUNK, p.file.size);
                    const buf = await p.file.slice(pos, end).arrayBuffer();
                    await this.call('writeChunk', { token: begin.token, bytes: buf }, 30000, [buf]);
                    done += end - pos;
                    pos = end;
                    report(done);
                }
                await this.call('writeEnd', { token: begin.token }, 15000);
            }

            const meta: StoredDictMeta = {
                id: storeId,
                name: opts.name,
                language: opts.language,
                importedAt: Date.now(),
                totalSize: total,
                slots: { mdx: 'dict.mdx', ...(css ? { css: 'style.css' } : {}) },
                mddSlots: mdd.map((_, i) => (i === 0 ? 'res.mdd' : `res.${i + 1}.mdd`)),
                files: plan.map((p) => ({ slot: p.slot, origName: p.file.name, size: p.file.size })),
            };
            await this.writeStoreText(storeId, 'meta.json', JSON.stringify(meta));
            return { kind: 'opfs', meta };
        } catch (e) {
            // 失败清理:关闭写会话并递归删除半成品目录,不留占用存储的残骸
            try { await this.call('abortImport', { storeId }, 10000); } catch { /* 尽力而为 */ }
            throw e;
        } finally {
            this.currentImport = null;
            this.notifyImport();
        }
    }

    /** 小文本文件(meta.json)经 Worker 同步句柄写入 */
    private async writeStoreText(storeId: string, slot: string, text: string): Promise<void> {
        const begin = await this.call('writeBegin', { storeId, slot, size: text.length }, 15000);
        const buf = new TextEncoder().encode(text).buffer;
        await this.call('writeChunk', { token: begin.token, bytes: buf }, 15000, [buf]);
        await this.call('writeEnd', { token: begin.token }, 15000);
    }

    async unload(dictId: string): Promise<void> {
        const entry = this.engines.get(dictId);
        if (!entry) return;
        this.engines.delete(dictId);
        if (entry.kind === 'memory' && entry.engine) {
            try { entry.engine.close(); } catch { /* 忽略 */ }
        } else if (this.worker) {
            try { await this.call('unload', { dictId }, 5000); } catch { /* 忽略 */ }
        }
    }

    /** 插件卸载时终止 Worker 并释放全部引擎 */
    shutdown(): void {
        this.failAll('dict service shutdown');
        for (const entry of this.engines.values()) {
            if (entry.kind === 'memory' && entry.engine) {
                try { entry.engine.close(); } catch { /* 忽略 */ }
            }
        }
        this.engines.clear();
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}

/** 全局单例:与 UnifiedDictionaryService 内 mdxEngines 缓存的地位对等 */
export const mobileDict = new MobileDictService();

/**
 * OPFS 对账:以 DictStore.list() 读出的 meta.json 为数据源修复每设备注册表
 * (注册表本体与纯计算在 storeRegistry.ts,本函数补上 OPFS 触碰)。
 *   - 条目丢失(设置曾被同步覆写/注册表损坏)而 OPFS 数据还在 → 自动恢复
 *   - OPFS 数据被系统驱逐 → 条目标 missing,由设置页提示重新导入
 * 顺带再申请一次持久化(persist() 可在存储压力下被系统延后授予)。
 */
export async function reconcileStoreDicts(): Promise<{ restored: number; missingCount: number }> {
    void DictStore.requestPersist();
    let metas: StoredDictMeta[] = [];
    try {
        metas = await DictStore.list();
    } catch {
        // OPFS 不可用(异常环境):保持注册表现状,不影响启动
        metas = [];
    }
    const outcome = computeReconcile(loadStoreDicts(), metas);
    if (outcome.changed) {
        applyStoreDicts(outcome.next);
    }
    return { restored: outcome.restored.length, missingCount: outcome.missingCount };
}
