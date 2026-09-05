/**
 * 移动端导入式词典的每设备注册表(localStorage)。
 *
 * 词典数据在 OPFS(每设备 WebView 私有存储),而引用条目在 3.2.0 曾存于
 * settings.localDictionaries → data.json——data.json 随 vault 同步,会被同 vault
 * 桌面端的 saveSettings 用旧快照覆写(iCloud/Obsidian Sync),手机重启后词典"消失"。
 * 与 syncDeviceId 同一原则:每物理设备的状态放 localStorage,
 * 绝不进 data.json(见 main-unified-full.ts 头部注释与 storeRegistry 迁移说明)。
 *
 * 注册表与 OPFS 同属 WebView 存储,同生共死;OPFS 对账(computeReconcile)以
 * meta.json 为恢复数据源:条目丢失但数据还在 → 自动恢复;数据被系统驱逐 →
 * 条目标 missing,由设置页提示重新导入,不静默删除。
 *
 * 本模块保持零 obsidian 依赖(不 import mocks/crypto/DictStore),可被
 * scripts/verify-store-registry.ts 直接打包进 node 冒烟测试。
 */

/** localStorage key,遵循仓库 `lme.` 点前缀的每设备状态命名习惯 */
export const STORE_DICTS_KEY = 'lme.mobileDicts.v1';

export interface StoreDictEntry {
    id: string;
    name: string;
    storeId: string;
    sizeBytes: number;
    /** OPFS 数据已被系统清理(对账发现);UI 显示"数据丢失",服务层跳过查词 */
    missing?: boolean;
    /** 内存降级档导入,仅本次会话有效,只存内存缓存不落盘 */
    ephemeral?: boolean;
}

export type StoreDictMap = Record<string, StoreDictEntry[]>;

/** OPFS meta.json 的最小字段(结构见 DictStore.StoredDictMeta,这里只取对账所需) */
export interface ReconcileMeta {
    id: string;
    name?: string;
    language?: string;
    totalSize?: number;
}

// ── 模块级缓存(会话内唯一事实源;ephemeral 条目只在这里) ─────────────
let cache: StoreDictMap | null = null;

function sanitizeEntry(e: any): StoreDictEntry | null {
    if (!e || typeof e !== 'object' || typeof e.storeId !== 'string' || !e.storeId) return null;
    return {
        id: typeof e.id === 'string' && e.id ? e.id : `store_${e.storeId}`,
        name: typeof e.name === 'string' && e.name ? e.name : e.storeId,
        storeId: e.storeId,
        sizeBytes: typeof e.sizeBytes === 'number' ? e.sizeBytes : 0,
        ...(e.missing === true ? { missing: true } : {}),
        ...(e.ephemeral === true ? { ephemeral: true } : {}),
    };
}

function loadFromStorage(): StoreDictMap {
    const map: StoreDictMap = {};
    try {
        if (typeof window === 'undefined' || !window.localStorage) return map;
        const raw = window.localStorage.getItem(STORE_DICTS_KEY);
        if (!raw) return map;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return map;
        for (const lang of Object.keys(parsed)) {
            if (!Array.isArray(parsed[lang])) continue;
            const entries = parsed[lang]
                .map(sanitizeEntry)
                .filter((e: StoreDictEntry | null): e is StoreDictEntry => e !== null);
            if (entries.length > 0) map[lang] = entries;
        }
    } catch {
        // localStorage 不可用/内容损坏:按空注册表处理,由对账从 OPFS 恢复
    }
    return map;
}

/** ephemeral 条目会话级,不落盘 */
function persist(map: StoreDictMap): void {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return;
        const out: StoreDictMap = {};
        for (const lang of Object.keys(map)) {
            const arr = map[lang].filter(e => !e.ephemeral);
            if (arr.length > 0) out[lang] = arr;
        }
        window.localStorage.setItem(STORE_DICTS_KEY, JSON.stringify(out));
    } catch {
        // 写入失败退化为会话级;OPFS 数据仍在,对账可恢复
    }
}

/** 读取注册表(懒加载进缓存);返回的是缓存本体,调用方勿原地修改 */
export function loadStoreDicts(): StoreDictMap {
    if (!cache) cache = loadFromStorage();
    return cache;
}

/** 对账结果整体写回(替换缓存并落盘) */
export function applyStoreDicts(next: StoreDictMap): void {
    cache = next;
    persist(cache);
}

export function getStoreDicts(language: string): StoreDictEntry[] {
    return loadStoreDicts()[language] || [];
}

export function addStoreDict(language: string, entry: StoreDictEntry): void {
    const map = loadStoreDicts();
    const known = new Set((map[language] || []).map(e => e.storeId));
    if (known.has(entry.storeId)) {
        // 同一 OPFS 槽位重复导入(如对账恢复后再手动重导):原位覆盖
        map[language] = (map[language] || []).map(e => (e.storeId === entry.storeId ? entry : e));
    } else {
        map[language] = [...(map[language] || []), entry];
    }
    persist(map);
}

export function removeStoreDict(dictId: string): void {
    const map = loadStoreDicts();
    let changed = false;
    for (const lang of Object.keys(map)) {
        if (map[lang].some(e => e.id === dictId)) {
            map[lang] = map[lang].filter(e => e.id !== dictId);
            changed = true;
        }
    }
    if (changed) persist(map);
}

