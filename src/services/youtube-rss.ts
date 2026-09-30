export type YouTubeItemStatus = 'new' | 'read' | 'imported' | 'failed';

export interface YouTubeFeedEntry {
    videoId: string;
    title: string;
    url: string;
    channelId: string;
    channelName: string;
    publishedAt: string;
    updatedAt: string;
    thumbnailUrl: string;
}

export interface YouTubeSubscription {
    id: string;
    channelId: string;
    channelName: string;
    channelUrl: string;
    feedUrl: string;
    createdAt: number;
    lastCheckedAt: number;
    lastError?: string;
    etag?: string;
    lastModified?: string;
    category?: string;
}

export interface YouTubeFeedItem extends YouTubeFeedEntry {
    itemId: string;
    subscriptionId: string;
    discoveredAt: number;
    status: YouTubeItemStatus;
    notePath?: string;
    error?: string;
}

export function youtubeFeedUrl(channelId: string): string {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

export function youtubeChannelUrl(channelId: string): string {
    return `https://www.youtube.com/channel/${channelId}`;
}

export function extractChannelId(text: string): string | null {
    const value = text.trim();
    if (/^UC[a-zA-Z0-9_-]{20,}$/.test(value)) return value;
    const path = value.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/i)?.[1];
    return path || null;
}

/**
 * 只认"页面自身"的频道元数据信号,按优先级取第一个命中的:
 * 1. <link rel="canonical"> — 频道页 canonical 恒为 /channel/UC... 形式
 * 2. <meta itemprop="identifier"> — 频道页 schema.org 标识
 * 3. "externalId" — ytInitialData 里 channelMetadataRenderer(页面自身元数据)的字段
 * 4. <meta itemprop="channelId"> — 旧版页面布局
 * 5. <meta property="og:url"> — 指向 /channel/UC... 的社交分享 URL
 *
 * 不能退化为通用 "channelId": 或 /channel/ 链接匹配:频道页(如 @NBCNews)内嵌 JSON 的
 * 推荐频道轮播 gridChannelRenderer(如 TODAY)会先于页面自身元数据出现,抓"第一个"
 * 会订阅错频道。宁可返回 null 走"请粘贴 /channel/UC... 链接"的明确报错。
 */
export function extractChannelIdFromHtml(html: string): string | null {
    const patterns = [
        /<link[^>]+rel=["']canonical["'][^>]*href=["'][^"']*\/channel\/(UC[a-zA-Z0-9_-]+)["']/i,
        /<meta[^>]+itemprop=["']identifier["'][^>]+content=["'](UC[a-zA-Z0-9_-]+)["']/i,
        /["']externalId["']\s*:\s*["'](UC[a-zA-Z0-9_-]+)["']/i,
        /<meta[^>]+itemprop=["']channelId["'][^>]+content=["'](UC[a-zA-Z0-9_-]+)["']/i,
        /<meta[^>]+property=["']og:url["'][^>]+content=["'][^"']*\/channel\/(UC[a-zA-Z0-9_-]+)["']/i,
    ];
    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) return match[1];
    }
    return null;
}

function firstText(parent: Element, selector: string): string {
    const tagName = selector.replace(/\\:/g, ':');
    const direct = !selector.includes(' ') ? parent.getElementsByTagName(tagName)[0] : null;
    return direct?.textContent?.trim() || parent.querySelector(selector)?.textContent?.trim() || '';
}

function firstAttr(parent: Element, selector: string, attr: string): string {
    return parent.querySelector(selector)?.getAttribute(attr)?.trim() || '';
}

export function parseYouTubeFeed(xml: string): YouTubeFeedEntry[] {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('无法解析 YouTube Feed XML');
    const entries = Array.from(doc.getElementsByTagName('entry'));
    return entries.flatMap((entry): YouTubeFeedEntry[] => {
        const rawId = firstText(entry, 'yt\\:videoId') || firstText(entry, 'id');
        const videoId = rawId.replace(/^yt:video:/, '').trim();
        if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return [];
        const channelId = firstText(entry, 'yt\\:channelId');
        const title = firstText(entry, 'title') || videoId;
        const url = firstAttr(entry, 'link[rel="alternate"]', 'href') || `https://www.youtube.com/watch?v=${videoId}`;
        const publishedAt = firstText(entry, 'published');
        const updatedAt = firstText(entry, 'updated') || publishedAt;
        return [{
            videoId,
            title,
            url,
            channelId,
            channelName: firstText(entry, 'author name') || channelId,
            publishedAt,
            updatedAt,
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        }];
    });
}

export function mergeYouTubeItems(
    existing: YouTubeFeedItem[],
    entries: YouTubeFeedEntry[],
    subscription: YouTubeSubscription,
    now: number,
): YouTubeFeedItem[] {
    const byKey = new Map(existing.map((item) => [item.itemId, item]));
    for (const entry of entries) {
        const itemId = `${subscription.id}:${entry.videoId}`;
        const previous = byKey.get(itemId);
        byKey.set(itemId, {
            ...entry,
            itemId,
            subscriptionId: subscription.id,
            discoveredAt: previous?.discoveredAt || now,
            status: previous?.status || 'new',
            notePath: previous?.notePath,
            error: previous?.error,
        });
    }
    return [...byKey.values()]
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || b.discoveredAt - a.discoveredAt);
    // 数量/时间窗口的收敛由调用方(YouTubeRssService)统一执行,这里返回完整合并结果。
}
