/**
 * YouTube 订阅数据的独立持久层(插件目录 sidecar youtube-rss.json)。
 *
 * 订阅/分类/条目在 3.5.x 曾存于 settings → data.json——data.json 随 vault
 * 同步,会被同 vault 另一端的 saveSettings 用旧全量快照覆写(iCloud/Obsidian
 * Sync),一端刚添加的订阅被另一端抹掉(与词典"消失"、aiPrompts 清空同一
 * 根因,见 storeRegistry.ts 头注与 main-unified-full.ts 的 aiPrompts sidecar)。
 * 定时刷新每 15-30 分钟全量重写 data.json(含最多 2000 条 feed 条目),进一步
 * 放大了同步冲突窗口。3.6.0 起主存储迁至本 sidecar,settings 三字段仅作
 * 一次性迁移源(旧 data.json 里的残留可被下次启动重新吸收,自愈)。
 *
 * 抗覆写机制:每次落盘前先读文件、与内存态做并集合并再写(read-merge-write),
 * 本进程的旧快照不再能抹掉另一端刚写入的数据;删除靠墓碑(removed.*,
 * removedAt >= createdAt 的实体在合并中被跳过)跨端传播,防止已删订阅被旧
 * 快照复活——与闪卡同步 payload v4 的墓碑方案同一思路。
 *
 * 本模块保持零 obsidian 依赖(类型经 import type 引入,编译期擦除),可被
 * scripts/verify-youtube-rss-store.mjs 直接打包进 node 冒烟测试。
 */
import type { YouTubeFeedItem, YouTubeItemStatus, YouTubeSubscription } from './youtube-rss';

export const YOUTUBE_RSS_STORE_VERSION = 1;
/** 墓碑上限(每张表):超过后按 removedAt 保留最新,防止无限增长。 */
export const MAX_TOMBSTONES = 100;
/** 条目总量上限(所有频道合计),防 sidecar 随时间无限膨胀。 */
export const MAX_ITEMS = 2000;
/** 条目保留窗口:丢弃发布时间早于该窗口的视频。 */
export const RETENTION_DAYS = 90;
const RETENTION_MS = RETENTION_DAYS * 86400000;

export interface YouTubeRssStore {
    version: number;
    subscriptions: YouTubeSubscription[];
    categories: string[];
    items: YouTubeFeedItem[];
    /** 墓碑:实体键(channelId / 分类名)→ 删除时刻(ms)。合并时 removedAt >= 实体 createdAt 则跳过该实体。 */
    removed: {
        subscriptions: Record<string, number>;
        categories: Record<string, number>;
    };
}

/** 条目状态推进秩:高者胜。failed 视为比 read 更"新"的一次显式操作,imported 是终态。 */
const STATUS_RANK: Record<YouTubeItemStatus, number> = { new: 0, read: 1, failed: 2, imported: 3 };

export function emptyStore(): YouTubeRssStore {
    return { version: YOUTUBE_RSS_STORE_VERSION, subscriptions: [], categories: [], items: [], removed: { subscriptions: {}, categories: {} } };
}

// ── 消毒与序列化 ─────────────────────────────────────────────────────────

function str(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function num(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function optStr(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
}

function sanitizeSubscription(raw: unknown): YouTubeSubscription | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const channelId = str(r.channelId);
    if (!channelId) return null;
    return {
        id: str(r.id) || channelId,
        channelId,
        channelName: str(r.channelName) || channelId,
        channelUrl: str(r.channelUrl),
        feedUrl: str(r.feedUrl),
        createdAt: num(r.createdAt),
        lastCheckedAt: num(r.lastCheckedAt),
        ...(optStr(r.lastError) !== undefined ? { lastError: optStr(r.lastError) } : {}),
        ...(optStr(r.etag) !== undefined ? { etag: optStr(r.etag) } : {}),
        ...(optStr(r.lastModified) !== undefined ? { lastModified: optStr(r.lastModified) } : {}),
        ...(optStr(r.category) !== undefined ? { category: optStr(r.category) } : {}),
    };
}

function sanitizeStatus(value: unknown): YouTubeItemStatus {
    return value === 'read' || value === 'imported' || value === 'failed' ? value : 'new';
}

function sanitizeItem(raw: unknown): YouTubeFeedItem | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const itemId = str(r.itemId);
    const subscriptionId = str(r.subscriptionId);
    const videoId = str(r.videoId);
    if (!itemId || !subscriptionId || !videoId) return null;
    return {
        videoId,
        title: str(r.title) || videoId,
        url: str(r.url),
        channelId: str(r.channelId),
        channelName: str(r.channelName),
        publishedAt: str(r.publishedAt),
        updatedAt: str(r.updatedAt) || str(r.publishedAt),
        thumbnailUrl: str(r.thumbnailUrl),
        itemId,
        subscriptionId,
        discoveredAt: num(r.discoveredAt),
        status: sanitizeStatus(r.status),
        ...(optStr(r.notePath) !== undefined ? { notePath: optStr(r.notePath) } : {}),
        ...(optStr(r.error) !== undefined ? { error: optStr(r.error) } : {}),
    };
}

