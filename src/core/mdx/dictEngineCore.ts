// @ts-nocheck
/**
 * 平台无关词典引擎核心 — 桌面 MDXEngine(src/core/MDXEngine.ts)查词/资源策略的精确镜像,
 * 数据源为 ScannerBackend。被两处共用:
 *   - dictWorker:OPFS 同步句柄后端(移动端主路径)
 *   - MobileDictService:内存后端(降级档)
 * 与桌面行为的差异应保持为零;vendor 层保真由 scripts/mdx-parity.mjs 把关,
 * 本层策略与 MDXEngine.lookup / MDXEngine.getResource 逐行对应。
 */
import { MDX, MDD } from './vendor/index.js';
import type { ScannerBackend } from './ScannerBackend';

export interface DictEngineFile {
    /** 原始文件名(仅用于扩展名/版本嗅探,不做 IO) */
    fname: string;
    backend: ScannerBackend;
}

export interface DictEngineInit {
    mdx: DictEngineFile;
    /** MDD 卷,按加载顺序(主卷在前,编号卷在后) */
    mdd: DictEngineFile[];
    css: string | null;
}

export interface DictEngineHandle {
    wordCount: number;
    css: string | null;
    lookup(word: string): string | null;
    getResource(path: string): Uint8Array | null;
    close(): void;
}

/** atob -> Uint8Array(vendor MDD.locate 返回 base64 字符串) */
function u8FromBase64(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

export function createDictEngine(init: DictEngineInit): DictEngineHandle {
    const mdx = new MDX(init.mdx.fname, { backend: init.mdx.backend });
    const mdds = init.mdd.map((f) => new MDD(f.fname, { backend: f.backend }));

    function lookupRaw(word: string): string | null {
        try {
            const r = mdx.lookup(word);
            return r ? r.definition : null;
        } catch {
            return null;
        }
    }

    // ── 对应 MDXEngine.lookup:原词 -> 小写 -> 首字母大写三级尝试 + @@@LINK 一跳 ──
    function lookup(word: string, followRedirects: boolean = true): string | null {
        let html = lookupRaw(word);
        if (!html) html = lookupRaw(word.toLowerCase());
        if (!html) {
            const capitalized = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            html = lookupRaw(capitalized);
        }
        if (html && typeof html === 'string' && followRedirects) {
            // MDX 重定向形如 "@@@LINK=run"(大小写随词典;牛津十为大写,带尾部 CRLF/NUL)。
            // 取首个行/NULL 终止符前的目标词,跟随一跳。
            const linkMatch = html.match(/^@@@link=([^\r\n\0]+)/i);
            if (linkMatch) {
                return lookup(linkMatch[1].trim(), false);
            }
        }
        return typeof html === 'string' ? html : null;
    }

    // ── 对应 MDXEngine.buildPathCandidates:5 种斜杠/大小写路径变体 ──
    function buildPathCandidates(rawPath: string): string[] {
        const candidates: string[] = [];
        const path = rawPath.trim();

        // 变体 1: 反斜杠 + 前导反斜杠(最常见)
        let v1 = path.replace(/\//g, '\\');
        if (!v1.startsWith('\\')) v1 = '\\' + v1;
        candidates.push(v1);
        // 变体 2: 变体 1 的小写
        candidates.push(v1.toLowerCase());
        // 变体 3: 无前导反斜杠
        candidates.push(v1.replace(/^\\/, ''));
        // 变体 4: 正斜杠,无前导斜杠
        candidates.push(path.replace(/^\\/, '').replace(/\\/g, '/'));
        // 变体 5: 正斜杠 + 前导斜杠
        let v5 = path.replace(/\\/g, '/');
        if (!v5.startsWith('/')) v5 = '/' + v5;
        candidates.push(v5);

        return [...new Set(candidates)];
    }

    // ── 对应 MDXEngine.getResource:URL 解码 + 变体二分 + 线性大小写兜底 ──
    function getResource(resourcePath: string): Uint8Array | null {
        if (mdds.length === 0) return null;

        let decodedPath = resourcePath;
        try {
            decodedPath = decodeURIComponent(resourcePath);
        } catch {
            // 解码失败则用原路径
        }

        const candidates = buildPathCandidates(decodedPath);

        for (const mdd of mdds) {
            // 策略 1: 逐变体二分查找(快)
            for (const candidate of candidates) {
                try {
                    const result = mdd.locate(candidate);
                    if (result && result.definition) {
                        return u8FromBase64(result.definition);
                    }
                } catch {
                    // 换下一个变体
                }
            }

            // 策略 2: 线性大小写不敏感扫描(慢但可靠)
            const list = mdd.keywordList;
            if (!list || list.length === 0) continue;
            const normalized = decodedPath.replace(/\\/g, '/').toLowerCase().replace(/^\//, '');
            for (let i = 0; i < list.length; i++) {
                const keyText = list[i].keyText;
                const keyNormalized = keyText.replace(/\\/g, '/').toLowerCase().replace(/^\//, '');
                if (keyNormalized === normalized) {
                    try {
                        const record = mdd.lookupRecordByKeyBlock(list[i]);
                        if (record) return record;
                    } catch {
                        // 继续扫描
                    }
                }
            }
        }
        return null;
    }

    return {
        get wordCount() { return (mdx.keywordList && mdx.keywordList.length) || 0; },
        get css() { return init.css; },
        lookup,
        getResource,
        close() {
            try { mdx.close(); } catch { /* 忽略 */ }
            for (const mdd of mdds) {
                try { mdd.close(); } catch { /* 忽略 */ }
            }
            init.mdx.backend.close();
            for (const f of init.mdd) f.backend.close();
        },
    };
}
