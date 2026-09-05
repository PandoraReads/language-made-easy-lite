import { Notice, requestUrl } from 'obsidian';
import { randomUUID } from '../mocks/crypto';
import type LanguageMadeEasyPlugin from '../main-unified-full';
import {
    extractChannelId,
    extractChannelIdFromHtml,
    mergeYouTubeItems,
    parseYouTubeFeed,
    youtubeChannelUrl,
    youtubeFeedUrl,
    type YouTubeFeedItem,
    type YouTubeSubscription,
} from './youtube-rss';
import {
    addCategoryToStore,
    applyRetention,
    deleteSubscription,
    emptyStore,
    migrateFromSettings,
    mergeStores,
    parseStore,
    patchItem,
    patchSubscriptionInStore,
    pruneTombstones,
    removeCategoryFromStore,
    serializeStore,
    setSubscriptionCategoryInStore,
    upsertItems,
    upsertSubscription,
    type YouTubeRssStore,
} from './youtube-rss-store';

interface FetchFeedResult { status: number; text: string; headers: Record<string, string | undefined> }

/** YouTube 对无/怪 User-Agent 的 feeds 请求会回 404/500,统一带浏览器 UA + 语言头。 */
const FEED_DEFAULT_HEADERS: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
};
/**
 * requestUrl 对非 2xx 直接 reject("Request failed, <status>")。经代理访问 YouTube 时
 * 同一 URL 会随机返回 404/500(出口 IP 被 YouTube 风控/节点抖动),均为瞬态,值得重试。
 */