function sanitizeNumberMap(raw: unknown): Record<string, number> {
    const out: Record<string, number> = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    }
    return out;
}

function sanitizeStore(raw: Record<string, unknown>): YouTubeRssStore {
    const subs = Array.isArray(raw.subscriptions)
        ? raw.subscriptions.map(sanitizeSubscription).filter((s): s is YouTubeSubscription => s !== null)
        : [];
    const items = Array.isArray(raw.items)
        ? raw.items.map(sanitizeItem).filter((i): i is YouTubeFeedItem => i !== null)
        : [];
    const categories = Array.isArray(raw.categories) ? raw.categories.filter((c): c is string => typeof c === 'string' && !!c) : [];
    const removedRaw = (raw.removed && typeof raw.removed === 'object' && !Array.isArray(raw.removed) ? raw.removed : {}) as Record<string, unknown>;
    return {
        version: num(raw.version, YOUTUBE_RSS_STORE_VERSION),
        subscriptions: subs,
        categories,
        items,
        removed: {
            subscriptions: sanitizeNumberMap(removedRaw.subscriptions),
            categories: sanitizeNumberMap(removedRaw.categories),
        },
    };
}

/**
 * 宽容解析:JSON 损坏/非对象 → null(调用方负责保留原件并重建);
 * 字段缺失/类型异常逐项消毒,不视为损坏(version 高于当前也宽容读取,降级安全)。
 */
export function parseStore(raw: string): YouTubeRssStore | null {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return null; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return sanitizeStore(parsed as Record<string, unknown>);
}

function sortSubscriptions(subs: YouTubeSubscription[]): YouTubeSubscription[] {
    return [...subs].sort((a, b) => a.createdAt - b.createdAt || a.channelId.localeCompare(b.channelId));
}

function sortItems(items: YouTubeFeedItem[]): YouTubeFeedItem[] {
    return [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || b.discoveredAt - a.discoveredAt);
}

/** 固定字段序 + 条目排序,保证同等内存态序列化结果稳定(no-op 写盘跳过依赖于此)。 */
export function serializeStore(store: YouTubeRssStore): string {
    return JSON.stringify({
        version: YOUTUBE_RSS_STORE_VERSION,
        subscriptions: sortSubscriptions(store.subscriptions),
        categories: [...store.categories],
        items: sortItems(store.items),
        removed: { subscriptions: { ...store.removed.subscriptions }, categories: { ...store.removed.categories } },
    });
}

// ── 合并(read-merge-write 的核心) ────────────────────────────────────────

/** 实体被墓碑挡住:removedAt 不早于其 createdAt(同刻视为已删,重加须产生新的 createdAt)。 */
function tombstoned(removedAt: number | undefined, createdAt: number): boolean {
    return typeof removedAt === 'number' && removedAt >= createdAt;
}

/** 墓碑并集:合并永不新增或抹除墓碑,只有裁剪会丢最旧的。 */
function mergeTombstones(file: YouTubeRssStore, memory: YouTubeRssStore): YouTubeRssStore['removed'] {
    const merge = (a: Record<string, number>, b: Record<string, number>) => {
        const out = { ...a };
        for (const [key, value] of Object.entries(b)) out[key] = Math.max(out[key] ?? 0, value);
        return out;
    };
    return {
        subscriptions: merge(file.removed.subscriptions, memory.removed.subscriptions),
        categories: merge(file.removed.categories, memory.removed.categories),
    };
}

/** file 侧与 memory 侧同频道的收敛;单侧字段规则见函数体内注释。 */
function mergeSubscription(file: YouTubeSubscription, memory: YouTubeSubscription): YouTubeSubscription {
    const newer = memory.lastCheckedAt >= file.lastCheckedAt ? memory : file;
    return {
        // id 取 file 侧:条目键 itemId = `${subscriptionId}:`,沿用磁盘上的 id 让既有条目不成孤儿
        id: file.id,
        channelId: file.channelId,
        channelUrl: file.channelUrl || memory.channelUrl,
        feedUrl: file.feedUrl || memory.feedUrl,
        createdAt: Math.min(file.createdAt, memory.createdAt),
        lastCheckedAt: Math.max(file.lastCheckedAt, memory.lastCheckedAt),
        channelName: newer.channelName,
        ...(newer.etag !== undefined ? { etag: newer.etag } : {}),
        ...(newer.lastModified !== undefined ? { lastModified: newer.lastModified } : {}),
        ...(newer.lastError !== undefined ? { lastError: newer.lastError } : {}),
        // category 取 memory 侧(本端最新操作意图优先,含"移回未分类"的 undefined)
        ...(memory.category !== undefined ? { category: memory.category } : {}),
    };
}

