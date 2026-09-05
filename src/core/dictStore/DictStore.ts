// @ts-nocheck
/**
 * 移动端词典存储层(欧路模式:导入一次,永久离线)。
 *
 * OPFS 布局:/lme-dicts/{storeId}/ 槽位(dict.mdx / res.mdd / res.2.mdd / style.css / meta.json)。
 * 写入与读取都走 dictWorker 的同步句柄(见 MobileDictService.import / dictWorker.ts);
 * Safari 的 createWritable 会把已写数据滞留内存,大词典导入会触发 jetsam 反复重载,故弃用。
 *
 * 本文件保留:文件分类、内存降级档(会话级,单本上限 MEMORY_LIMIT_BYTES)、
 * 用量/删除/列举等不依赖 Worker 的管理操作。
 */
import { randomUUID } from '../../mocks/crypto';

export const DICT_STORE_ROOT = 'lme-dicts';

/** 降级档单本词典体积上限(与 PLAN-mobile-mdx.md 回退档一致) */
export const MEMORY_LIMIT_BYTES = 100 * 1024 * 1024;

export interface StoredFileMeta {
    slot: string;
    origName: string;
    size: number;
}

export interface StoredDictMeta {
    id: string;
    name: string;
    language: string;
    importedAt: number;
    totalSize: number;
    slots: { mdx: string; css?: string };
    mddSlots: string[];
    files: StoredFileMeta[];
}

/** 内存降级档的数据集(会话级) */
export interface MemoryDictSet {
    id: string;
    name: string;
    language: string;
    mdx: { fname: string; buffer: ArrayBuffer };
    mdd: Array<{ fname: string; buffer: ArrayBuffer }>;
    css: string | null;
    totalSize: number;
}

/** 会话级内存降级注册表,由 MobileDictService 消费 */
export const memoryDictRegistry = new Map<string, MemoryDictSet>();

export interface ClassifiedDictFiles {
    mdx: File | null;
    css: File | null;
    mdd: File[];
}

/** 分类用户选择的文件:.mdx 单本 / .css 单个 / .mdd 任意多卷 */
export function classifyDictFiles(files: File[]): ClassifiedDictFiles {
    let mdx: File | null = null;
    let css: File | null = null;
    const mdd: File[] = [];
    for (const f of files) {
        const lower = f.name.toLowerCase();
        if (lower.endsWith('.mdx')) {
            if (!mdx || f.size > mdx.size) mdx = f;
        } else if (lower.endsWith('.mdd')) {
            mdd.push(f);
        } else if (lower.endsWith('.css')) {
            css = css || f;
        }
    }
    // MDD 排序:与 MDX 同词干的主卷在前,编号卷按序号升序,其余按名称
    if (mdx) {
        const stem = mdx.name.toLowerCase().replace(/\.mdx$/, '');
        const volumeNo = (name: string): number => {
            const m = name.toLowerCase().match(/\.(\d+)\.mdd$/);
            return m ? parseInt(m[1], 10) : -1;
        };
        mdd.sort((a, b) => {
            const aStem = a.name.toLowerCase().startsWith(stem);
            const bStem = b.name.toLowerCase().startsWith(stem);
            if (aStem !== bStem) return aStem ? -1 : 1;
            return volumeNo(a.name) - volumeNo(b.name) || a.name.localeCompare(b.name);
        });
    }
    return { mdx, css, mdd };
}

/**
 * 内存降级档导入:整文件读入,注册到 memoryDictRegistry(会话级)。
 * 单本总量超 MEMORY_LIMIT_BYTES 抛 MEMORY_LIMIT_EXCEEDED。
 */
export async function importToMemory(
    classified: ClassifiedDictFiles,
    opts: { name?: string; language: string },
    onProgress?: (done: number, total: number) => void
): Promise<MemoryDictSet> {
    const { mdx, css, mdd } = classified;
    if (!mdx) throw new Error('NO_MDX_FILE');
    const total = mdx.size + mdd.reduce((s, f) => s + f.size, 0) + (css ? css.size : 0);
    if (total > MEMORY_LIMIT_BYTES) {
        throw new Error('MEMORY_LIMIT_EXCEEDED');
    }
    const storeId = randomUUID();
    let done = 0;
    const step = (n: number) => {
        done += n;
        onProgress && onProgress(done, total);
    };

    const mdxBuf = await mdx.arrayBuffer();
    step(mdx.size);
    const mddBufs: Array<{ fname: string; buffer: ArrayBuffer }> = [];
    for (const f of mdd) {
        mddBufs.push({ fname: f.name, buffer: await f.arrayBuffer() });
        step(f.size);
    }
    let cssText: string | null = null;
    if (css) {
        cssText = await css.text();
        step(css.size);
    }

    const set: MemoryDictSet = {
        id: storeId,
        name: opts.name || mdx.name.replace(/\.mdx$/i, ''),
        language: opts.language,
        mdx: { fname: mdx.name, buffer: mdxBuf },
        mdd: mddBufs,
        css: cssText,
        totalSize: total,
    };
    memoryDictRegistry.set(storeId, set);
    return set;
}

function formatBytes(n: number): string {
    if (n >= 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
    return Math.max(1, Math.round(n / 1024)) + ' KB';
}

async function getRootDir(create: boolean): Promise<any> {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(DICT_STORE_ROOT, { create });
}

export class DictStore {
    /** 申请持久化,降低系统存储驱逐概率 */
    static async requestPersist(): Promise<boolean> {
        try {
            if (navigator.storage && typeof navigator.storage.persist === 'function') {
                return await navigator.storage.persist();
            }
        } catch {
            // 忽略
        }
        return false;
    }

    static async usage(): Promise<{ usage: number; quota: number } | null> {
        try {
            const est = await (navigator.storage && navigator.storage.estimate
                ? navigator.storage.estimate()
                : null);
            if (est && typeof est.usage === 'number') {
                return { usage: est.usage, quota: est.quota || 0 };
            }
        } catch {
            // 忽略
        }
        return null;
    }

    /** 删除持久存储的词典(内存降级档一并清理) */
    static async delete(storeId: string): Promise<void> {
        try {
            const base = await getRootDir(false);
            await base.removeEntry(storeId, { recursive: true });
        } catch {
            // 目录不存在视为已删除
        }
        memoryDictRegistry.delete(storeId);
    }

    static clearMemory(storeId: string): void {
        memoryDictRegistry.delete(storeId);
    }

    /** 列出持久存储的全部词典 meta(用于诊断/管理) */
    static async list(): Promise<StoredDictMeta[]> {
        try {
            const base = await getRootDir(false);
            const metas: StoredDictMeta[] = [];
            for await (const [name, handle] of base.entries()) {
                if (handle.kind !== 'directory') continue; // 跳过 .probe 等杂项文件
                try {
                    const metaFh = await handle.getFileHandle('meta.json');
                    const f = await metaFh.getFile();
                    metas.push(JSON.parse(await f.text()));
                } catch {
                    // 单条损坏跳过
                }
            }
            return metas;
        } catch {
            return [];
        }
    }
}

export { formatBytes };