/** 语言内在位移动;越界返回 false */
export function moveStoreDict(language: string, dictId: string, delta: number): boolean {
    const map = loadStoreDicts();
    const arr = map[language] || [];
    const pos = arr.findIndex(e => e.id === dictId);
    const npos = pos + delta;
    if (pos === -1 || npos < 0 || npos >= arr.length) return false;
    const next = [...arr];
    next.splice(npos, 0, next.splice(pos, 1)[0]);
    map[language] = next;
    persist(map);
    return true;
}

// ── data.json → 注册表 迁移(3.2.0 兼容) ────────────────────────────

/**
 * 纯函数:把 source==='store' 条目从 localDictionaries 各语言数组中拆出。
 * 返回净化后的 map(路径条目保留;清空的语言保留空数组键,维持
 * migrateToLocalDictionaries 的"已初始化"早退语义)与规范化的 store 条目。
 */
export function splitStoreEntries(map: any): {
    clean: Record<string, any[]>;
    extracted: Array<{ language: string; entry: StoreDictEntry }>;
} {
    const clean: Record<string, any[]> = {};
    const extracted: Array<{ language: string; entry: StoreDictEntry }> = [];
    if (!map || typeof map !== 'object') return { clean, extracted };
    for (const lang of Object.keys(map)) {
        const arr = Array.isArray(map[lang]) ? map[lang] : [];
        const rest: any[] = [];
        for (const d of arr) {
            if (d && typeof d === 'object' && d.source === 'store' && typeof d.storeId === 'string' && d.storeId) {
                const e = sanitizeEntry(d);
                if (e) {
                    extracted.push({ language: lang, entry: e });
                    continue;
                }
            }
            rest.push(d);
        }
        clean[lang] = rest;
    }
    return { clean, extracted };
}

/**
 * 迁移入口:settings.localDictionaries 仅留桌面路径条目;toRegistry(移动端)时
 * store 条目并入注册表(按 storeId 去重),桌面端直接丢弃(那是手机 OPFS 的数据,
 * 在桌面不可用,留存只会让桌面设置页渲染崩溃)。返回 settings 是否被修改。
 */
export function migrateStoreEntriesFromSettings(settings: any, opts: { toRegistry: boolean }): boolean {
    const map = settings && settings.localDictionaries;
    if (!map || typeof map !== 'object') return false;
    const { clean, extracted } = splitStoreEntries(map);
    if (extracted.length === 0) return false;
    settings.localDictionaries = clean;
    if (opts.toRegistry) {
        const registry = loadStoreDicts();
        const known = new Set(Object.values(registry).flatMap(arr => arr.map(e => e.storeId)));
        for (const { language, entry } of extracted) {
            if (known.has(entry.storeId)) continue;
            registry[language] = [...(registry[language] || []), entry];
            known.add(entry.storeId);
        }
        persist(registry);
    }
    return true;
}

// ── OPFS 对账(纯计算;OPFS 触碰在 MobileDictService.reconcileStoreDicts) ──

export interface ReconcileOutcome {
    /** 对账后的完整注册表(不可变构建;空语言键被丢弃) */
    next: StoreDictMap;
    /** 从 OPFS meta 自动恢复的条目(用于通知) */
    restored: StoreDictEntry[];
    /** 数据丢失(标 missing)的条目数 */
    missingCount: number;
    /** 注册表是否发生变化 */
    changed: boolean;
}

/**
 * 纯函数:注册表 vs OPFS meta 对账。
 *   - 注册表有、OPFS 无 → 标 missing(数据被系统驱逐;不自动删,UI 提示重导)
 *   - OPFS 有、注册表无 → 按 meta.language 自动恢复(条目曾被同步覆写/注册表损坏)
 *   - ephemeral(内存档)条目不参与对账,原样保留
 */
export function computeReconcile(registry: StoreDictMap, metas: ReconcileMeta[]): ReconcileOutcome {
    const present = new Set(metas.filter(m => m && typeof m.id === 'string' && m.id).map(m => m.id));
    const next: StoreDictMap = {};
    const registered = new Set<string>();
    const restored: StoreDictEntry[] = [];
    let missingCount = 0;
    let changed = false;

    for (const lang of Object.keys(registry)) {
        const out = (registry[lang] || []).map(e => {
            registered.add(e.storeId);
            if (e.ephemeral) return e;
            const isMissing = !present.has(e.storeId);
            const wasMissing = e.missing === true;
            if (isMissing) missingCount += 1;
            if (isMissing !== wasMissing) {
                changed = true;
                return isMissing ? { ...e, missing: true } : { ...e, missing: undefined };
            }
            return e;
        });
        if (out.length > 0) next[lang] = out;
    }

    for (const m of metas) {
        if (!m || typeof m.id !== 'string' || !m.id || registered.has(m.id)) continue;
        const lang = (typeof m.language === 'string' && m.language) || 'english';
        const entry: StoreDictEntry = {
            id: `store_${m.id}`,
            name: (typeof m.name === 'string' && m.name) || m.id,
            storeId: m.id,
            sizeBytes: typeof m.totalSize === 'number' ? m.totalSize : 0,
        };
        next[lang] = [...(next[lang] || []), entry];
        registered.add(m.id);
        restored.push(entry);
        changed = true;
    }

    return { next, restored, missingCount, changed };
}