/** 单条目收敛:状态秩高者提供主体字段;notePath 非空者胜;discoveredAt 取早。 */
function mergeItem(file: YouTubeFeedItem, memory: YouTubeFeedItem): YouTubeFeedItem {
    const fileRank = STATUS_RANK[file.status];
    const memoryRank = STATUS_RANK[memory.status];
    let winner: YouTubeFeedItem;
    if (fileRank === memoryRank) {
        // 同秩 failed 取带错误信息的一侧(都有或都无则取 file);其余同秩取 file
        winner = file.status === 'failed' && memory.status === 'failed'
            ? (memory.error ? memory : file)
            : file;
    } else {
        winner = memoryRank > fileRank ? memory : file;
    }
    const notePath = file.notePath || memory.notePath;
    return {
        ...winner,
        discoveredAt: Math.min(file.discoveredAt, memory.discoveredAt),
        ...(notePath !== undefined ? { notePath } : {}),
    };
}

/** 孤儿清理:条目挂着的订阅已不存在(对端删除后墓碑过滤/本端删除)则丢弃。 */
function dropOrphanItems(store: YouTubeRssStore): YouTubeRssStore {
    const ids = new Set(store.subscriptions.map((sub) => sub.id));
    return { ...store, items: store.items.filter((item) => ids.has(item.subscriptionId)) };
}

/**
 * 对称并集合并。file = 刚从磁盘读到的侧,memory = 本进程内存侧。
 * 幂等:mergeStores(mergeStores(f, m), m) 与 mergeStores(f, m) 深相等。
 */
export function mergeStores(file: YouTubeRssStore, memory: YouTubeRssStore, now: number): YouTubeRssStore {
    const removed = mergeTombstones(file, memory);

    const byChannel = new Map<string, YouTubeSubscription>();
    for (const sub of file.subscriptions) {
        if (tombstoned(removed.subscriptions[sub.channelId], sub.createdAt)) continue;
        byChannel.set(sub.channelId, sub);
    }
    for (const sub of memory.subscriptions) {
        if (tombstoned(removed.subscriptions[sub.channelId], sub.createdAt)) continue;
        const existing = byChannel.get(sub.channelId);
        byChannel.set(sub.channelId, existing ? mergeSubscription(existing, sub) : sub);
    }
    const subscriptions = sortSubscriptions([...byChannel.values()]);

    const categories: string[] = [];
    const seenCategory = new Set<string>();
    for (const name of [...file.categories, ...memory.categories]) {
        // 分类名无 createdAt 可比:出现在墓碑表里即视为已删
        if (seenCategory.has(name) || removed.categories[name] !== undefined) continue;
        seenCategory.add(name);
        categories.push(name);
    }

    const byItem = new Map<string, YouTubeFeedItem>();
    for (const item of file.items) byItem.set(item.itemId, item);
    for (const item of memory.items) {
        const existing = byItem.get(item.itemId);
        byItem.set(item.itemId, existing ? mergeItem(existing, item) : item);
    }

    return applyRetention(dropOrphanItems(pruneTombstones({
        version: YOUTUBE_RSS_STORE_VERSION,
        subscriptions,
        categories,
        items: sortItems([...byItem.values()]),
        removed,
    })), now);
}

/**
 * 旧 data.json 三字段的一次性吸收:只追加 sidecar 缺失的实体,不改写已有实体
 * (sidecar 为主,legacy 只补缺)。返回 changed 供调用方决定清空 settings 与落盘。
 */
export function migrateFromSettings(store: YouTubeRssStore, legacy: {
    subscriptions?: unknown;
    items?: unknown;
    categories?: unknown;
}): { store: YouTubeRssStore; changed: boolean } {
    const sanitized = sanitizeStore({
        subscriptions: Array.isArray(legacy.subscriptions) ? legacy.subscriptions : [],
        items: Array.isArray(legacy.items) ? legacy.items : [],
        categories: Array.isArray(legacy.categories) ? legacy.categories : [],
        removed: {},
    });
    let changed = false;

    const knownChannels = new Set(store.subscriptions.map((sub) => sub.channelId));
    const subscriptions = [...store.subscriptions];
    for (const sub of sanitized.subscriptions) {
        if (knownChannels.has(sub.channelId)) continue;
        if (tombstoned(store.removed.subscriptions[sub.channelId], sub.createdAt)) continue;
        knownChannels.add(sub.channelId);
        subscriptions.push(sub);
        changed = true;
    }

    const categories = [...store.categories];
    for (const name of sanitized.categories) {
        if (categories.includes(name) || store.removed.categories[name] !== undefined) continue;
        categories.push(name);
        changed = true;
    }

    const knownItems = new Set(store.items.map((item) => item.itemId));
    const items = [...store.items];
    for (const item of sanitized.items) {
        if (knownItems.has(item.itemId)) continue;
        knownItems.add(item.itemId);
        items.push(item);
        changed = true;
    }

    return { store: dropOrphanItems({ ...store, subscriptions: sortSubscriptions(subscriptions), categories, items: sortItems(items) }), changed };
}

