// @ts-nocheck
import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type LanguageMadeEasyPlugin from '../main-unified-full';
import { t } from '../i18n';
import type { YouTubeFeedItem } from '../services/youtube-rss';

export const YOUTUBE_PLAYER_VIEW_TYPE = 'lme-youtube-player';

/** 播放器视图持久化状态:仅保留展示+导入所需字段,重启后仍可恢复播放。 */
interface YouTubePlayerState {
    videoId: string;
    title: string;
    channelName: string;
    publishedAt: string;
    url: string;
    itemId: string;
}

export function youtubePlayerStateFor(item: YouTubeFeedItem): YouTubePlayerState {
    return {
        videoId: item.videoId,
        title: item.title,
        channelName: item.channelName,
        publishedAt: item.publishedAt,
        url: item.url,
        itemId: item.itemId,
    };
}

/**
 * 侧边栏 YouTube 在线预览播放器:嵌入官方 embed 播放器。
 * 订阅页点击封面/标题后先在这里试看,再决定是否生成视频笔记。
 */
export class YouTubePlayerView extends ItemView {
    private readonly plugin: LanguageMadeEasyPlugin;
    private playerState: YouTubePlayerState | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: LanguageMadeEasyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return YOUTUBE_PLAYER_VIEW_TYPE; }
    getDisplayText(): string { return t('nav.youtubePlayerTitle'); }
    getIcon(): string { return 'play-circle'; }

    async onOpen(): Promise<void> {
        this.renderPlayer();
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }

    /** 视图状态随工作区持久化:重启 Obsidian 后仍能恢复上次的视频。 */
    getState(): Record<string, unknown> {
        return this.playerState ? { ...this.playerState } : {};
    }

    async setState(state: Record<string, unknown>, result: unknown): Promise<void> {
        await super.setState(state, result);
        const videoId = state?.videoId;
        if (typeof videoId !== 'string' || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return;
        this.playerState = {
            videoId,
            title: typeof state.title === 'string' ? state.title : '',
            channelName: typeof state.channelName === 'string' ? state.channelName : '',
            publishedAt: typeof state.publishedAt === 'string' ? state.publishedAt : '',
            url: typeof state.url === 'string' && state.url ? state.url : `https://www.youtube.com/watch?v=${videoId}`,
            itemId: typeof state.itemId === 'string' ? state.itemId : '',
        };
        this.renderPlayer();
    }

    /** 从订阅卡片切换视频:复用同一侧边栏叶,不新开标签页。 */
    loadItem(item: YouTubeFeedItem): void {
        this.playerState = youtubePlayerStateFor(item);
        this.renderPlayer();
    }

    private renderPlayer(): void {
        this.contentEl.empty();
        this.contentEl.addClass('lme-youtube-player-view');
        const state = this.playerState;
        if (!state) {
            this.contentEl.createDiv({ cls: 'lme-youtube-player-empty', text: t('nav.youtubePlayerEmpty') });
            return;
        }
        const wrap = this.contentEl.createDiv('lme-youtube-player-wrap');
        wrap.createEl('iframe', {
            attr: {
                src: `https://www.youtube.com/embed/${state.videoId}?autoplay=1&rel=0`,
                title: state.title || t('nav.youtubePlayerTitle'),
                allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
                allowfullscreen: 'true',
            },
        });
        const info = this.contentEl.createDiv('lme-youtube-player-info');
        info.createEl('strong', { cls: 'lme-youtube-player-title', text: state.title });
        const metaBits = [state.channelName, this.formatDate(state.publishedAt)].filter(Boolean);
        if (metaBits.length > 0) info.createDiv({ cls: 'lme-youtube-player-meta', text: metaBits.join(' · ') });
        const actions = info.createDiv('lme-youtube-player-actions');
        const noteBtn = actions.createEl('button', { text: t('nav.youtubeCreateNote'), cls: 'mod-cta' });
        noteBtn.type = 'button';
        noteBtn.onclick = () => { void this.importCurrent(noteBtn); };
        if (state.url) {
            const browserBtn = actions.createEl('button', { text: t('nav.youtubeOpenInBrowser') });
            browserBtn.type = 'button';
            browserBtn.onclick = () => { window.open(state.url, '_blank'); };
        }
    }

    /** 与订阅页同一导入流程:已生成过则打开原笔记,否则标记已读 → 生成笔记 → 标记已导入。 */
    private async importCurrent(button: HTMLButtonElement): Promise<void> {
        const state = this.playerState;
        if (!state?.url) return;
        const live = state.itemId
            ? this.plugin.youtubeRssService.items.find((entry) => entry.itemId === state.itemId)
            : undefined;
        button.disabled = true;
        try {
            if (live) await this.plugin.youtubeRssService.markRead(live.itemId);
            if (live?.status === 'imported' && live.notePath) {
                const existing = this.app.vault.getAbstractFileByPath(live.notePath);
                if (existing) {
                    await this.app.workspace.getLeaf('tab').openFile(existing);
                    return;
                }
            }
            await this.plugin.createVideoNoteFromUrl(state.url);
            const file = this.app.workspace.getActiveFile();
            if (live) await this.plugin.youtubeRssService.markImported(live.itemId, file?.path || '');
            new Notice(t('nav.youtubeNoteCreated'));
            await this.plugin.refreshYouTubeSubscriptions();
        } catch (error) {
            const message = error instanceof Error ? error.message : t('nav.youtubeImportFailed');
            if (live) await this.plugin.youtubeRssService.markFailed(live.itemId, message);
            new Notice(message);
        } finally {
            button.disabled = false;
        }
    }

    private formatDate(value: string): string {
        if (!value) return '';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
    }
}