const RETRYABLE_STATUS = new Set([404, 408, 425, 429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [1000, 2500];
/** 刷新时相邻频道间留 1s 间隔:经代理出口背靠背连发请求会加重 YouTube 风控(404/500)。 */
const SUBSCRIPTION_FETCH_SPACING_MS = 1000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 从 requestUrl 抛出的错误里提取 HTTP 状态码;网络层错误(超时/重置)无状态码返回 null。 */
function statusFromError(error: unknown): number | null {
    const message = error instanceof Error ? error.message : String(error);
    const status = Number(/Request failed,\s*(\d{3})/.exec(message)?.[1]);
    return Number.isFinite(status) && status > 0 ? status : null;
}

async function fetchYouTubeFeed(url: string, headers: Record<string, string> = {}): Promise<FetchFeedResult> {
    const merged = { ...FEED_DEFAULT_HEADERS, ...headers };
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
        try {
            const response = await requestUrl({ url, method: 'GET', headers: merged });
            return { status: response.status, text: response.text, headers: (response.headers || {}) as Record<string, string | undefined> };
        } catch (error) {
            lastError = error;
            const status = statusFromError(error);
            if (status !== null && !RETRYABLE_STATUS.has(status)) throw error;
        }
    }
    const status = statusFromError(lastError);
    throw new Error(`YouTube 请求失败${status ? `(HTTP ${status})` : '(网络错误)'},已重试 ${RETRY_DELAYS_MS.length} 次仍未成功;请检查网络/代理是否可稳定访问 YouTube`);
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

export interface YouTubeRefreshResult {
    checked: number;
    added: number;
    failed: number;
}

export class YouTubeRssService {
    /** 会话内唯一事实源;落盘走 read-merge-write(commit),不再写 settings/data.json。 */
    private store: YouTubeRssStore = emptyStore();
    private readyPromise: Promise<void> | null = null;
    private refreshPromise: Promise<YouTubeRefreshResult> | null = null;
    /** 串行化读-合-写,防刷新/标记/增删并发交错。 */
    private writeQueue: Promise<void> = Promise.resolve();

    constructor(private readonly plugin: LanguageMadeEasyPlugin) {}

    private get storePath(): string {
        return `${this.plugin.app.vault.configDir}/plugins/${this.plugin.manifest.id}/youtube-rss.json`;
    }

    get subscriptions(): YouTubeSubscription[] {
        return [...this.store.subscriptions];
    }

    get items(): YouTubeFeedItem[] {
        return [...this.store.items]
            .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || b.discoveredAt - a.discoveredAt);
    }

    /** 自定义分类列表(有序);未分类是隐含分类,不出现在此列表中。 */
    get categories(): string[] {
        return [...this.store.categories];
    }

    /**
     * 启动初始化:读 sidecar → 吸收旧 data.json 三字段(一次性迁移) → 需要时落盘。
     * IO 失败一律降级为内存态运行,不阻断启动;readyPromise 保证 resolve 不 reject
     * (main 的 onload 直接 await,初始化失败不该炸插件加载)。
     */
    async initialize(): Promise<void> {
        if (!this.readyPromise) {
            this.readyPromise = this.initializeImpl().catch((e) => {
                console.warn('[LME] YouTube 订阅数据初始化失败,按内存态继续', e);
            });
        }
        await this.readyPromise;
    }

    private async initializeImpl(): Promise<void> {
        const adapter = this.plugin.app.vault.adapter;
        let fileStore = emptyStore();
        let needsWrite = false;
        try {
            if (await adapter.exists(this.storePath)) {
                const raw = await adapter.read(this.storePath);
                const parsed = parseStore(raw);
                if (parsed) {
                    fileStore = parsed;
                } else {
                    needsWrite = true;
                    try {
                        await adapter.write(`${this.storePath}.corrupt-${Date.now()}`, raw);
                        new Notice('YouTube 订阅数据文件损坏,已重建;原文件保留为 youtube-rss.corrupt-*.json', 8000);
                    } catch (e) {
                        console.warn('[LME] youtube-rss.json 损坏原件备份失败', e);
                    }
                }
            } else {
                needsWrite = true;
            }
        } catch (e) {
            console.warn('[LME] youtube-rss.json 读取失败,按空数据继续', e);
        }

        const legacy = {
            subscriptions: Array.isArray(this.plugin.settings.youtubeSubscriptions) ? this.plugin.settings.youtubeSubscriptions : [],
            items: Array.isArray(this.plugin.settings.youtubeFeedItems) ? this.plugin.settings.youtubeFeedItems : [],
            categories: Array.isArray(this.plugin.settings.youtubeSubscriptionCategories) ? this.plugin.settings.youtubeSubscriptionCategories : [],
        };
        const migrated = migrateFromSettings(fileStore, legacy);
        this.store = pruneTombstones(migrated.store);

        if (migrated.changed || needsWrite) {
            try {
                await adapter.write(this.storePath, serializeStore(this.store));
            } catch (e) {
                console.warn('[LME] youtube-rss.json 写入失败', e);
            }
        }
        if (migrated.changed) {
            // 迁移完成即清空 data.json 三字段:此后旧快照覆写 data.json 无数据可毁,
            // 旧版本 build 在其他设备回写的残留也会在下次启动被这里重新吸收(墓碑挡住已删实体)
            this.plugin.settings.youtubeSubscriptions = [];
            this.plugin.settings.youtubeFeedItems = [];
            this.plugin.settings.youtubeSubscriptionCategories = [];
            await this.plugin.saveSettings();
            new Notice('YouTube 订阅数据已迁移到独立文件 youtube-rss.json,不再写入 data.json(防止 iCloud 同步覆盖丢失)', 8000);
        }
    }

    async addSubscription(input: string): Promise<YouTubeSubscription> {
        await this.initialize();
        // 等待进行中的后台刷新结束:同一出口 IP 上叠加请求突发更容易触发 YouTube 风控
        if (this.refreshPromise) await this.refreshPromise.catch(() => undefined);
        const channelId = await this.resolveChannelId(input);
        const existing = this.store.subscriptions.find((sub) => sub.channelId === channelId);
        if (existing) return existing;

        const subscription: YouTubeSubscription = {
            id: randomUUID(),
            channelId,
            channelName: channelId,
            channelUrl: youtubeChannelUrl(channelId),
            feedUrl: youtubeFeedUrl(channelId),
            createdAt: Date.now(),
            lastCheckedAt: 0,
        };

        const response = await fetchYouTubeFeed(subscription.feedUrl);
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`YouTube Feed 请求失败 (${response.status})`);
        }
        const entries = parseYouTubeFeed(response.text);
        if (entries.length > 0 && entries[0].channelName) subscription.channelName = entries[0].channelName;
        subscription.lastCheckedAt = Date.now();
        subscription.etag = response.headers.etag;
        subscription.lastModified = response.headers['last-modified'];
        const initialItems = mergeYouTubeItems([], entries, subscription, Date.now()).map((item) => ({ ...item, status: 'read' as const }));
        await this.commit((store) => applyRetention(upsertItems(upsertSubscription(store, subscription), initialItems), Date.now()));
        return subscription;
    }

    async removeSubscription(id: string): Promise<void> {
        await this.initialize();
        await this.commit((store) => deleteSubscription(store, id, Date.now()));
    }

    async addCategory(name: string): Promise<string> {
        await this.initialize();
        const normalized = name.trim().slice(0, 40);
        if (!normalized) throw new Error('请输入分类名称');
        if (this.store.categories.includes(normalized)) throw new Error('该分类已存在');
        await this.commit((store) => addCategoryToStore(store, normalized));
        return normalized;
    }

    /** 删除分类:该分类下的频道自动回到「未分类」,频道与其条目不受影响。 */
    async removeCategory(name: string): Promise<void> {
        await this.initialize();
        await this.commit((store) => removeCategoryFromStore(store, name, Date.now()));
    }

    /** 移动频道到分类;传空串表示移回「未分类」。 */
    async setSubscriptionCategory(id: string, category: string): Promise<void> {
        await this.initialize();
        const normalized = category.trim().slice(0, 40);
        await this.commit((store) => setSubscriptionCategoryInStore(store, id, normalized || undefined));
    }

    async refreshAll(): Promise<YouTubeRefreshResult> {
        if (this.refreshPromise) return this.refreshPromise;
        await this.initialize();
        this.refreshPromise = this.refreshImpl().finally(() => { this.refreshPromise = null; });
        return this.refreshPromise;
    }

    async markRead(itemId: string): Promise<void> {
        await this.updateItem(itemId, { status: 'read' });
    }

    async markImported(itemId: string, notePath: string): Promise<void> {
        await this.updateItem(itemId, { status: 'imported', notePath, error: undefined });
    }

    async markFailed(itemId: string, error: string): Promise<void> {
        await this.updateItem(itemId, { status: 'failed', error: error.slice(0, 300) });
    }

    private async refreshImpl(): Promise<YouTubeRefreshResult> {
        // 恒等合并:先把其他设备会话中途写进 sidecar 的数据并回内存(并集),
        // 让它们的订阅也参与本轮刷新
        await this.commit((store) => store);
        let allItems = this.items;
        const subscriptions = this.subscriptions;
        let added = 0;
        let failed = 0;
        const now = Date.now();

        for (const [index, subscription] of subscriptions.entries()) {
            if (index > 0) await sleep(SUBSCRIPTION_FETCH_SPACING_MS);
            try {
                const headers: Record<string, string> = {};
                if (subscription.etag) headers['If-None-Match'] = subscription.etag;
                if (subscription.lastModified) headers['If-Modified-Since'] = subscription.lastModified;
                let response: Awaited<ReturnType<typeof fetchYouTubeFeed>>;
                try {
                    response = await fetchYouTubeFeed(subscription.feedUrl, headers);
                } catch (error) {
                    // 兜底:部分 Obsidian 版本的 requestUrl 会把 304 当错误 reject,等价于"无更新"
                    if (statusFromError(error) === 304) {
                        this.store = patchSubscriptionInStore(this.store, subscription.id, { lastCheckedAt: now, lastError: undefined });
                        continue;
                    }
                    throw error;
                }
                if (response.status === 304) {
                    this.store = patchSubscriptionInStore(this.store, subscription.id, { lastCheckedAt: now, lastError: undefined });
                    continue;
                }
                if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
                const entries = parseYouTubeFeed(response.text);
                const before = new Set(allItems.filter((item) => item.subscriptionId === subscription.id).map((item) => item.itemId));
                const updatedSub = {
                    ...subscription,
                    channelName: entries[0]?.channelName || subscription.channelName,
                    lastCheckedAt: now,
                    lastError: undefined,
                    etag: response.headers.etag || subscription.etag,
                    lastModified: response.headers['last-modified'] || subscription.lastModified,
                };
                allItems = mergeYouTubeItems(allItems, entries, updatedSub, now);
                added += entries.filter((entry) => !before.has(`${subscription.id}:${entry.videoId}`)).length;
                this.store = patchSubscriptionInStore(this.store, subscription.id, {
                    channelName: updatedSub.channelName,
                    lastCheckedAt: now,
                    lastError: undefined,
                    etag: response.headers.etag || subscription.etag,
                    lastModified: response.headers['last-modified'] || subscription.lastModified,
                });
            } catch (error) {
                failed++;
                this.store = patchSubscriptionInStore(this.store, subscription.id, {
                    lastCheckedAt: now,
                    lastError: error instanceof Error ? error.message.slice(0, 300) : 'Feed 请求失败',
                });
            }
        }

        // 收敛策略:先按保留窗口丢弃过期条目,再按总量上限截断(applyRetention 内执行)。
        // 发布时间解析失败的条目保守保留(避免异常数据被静默清掉),由总量上限兜底。
        // upsertItems 做按条目键的秩合并:刷新中途的 markRead/markImported 不会被这里的全量落盘覆盖。
        await this.commit((store) => applyRetention(upsertItems(store, allItems), now));
        return { checked: subscriptions.length, added, failed };
    }

    private async updateItem(itemId: string, patch: Partial<YouTubeFeedItem>): Promise<void> {
        await this.initialize();
        await this.commit((store) => patchItem(store, itemId, patch));
    }

    /**
     * 读-合-写:先读磁盘现内容与内存态并集(fn 收到的已是合并结果),再落盘。
     * 本进程的旧快照因此无法抹掉另一端刚写入的数据;墓碑挡住已删实体的复活。
     * 序列化结果与内存态此前一致时跳过写盘(减少 iCloud churn)。
     */
    private commit(fn: (store: YouTubeRssStore) => YouTubeRssStore): Promise<void> {
        const run = async () => {
            let fileStore = emptyStore();
            try {
                const adapter = this.plugin.app.vault.adapter;
                if (await adapter.exists(this.storePath)) {
                    fileStore = parseStore(await adapter.read(this.storePath)) ?? emptyStore();
                }
            } catch (e) {
                console.warn('[LME] youtube-rss.json 读取失败,按本会话数据继续', e);
            }
            const previous = serializeStore(this.store);
            const next = fn(mergeStores(fileStore, this.store, Date.now()));
            this.store = next;
            if (serializeStore(next) !== previous) {
                try {
                    await this.plugin.app.vault.adapter.write(this.storePath, serializeStore(next));
                } catch (e) {
                    console.warn('[LME] youtube-rss.json 写入失败', e);
                }
            }
        };
        this.writeQueue = this.writeQueue.then(run, run);
        return this.writeQueue;
    }

    private async resolveChannelId(input: string): Promise<string> {
        const direct = extractChannelId(input);
        if (direct) return direct;
        const value = input.trim().startsWith('http') ? input.trim() : `https://${input.trim()}`;
        let url: URL;
        try { url = new URL(value); } catch { throw new Error('请输入有效的 YouTube 频道链接或频道 ID'); }
        if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) throw new Error('目前只支持 YouTube 频道链接');
        if (!/^\/(?:channel\/UC[a-zA-Z0-9_-]+|@[a-zA-Z0-9._-]+|c\/[a-zA-Z0-9._-]+|user\/[a-zA-Z0-9._-]+)(?:\/(?:videos|shorts|streams))?\/?$/i.test(url.pathname)) {
            throw new Error('请输入 YouTube 频道链接，不要粘贴视频或搜索页面');
        }
        const response = await fetchYouTubeFeedPage(url.toString());
        const channelId = extractChannelIdFromHtml(response);
        if (!channelId) throw new Error('无法从频道页面识别 channel ID，请粘贴 /channel/UC... 链接');
        return channelId;
    }
}

async function fetchYouTubeFeedPage(url: string): Promise<string> {
    const response = await fetchYouTubeFeed(url);
    if (response.status < 200 || response.status >= 300) throw new Error(`频道页面请求失败 (${response.status})`);
    return response.text;
}

export function showRefreshNotice(result: YouTubeRefreshResult): void {
    if (result.failed > 0) new Notice(`YouTube 订阅已检查 ${result.checked} 个频道，新增 ${result.added} 条，${result.failed} 个失败`);
    else new Notice(`YouTube 订阅已更新，新增 ${result.added} 条视频`);
}