// ── 变换(service.commit 的操作单元,全部纯函数) ─────────────────────────

export function upsertSubscription(store: YouTubeRssStore, sub: YouTubeSubscription): YouTubeRssStore {
    const { [sub.channelId]: _cleared, ...restTombstones } = store.removed.subscriptions;
    return {
        ...store,
        subscriptions: sortSubscriptions([...store.subscriptions.filter((s) => s.id !== sub.id && s.channelId !== sub.channelId), sub]),
        removed: { ...store.removed, subscriptions: restTombstones },
    };
}

export function deleteSubscription(store: YouTubeRssStore, id: string, now: number): YouTubeRssStore {
    const target = store.subscriptions.find((sub) => sub.id === id);
    if (!target) return store;
    return {
        ...store,
        subscriptions: store.subscriptions.filter((sub) => sub.id !== id),
        items: store.items.filter((item) => item.subscriptionId !== id),
        removed: { ...store.removed, subscriptions: { ...store.removed.subscriptions, [target.channelId]: now } },
    };
}

export function patchSubscriptionInStore(store: YouTubeRssStore, id: string, patch: Partial<YouTubeSubscription>): YouTubeRssStore {
    return { ...store, subscriptions: store.subscriptions.map((sub) => sub.id === id ? { ...sub, ...patch } : sub) };
}

export function addCategoryToStore(store: YouTubeRssStore, name: string): YouTubeRssStore {
    if (store.categories.includes(name)) return store;
    const { [name]: _cleared, ...restTombstones } = store.removed.categories;
    return { ...store, categories: [...store.categories, name], removed: { ...store.removed, categories: restTombstones } };
}

export function removeCategoryFromStore(store: YouTubeRssStore, name: string, now: number): YouTubeRssStore {
    return {
        ...store,
        categories: store.categories.filter((category) => category !== name),
        subscriptions: store.subscriptions.map((sub) => sub.category === name ? { ...sub, category: undefined } : sub),
        removed: { ...store.removed, categories: { ...store.removed.categories, [name]: now } },
    };
}

export function setSubscriptionCategoryInStore(store: YouTubeRssStore, id: string, category: string | undefined): YouTubeRssStore {
    return { ...store, subscriptions: store.subscriptions.map((sub) => sub.id === id ? { ...sub, category } : sub) };
}

/** 按条目键做秩合并(与 mergeStores 的单条目规则一致),使刷新中途的用户标记不被末尾全量落盘覆盖。 */
export function upsertItems(store: YouTubeRssStore, incoming: YouTubeFeedItem[]): YouTubeRssStore {
    const byItem = new Map(store.items.map((item) => [item.itemId, item]));
    for (const item of incoming) {
        const existing = byItem.get(item.itemId);
        byItem.set(item.itemId, existing ? mergeItem(existing, item) : item);
    }
    return dropOrphanItems({ ...store, items: sortItems([...byItem.values()]) });
}

/** 替换语义:显式用户操作(markRead/markImported/markFailed)必胜,不做秩比较。 */
export function patchItem(store: YouTubeRssStore, itemId: string, patch: Partial<YouTubeFeedItem>): YouTubeRssStore {
    return { ...store, items: store.items.map((item) => item.itemId === itemId ? { ...item, ...patch } : item) };
}

/** 收敛:先按保留窗口丢弃过期条目(发布时间解析失败的保守保留),再按总量上限截断。 */
export function applyRetention(store: YouTubeRssStore, now: number): YouTubeRssStore {
    const cutoff = now - RETENTION_MS;
    const retained = store.items.filter((item) => {
        const published = Date.parse(item.publishedAt);
        return Number.isNaN(published) || published >= cutoff;
    });
    return { ...store, items: sortItems(retained).slice(0, MAX_ITEMS) };
}

/** 墓碑裁剪:每张表按 removedAt 保留最新 MAX_TOMBSTONES 条。 */
export function pruneTombstones(store: YouTubeRssStore): YouTubeRssStore {
    const prune = (map: Record<string, number>): Record<string, number> => {
        const entries = Object.entries(map);
        if (entries.length <= MAX_TOMBSTONES) return map;
        const kept = entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_TOMBSTONES);
        return Object.fromEntries(kept);
    };
    return { ...store, removed: { subscriptions: prune(store.removed.subscriptions), categories: prune(store.removed.categories) } };
}
