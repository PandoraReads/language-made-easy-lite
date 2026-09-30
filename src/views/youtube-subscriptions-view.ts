// @ts-nocheck
import { ItemView, Notice, WorkspaceLeaf, setIcon } from 'obsidian';
import type LanguageMadeEasyPlugin from '../main-unified-full';
import { t } from '../i18n';
import { YouTubeRssService, showRefreshNotice } from '../services/youtube-rss-service';
import type { YouTubeFeedItem, YouTubeSubscription } from '../services/youtube-rss';
import { YOUTUBE_PLAYER_VIEW_TYPE, YouTubePlayerView, youtubePlayerStateFor } from './youtube-player-view';
import { TextInputModal } from './text-input-modal';
import { UpgradeModal } from '../ui/upgrade-modal';

export const YOUTUBE_SUBSCRIPTIONS_VIEW_TYPE = 'lme-youtube-subscriptions';

/** 左侧导航的当前选择:全部 / 单个频道 / 一个分类(空串=未分类)。 */
type NavSelection =
    | { type: 'all' }
    | { type: 'channel'; id: string }
    | { type: 'category'; name: string };

const UNCAT_KEY = '__uncategorized__';


export class YouTubeSubscriptionsView extends ItemView {
    private readonly plugin: LanguageMadeEasyPlugin;
    private readonly service: YouTubeRssService;
    private input: HTMLInputElement | null = null;
    private listEl: HTMLElement | null = null;
    private selectionLabelEl: HTMLElement | null = null;
    private navSelection: NavSelection = { type: 'all' };
    private statusFilter = 'all';
    private timeFilter: 'all' | 'today' | '7' | '15' | '30' = 'all';
    private viewMode: 'cards' | 'list' | 'grouped' = 'cards';
    private cardSize: 'small' | 'medium' | 'large' = 'medium';
    private viewBtns: HTMLButtonElement[] = [];
    private sizeBtns: HTMLButtonElement[] = [];
    private collapsedGroups: Set<string> = new Set();

    // ── 多选模式与批量下载:均为会话级瞬态状态,不持久化 ──
    private selectionMode = false;
    private selectedIds: Set<string> = new Set();
    private selectModeBtn: HTMLButtonElement | null = null;
    private selectAllBtn: HTMLButtonElement | null = null;
    private downloadBtn: HTMLButtonElement | null = null;
    private downloadIconEl: HTMLElement | null = null;
    private downloadLabelEl: HTMLElement | null = null;

    // ── 左侧分类导航:默认收起,悬停/左缘滑动展开,点击别处自动收起 ──
    private navHostEl: HTMLElement | null = null;
    private navOpen = false;
    private navCollapsedGroups: Set<string> = new Set();
    private navCloseTimer: number | null = null;
    private navEventsBound = false;
    private navTouchStart: { x: number; y: number; nearLeftEdge: boolean } | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: LanguageMadeEasyPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.service = plugin.youtubeRssService;
        this.cardSize = this.readStoredCardSize();
        this.viewMode = this.readStoredViewMode();
    }

    getViewType(): string { return YOUTUBE_SUBSCRIPTIONS_VIEW_TYPE; }
    getDisplayText(): string { return t('nav.youtubeSubscriptionsTitle'); }
    getIcon(): string { return 'rss'; }

    async onOpen(): Promise<void> {
        this.bindNavEvents();
        await this.render();
    }

    async onClose(): Promise<void> {
        this.unbindNavEvents();
        this.cancelNavClose();
        this.input = null;
        this.listEl = null;
        this.selectionLabelEl = null;
        this.navHostEl = null;
        this.selectModeBtn = null;
        this.selectAllBtn = null;
        this.downloadBtn = null;
        this.downloadIconEl = null;
        this.downloadLabelEl = null;
        this.contentEl.empty();
    }

    async refresh(): Promise<void> {
        await this.render();
    }

    private async render(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass('lme-youtube-rss-view');
        this.applyCardSize();

        const header = this.contentEl.createDiv('lme-youtube-rss-header');
        header.createEl('h2', { text: t('nav.youtubeSubscriptionsTitle') });
        header.createEl('p', { text: t('nav.youtubeSubscriptionsDesc'), cls: 'lme-catalog-sub' });

        const add = this.contentEl.createDiv('lme-youtube-rss-add');
        this.input = add.createEl('input', { type: 'text', placeholder: t('nav.youtubeChannelPlaceholder'), attr: { 'aria-label': t('nav.youtubeChannelPlaceholder') } });
        const addBtn = add.createEl('button', { text: t('nav.youtubeAddSubscription'), cls: 'mod-cta' });
        addBtn.onclick = () => { void this.addSubscription(addBtn); };
        this.input.onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); void this.addSubscription(addBtn); } };

        // 刷新紧挨「添加订阅」右侧(原独立一行)
        const refreshBtn = add.createEl('button', { text: t('nav.youtubeRefresh') });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.onclick = async () => {
            refreshBtn.disabled = true;
            try { showRefreshNotice(await this.service.refreshAll()); await this.render(); }
            catch (error) { new Notice(error instanceof Error ? error.message : t('nav.youtubeRefreshFailed')); }
            finally { refreshBtn.disabled = false; }
        };
        // 轮询提示紧跟刷新按钮右侧
        add.createSpan({ cls: 'lme-youtube-rss-hint', text: t('nav.youtubeLocalPollingHint') });

        this.renderFilters();
        this.selectionLabelEl = this.contentEl.createDiv('lme-youtube-rss-selection');

        const scroll = this.contentEl.createDiv('lme-youtube-rss-scroll');
        this.listEl = scroll.createDiv('lme-youtube-rss-list');
        this.renderItems();
        this.renderNav();
    }

    private renderFilters(): void {
        const toolbar = this.contentEl.createDiv('lme-youtube-rss-filters');
        this.addSelect(toolbar, t('nav.youtubeFilterStatus'), [
            ['all', t('nav.youtubeFilterAll')],
            ['new', t('nav.youtubeNew')],
            ['imported', t('nav.youtubeImported')],
            ['failed', t('nav.youtubeFilterFailed')],
        ], this.statusFilter, (value) => { this.statusFilter = value; this.renderItems(); });
        this.addSelect(toolbar, t('nav.youtubeFilterTime'), [
            ['all', t('nav.youtubeFilterAll')],
            ['today', t('nav.youtubeTimeToday')],
            ['7', t('nav.youtubeTimeDays', { n: '7' })],
            ['15', t('nav.youtubeTimeDays', { n: '15' })],
            ['30', t('nav.youtubeTimeDays', { n: '30' })],
        ], this.timeFilter, (value) => { this.timeFilter = value as typeof this.timeFilter; this.renderItems(); });

        // 视图切换:卡片(默认) / 列表 / 按频道分组
        const viewToggle = toolbar.createDiv('lme-youtube-rss-viewtoggle');
        viewToggle.setAttr('role', 'group');
        viewToggle.setAttr('aria-label', t('nav.youtubeViewModeAria'));
        this.viewBtns = [];
        const views: [typeof this.viewMode, string, string][] = [
            ['cards', 'layout-grid', t('nav.youtubeViewCards')],
            ['list', 'list', t('nav.youtubeViewList')],
            ['grouped', 'folder-tree', t('nav.youtubeViewGrouped')],
        ];
        for (const [mode, icon, label] of views) {
            const btn = viewToggle.createEl('button', { cls: 'lme-youtube-rss-viewtoggle-btn' + (this.viewMode === mode ? ' is-active' : '') });
            btn.type = 'button';
            btn.setAttr('title', label);
            btn.setAttr('aria-label', label);
            btn.setAttr('aria-pressed', String(this.viewMode === mode));
            setIcon(btn, icon);
            btn.onclick = () => {
                this.viewMode = mode;
                this.writeStoredViewMode(mode);
                for (const b of this.viewBtns) {
                    const active = b === btn;
                    b.classList.toggle('is-active', active);
                    b.setAttr('aria-pressed', String(active));
                }
                this.renderItems();
            };
            this.viewBtns.push(btn);
        }

        // 卡片大小切换:小 / 中(默认) / 大
        const sizeField = toolbar.createDiv('lme-youtube-rss-filter-field lme-youtube-rss-size');
        sizeField.createSpan({ text: t('nav.youtubeCardSize') });
        this.sizeBtns = [];
        for (const size of ['small', 'medium', 'large'] as const) {
            const btn = sizeField.createEl('button', { cls: 'lme-youtube-rss-size-btn' + (this.cardSize === size ? ' is-active' : ''), text: t('nav.youtubeSize' + (size === 'small' ? 'Small' : size === 'medium' ? 'Medium' : 'Large')) });
            btn.type = 'button';
            btn.setAttr('aria-pressed', String(this.cardSize === size));
            btn.onclick = () => {
                this.cardSize = size;
                this.writeStoredCardSize(size);
                this.applyCardSize();
                for (const b of this.sizeBtns) {
                    const active = b === btn;
                    b.classList.toggle('is-active', active);
                    b.setAttr('aria-pressed', String(active));
                }
            };
            this.sizeBtns.push(btn);
        }

        // 批量组:多选 / 全选(仅多选模式显示) / 一键下载(批量中变「停止」)
        const batch = toolbar.createDiv('lme-youtube-rss-batch');
        this.selectModeBtn = batch.createEl('button', { cls: 'lme-youtube-rss-batch-btn lme-youtube-rss-batch-icon' });
        this.selectModeBtn.type = 'button';
        this.selectModeBtn.setAttr('title', t('nav.youtubeSelectMode'));
        this.selectModeBtn.setAttr('aria-label', t('nav.youtubeSelectMode'));
        setIcon(this.selectModeBtn, 'list-checks');
        this.selectModeBtn.onclick = () => this.toggleSelectionMode();
        this.selectAllBtn = batch.createEl('button', { cls: 'lme-youtube-rss-batch-btn lme-youtube-rss-batch-icon is-hidden' });
        this.selectAllBtn.type = 'button';
        this.selectAllBtn.setAttr('title', t('nav.youtubeSelectAll'));
        this.selectAllBtn.setAttr('aria-label', t('nav.youtubeSelectAll'));
        setIcon(this.selectAllBtn, 'square-check-big');
        this.selectAllBtn.onclick = () => this.toggleSelectAll();
        this.downloadBtn = batch.createEl('button', { cls: 'lme-youtube-rss-batch-btn lme-youtube-rss-download-btn' });
        this.downloadBtn.type = 'button';
        this.downloadIconEl = this.downloadBtn.createSpan({ cls: 'lme-youtube-rss-download-icon' });
        this.downloadLabelEl = this.downloadBtn.createSpan({ cls: 'lme-youtube-rss-download-label' });
        this.downloadBtn.onclick = () => { void this.onDownloadBtnClick(); };
        this.updateBatchButtons();
    }

    private addSelect(parent: HTMLElement, label: string, options: string[][], current: string, onChange: (value: string) => void): void {
        const field = parent.createDiv('lme-youtube-rss-filter-field');
        field.createSpan({ text: label });
        const select = field.createEl('select');
        for (const [value, text] of options) select.createEl('option', { value, text, attr: { selected: value === current ? 'true' : undefined } });
        select.value = current;
        select.onchange = () => onChange(select.value);
    }

    // ── 视图模式(卡片/列表/分组)与卡片大小,均持久化到 localStorage ──

    private static readonly VIEW_MODE_KEY = 'lme-youtube-rss-view-mode';
    private static readonly CARD_SIZE_KEY = 'lme-youtube-rss-card-size';

    private applyCardSize(): void {
        this.contentEl.removeClass('is-size-small', 'is-size-medium', 'is-size-large');
        this.contentEl.addClass(`is-size-${this.cardSize}`);
    }

    private readStoredViewMode(): 'cards' | 'list' | 'grouped' {
        try {
            const stored = localStorage.getItem(YouTubeSubscriptionsView.VIEW_MODE_KEY);
            return stored === 'list' || stored === 'grouped' ? stored : 'cards';
        } catch {
            return 'cards';
        }
    }

    private writeStoredViewMode(mode: 'cards' | 'list' | 'grouped'): void {
        try { localStorage.setItem(YouTubeSubscriptionsView.VIEW_MODE_KEY, mode); } catch { /* localStorage 不可用时静默 */ }
    }

    private readStoredCardSize(): 'small' | 'medium' | 'large' {
        try {
            const stored = localStorage.getItem(YouTubeSubscriptionsView.CARD_SIZE_KEY);
            return stored === 'small' || stored === 'large' ? stored : 'medium';
        } catch {
            return 'medium';
        }
    }

    private writeStoredCardSize(size: 'small' | 'medium' | 'large'): void {
        try { localStorage.setItem(YouTubeSubscriptionsView.CARD_SIZE_KEY, size); } catch { /* localStorage 不可用时静默 */ }
    }

    private renderItems(): void {
        if (!this.listEl) return;
        // 进/出多选模式等局部重渲时保持滚动位置(列表清空重建会使滚动容器 scrollTop 归零)
        const scroller = this.listEl.parentElement;
        const scrollTop = scroller?.scrollTop ?? 0;
        this.listEl.empty();
        this.listEl.removeClass('is-list'); // 列表模式专属类,切回卡片/分组时必须摘掉,否则卡片被拉成全宽
        const subscriptions = this.service.subscriptions;
        const bySubscription = new Map(subscriptions.map((sub) => [sub.id, sub]));
        const filtered = this.computeFiltered();
        this.updateSelectionLabel(filtered.length);
        if (subscriptions.length === 0) {
            this.listEl.createDiv({ cls: 'lme-youtube-rss-empty', text: t('nav.youtubeNoSubscriptions') });
            return;
        }
        if (filtered.length === 0) {
            this.listEl.createDiv({ cls: 'lme-youtube-rss-empty', text: t('nav.youtubeNoMatchingItems') });
            return;
        }
        // 列表视图:紧凑行
        if (this.viewMode === 'list') {
            this.listEl.addClass('is-list');
            for (const item of filtered) this.renderRow(this.listEl, item, bySubscription.get(item.subscriptionId));
        } else if (this.viewMode === 'cards') {
            // 卡片视图(默认):平铺网格
            for (const item of filtered) this.renderItem(this.listEl, item, bySubscription.get(item.subscriptionId));
        } else {
            // 分组视图:按频道(组头可折叠)
            const groups = new Map<string, YouTubeFeedItem[]>();
            for (const item of filtered) {
                const sub = bySubscription.get(item.subscriptionId);
                const label = sub?.channelName || item.channelName;
                groups.set(label, [...(groups.get(label) || []), item]);
            }
            for (const [label, items] of groups) {
                const group = this.listEl.createDiv('lme-youtube-rss-group');
                const collapsed = this.collapsedGroups.has(label);
                if (collapsed) group.addClass('is-collapsed');
                const heading = group.createDiv('lme-youtube-rss-group-heading');
                const toggle = heading.createEl('button', { cls: 'lme-youtube-rss-group-toggle', attr: { 'aria-expanded': String(!collapsed), 'aria-label': t('nav.collapseGroup') } });
                toggle.type = 'button';
                setIcon(toggle, 'chevron-down');
                toggle.onclick = () => this.toggleGroupCollapsed(label, group, toggle);
                heading.createEl('strong', { text: label });
                heading.createSpan({ text: String(items.length) });
                const grid = group.createDiv('lme-youtube-rss-group-grid');
                for (const item of items) this.renderItem(grid, item, bySubscription.get(item.subscriptionId));
            }
        }
        if (scroller) scroller.scrollTop = scrollTop;
    }

    /** 当前导航+状态+时间筛选结果(渲染与「全选」共用同一事实源)。 */
    private computeFiltered(): YouTubeFeedItem[] {
        const bySubscription = new Map(this.service.subscriptions.map((sub) => [sub.id, sub]));
        return this.service.items.filter((item) => {
            const sub = bySubscription.get(item.subscriptionId);
            return this.matchesSelection(item, sub)
                && (this.statusFilter === 'all' || item.status === this.statusFilter)
                && this.matchesTimeFilter(item.publishedAt);
        });
    }

    /** 当前导航选择是否命中该条目(channel 按订阅 id,category 按频道的分类)。 */
    private matchesSelection(item: YouTubeFeedItem, subscription: YouTubeSubscription | undefined): boolean {
        const selection = this.navSelection;
        if (selection.type === 'all') return true;
        if (selection.type === 'channel') return item.subscriptionId === selection.id;
        return (subscription?.category || '') === selection.name;
    }

    /** 选中导航项后,在卡片区上方显示当前选择,避免面板收起后看不出筛选来源。 */
    private updateSelectionLabel(count: number): void {
        if (!this.selectionLabelEl) return;
        this.selectionLabelEl.empty();
        const selection = this.navSelection;
        let label = t('nav.youtubeSelectionAll');
        if (selection.type === 'channel') {
            const sub = this.service.subscriptions.find((entry) => entry.id === selection.id);
            label = t('nav.youtubeSelectionChannel', { name: sub?.channelName || '' });
        } else if (selection.type === 'category') {
            label = t('nav.youtubeSelectionCategory', { name: selection.name || t('nav.youtubeUncategorized') });
        }
        this.selectionLabelEl.createEl('strong', { text: label });
        this.selectionLabelEl.createSpan({ text: t('nav.youtubeItemCount', { n: String(count) }) });
    }

    /** 时间筛选:「今天」=本地当日零点起;其余为最近 N 天滚动窗口。 */
    private matchesTimeFilter(publishedAt: string): boolean {
        if (this.timeFilter === 'all') return true;
        const published = Date.parse(publishedAt);
        if (Number.isNaN(published)) return false;
        if (this.timeFilter === 'today') {
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            return published >= start.getTime();
        }
        const days = Number(this.timeFilter);
        return days > 0 && published >= Date.now() - days * 86400000;
    }

    /** 折叠/展开一个分组(会话内记忆,重渲后保持)。 */
    private toggleGroupCollapsed(label: string, group: HTMLElement, toggle: HTMLElement): void {
        const collapsing = !this.collapsedGroups.has(label);
        if (collapsing) {
            this.collapsedGroups.add(label);
            group.addClass('is-collapsed');
        } else {
            this.collapsedGroups.delete(label);
            group.removeClass('is-collapsed');
        }
        toggle.setAttr('aria-expanded', String(!collapsing));
    }

    /** 列表视图行:缩略图 + 标题/频道/日期 + 操作。 */
    private renderRow(parent: HTMLElement, item: YouTubeFeedItem, subscription: unknown): void {
        const row = parent.createDiv('lme-youtube-rss-row');
        row.setAttr('data-item-id', item.itemId);
        if (item.status === 'new') row.addClass('is-new');
        const thumbWrap = row.createDiv('lme-youtube-rss-thumbwrap lme-youtube-rss-row-thumbwrap');
        const thumb = thumbWrap.createEl('img', { cls: 'lme-youtube-rss-row-thumb', attr: { src: item.thumbnailUrl, alt: '' } });
        const playBadge = thumbWrap.createDiv('lme-youtube-rss-playbadge');
        setIcon(playBadge, 'play');
        thumb.onerror = () => { thumb.style.display = 'none'; playBadge.style.display = 'none'; };
        if (this.selectionMode) this.applySelectionMode(row, thumbWrap, item);
        this.bindPreview(thumbWrap, item);
        const main = row.createDiv('lme-youtube-rss-row-main');
        const title = main.createEl('strong', { cls: 'lme-youtube-rss-row-title is-clickable', text: item.title });
        this.bindPreview(title, item);
        main.createDiv({ cls: 'lme-youtube-rss-meta', text: `${subscription?.channelName || item.channelName} · ${this.formatDate(item.publishedAt)}` });
        const actions = row.createDiv('lme-youtube-rss-row-actions');
        if (item.status === 'new') actions.createSpan({ cls: 'lme-youtube-rss-badge', text: t('nav.youtubeNew') });
        if (item.status === 'imported') actions.createSpan({ cls: 'lme-youtube-rss-badge is-done', text: t('nav.youtubeImported') });
        const importBtn = actions.createEl('button', { text: item.status === 'imported' ? t('nav.youtubeOpenAgain') : t('nav.youtubeCreateNote') });
        importBtn.disabled = this.selectionMode;
        importBtn.onclick = () => { void this.importItem(item, importBtn); };
    }

    private renderItem(parent: HTMLElement, item: YouTubeFeedItem, subscription: unknown): void {
        const card = parent.createDiv('lme-youtube-rss-card');
        card.setAttr('data-item-id', item.itemId);
        if (item.status === 'new') card.addClass('is-new');
        const thumbWrap = card.createDiv('lme-youtube-rss-thumbwrap');
        const thumb = thumbWrap.createEl('img', { cls: 'lme-youtube-rss-thumb', attr: { src: item.thumbnailUrl, alt: '' } });
        const playBadge = thumbWrap.createDiv('lme-youtube-rss-playbadge');
        setIcon(playBadge, 'play');
        thumb.onerror = () => { thumb.style.display = 'none'; playBadge.style.display = 'none'; };
        if (this.selectionMode) this.applySelectionMode(card, thumbWrap, item);
        this.bindPreview(thumbWrap, item);
        const body = card.createDiv('lme-youtube-rss-card-body');
        const title = body.createEl('strong', { cls: 'lme-youtube-rss-title is-clickable', text: item.title });
        this.bindPreview(title, item);
        body.createDiv({ cls: 'lme-youtube-rss-meta', text: `${subscription?.channelName || item.channelName} · ${this.formatDate(item.publishedAt)}` });
        const actions = body.createDiv('lme-youtube-rss-actions');
        // 状态文字(新视频/已生成笔记)居左,图标按钮(生成/再次生成)居右
        if (item.status === 'new') actions.createSpan({ cls: 'lme-youtube-rss-badge', text: t('nav.youtubeNew') });
        if (item.status === 'imported') actions.createSpan({ cls: 'lme-youtube-rss-badge is-done', text: t('nav.youtubeImported') });
        const again = item.status === 'imported';
        const importBtn = actions.createEl('button', { cls: 'lme-youtube-rss-iconbtn' });
        importBtn.type = 'button';
        importBtn.setAttr('title', again ? t('nav.youtubeOpenAgain') : t('nav.youtubeCreateNote'));
        importBtn.setAttr('aria-label', again ? t('nav.youtubeOpenAgain') : t('nav.youtubeCreateNote'));
        setIcon(importBtn, again ? 'rotate-ccw' : 'file-plus-2');
        importBtn.disabled = this.selectionMode;
        importBtn.onclick = () => { void this.importItem(item, importBtn); };
    }

    private async addSubscription(button: HTMLButtonElement): Promise<void> {
        const input = this.input?.value.trim() || '';
        if (!input) { new Notice(t('nav.youtubeChannelRequired')); return; }
        button.disabled = true;
        try {
            const sub = await this.service.addSubscription(input);
            if (this.input) this.input.value = '';
            new Notice(t('nav.youtubeSubscriptionAdded', { name: sub.channelName }));
            await this.render();
        } catch (error) { new Notice(error instanceof Error ? error.message : t('nav.youtubeSubscriptionFailed')); }
        finally { button.disabled = false; }
    }

    private async importItem(item: YouTubeFeedItem, button: HTMLButtonElement): Promise<void> {
        button.disabled = true;
        try {
            if (item.status === 'imported' && item.notePath) {
                const existing = this.app.vault.getAbstractFileByPath(item.notePath);
                if (existing) {
                    await this.service.markRead(item.itemId);
                    await this.app.workspace.getLeaf('tab').openFile(existing);
                    return;
                }
            }
            // 社区免费版:生成视频笔记(含字幕下载)为完整版功能,弹付费引导。
            new UpgradeModal(this.app, t('nav.youtubeCreateNote')).open();
        } finally {
            button.disabled = false;
        }
    }

    // ── 多选模式 + 批量一键下载 ────────────────────────────────

    /** 多选模式:卡片/行挂选中交互(复选框覆盖缩略图左上角 + 整体点击/键盘切换)。 */
    private applySelectionMode(el: HTMLElement, thumbWrap: HTMLElement, item: YouTubeFeedItem): void {
        el.addClass('is-selectable');
        if (this.selectedIds.has(item.itemId)) el.addClass('is-selected');
        const check = thumbWrap.createDiv('lme-youtube-rss-check');
        setIcon(check, 'check');
        el.setAttr('tabindex', '0');
        el.onclick = () => this.toggleItemSelected(item.itemId);
        el.onkeydown = (event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.toggleItemSelected(item.itemId); }
        };
    }

    /** 进入/退出多选模式。进入只重渲列表(不动导航/输入框);退出清空选中。 */
    private toggleSelectionMode(): void {
        this.selectionMode = !this.selectionMode;
        if (!this.selectionMode) this.selectedIds.clear();
        this.renderItems();
        this.updateBatchButtons();
    }

    /** 全选/取消全选当前筛选结果(与渲染同源),DOM 就地切换高亮,零重渲。 */
    private toggleSelectAll(): void {
        const filtered = this.computeFiltered();
        const allSelected = filtered.length > 0 && filtered.every((item) => this.selectedIds.has(item.itemId));
        for (const item of filtered) {
            if (allSelected) this.selectedIds.delete(item.itemId);
            else this.selectedIds.add(item.itemId);
        }
        if (this.listEl) {
            for (const el of Array.from(this.listEl.querySelectorAll('[data-item-id]'))) {
                const itemId = el.getAttribute('data-item-id') || '';
                el.classList.toggle('is-selected', this.selectedIds.has(itemId));
            }
        }
        this.updateBatchButtons();
    }

    /** 切换一条选中态:Set 增删 + 就地高亮,零重渲。 */
    private toggleItemSelected(itemId: string): void {
        if (this.selectedIds.has(itemId)) this.selectedIds.delete(itemId);
        else this.selectedIds.add(itemId);
        this.findItemEl(itemId)?.classList.toggle('is-selected', this.selectedIds.has(itemId));
        this.updateBatchButtons();
    }

    /** 按 itemId 找已渲染的卡片/行(itemId 含 ':' 与 UUID,遍历比对免属性选择器转义)。 */
    private findItemEl(itemId: string): HTMLElement | null {
        if (!this.listEl) return null;
        for (const el of Array.from(this.listEl.querySelectorAll('[data-item-id]'))) {
            if (el.getAttribute('data-item-id') === itemId) return el as HTMLElement;
        }
        return null;
    }

    /** 统一刷新工具栏批量按钮态(多选激活/全选显隐/下载计数/批量中变「停止」)。 */
    private updateBatchButtons(): void {
        if (this.selectModeBtn) {
            this.selectModeBtn.classList.toggle('is-active', this.selectionMode);
            this.selectModeBtn.setAttr('aria-pressed', String(this.selectionMode));
        }
        if (this.selectAllBtn) {
            this.selectAllBtn.classList.toggle('is-hidden', !this.selectionMode);
        }
        if (this.downloadBtn) {
            this.downloadBtn.disabled = !this.selectionMode;
            setIcon(this.downloadIconEl, 'download');
            this.downloadLabelEl?.setText(t('nav.youtubeBatchDownload', { n: String(this.selectedIds.size) }));
        }
    }

    /** 一键下载按钮:社区免费版中为完整版功能,点击弹付费引导。 */
    private async onDownloadBtnClick(): Promise<void> {
        new UpgradeModal(this.app, t('nav.youtubeCreateNote')).open();
    }

    /** 绑定「封面/标题点击 → 侧边栏在线预览」(含键盘可达性)。 */
    private bindPreview(el: HTMLElement, item: YouTubeFeedItem): void {
        if (this.selectionMode) return; // 多选模式:整卡点击切换选中,不再绑预览(改绑会与整卡 onclick 冒泡双切换)
        const label = `${t('nav.youtubePreviewHint')}: ${item.title}`;
        el.setAttr('role', 'link');
        el.setAttr('tabindex', '0');
        el.setAttr('aria-label', label);
        el.onclick = () => this.openPlayer(item);
        el.onkeydown = (event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.openPlayer(item); }
        };
    }

    /** 在右侧边栏打开(或复用)在线预览播放器,看完再决定是否下载。 */
    private openPlayer(item: YouTubeFeedItem): void {
        const workspace = this.app.workspace;
        const leaf = workspace.getLeavesOfType(YOUTUBE_PLAYER_VIEW_TYPE)[0] || workspace.getRightLeaf(false);
        if (!leaf) return;
        if (leaf.view instanceof YouTubePlayerView) {
            leaf.view.loadItem(item);
        } else {
            void leaf.setViewState({ type: YOUTUBE_PLAYER_VIEW_TYPE, active: true, state: youtubePlayerStateFor(item) });
        }
        if (workspace.rightSplit) workspace.rightSplit.expand();
        workspace.revealLeaf(leaf);
    }

    private formatDate(value: string): string {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
    }

    // ── 左侧分类导航 ─────────────────────────────────────────────
    // 订阅频道不再平铺在筛选区上方,改为收进左侧导航:
    // 自定义分类 + 未分类兜底;频道可拖放到分类;点击频道/分类筛选右侧卡片。

    private renderNav(): void {
        const host = this.contentEl.createDiv('lme-youtube-navhost' + (this.navOpen ? ' is-open' : ''));
        this.navHostEl = host;

        const backdrop = host.createDiv('lme-youtube-nav-backdrop');
        backdrop.onclick = () => this.closeNav();

        const panel = host.createDiv('lme-youtube-nav');
        // 桌面:鼠标离开面板约 400ms 后自动收起(回到面板即取消)
        panel.onmouseenter = () => this.cancelNavClose();
        panel.onmouseleave = () => this.scheduleNavClose();

        const head = panel.createDiv('lme-youtube-nav-head');
        head.createEl('h3', { text: t('nav.youtubeNavTitle') });
        const closeBtn = head.createEl('button', { cls: 'lme-youtube-nav-iconbtn', attr: { 'aria-label': t('nav.youtubeCloseNav'), title: t('nav.youtubeCloseNav') } });
        closeBtn.type = 'button';
        setIcon(closeBtn, 'chevrons-left');
        closeBtn.onclick = () => this.closeNav();

        const body = panel.createDiv('lme-youtube-nav-body');
        const subs = this.service.subscriptions;
        const known = this.service.categories;
        // 自愈:订阅里存在未知分类名时(如手工改过 data.json)并入列表展示
        const orphanCategories = [...new Set(subs.map((sub) => sub.category).filter((category) => category && !known.includes(category)))];
        const groups: { key: string; label: string; category: string }[] = [
            ...[...known, ...orphanCategories].map((name) => ({ key: `cat:${name}`, label: name, category: name })),
            { key: UNCAT_KEY, label: t('nav.youtubeUncategorized'), category: '' },
        ];

        const allRow = body.createDiv('lme-youtube-nav-item lme-youtube-nav-all' + (this.navSelection.type === 'all' ? ' is-active' : ''));
        setIcon(allRow.createDiv('lme-youtube-nav-item-icon'), 'infinity');
        allRow.createSpan({ text: t('nav.youtubeNavAll') });
        allRow.onclick = () => this.selectNav({ type: 'all' });

        for (const group of groups) {
            const members = subs.filter((sub) => (sub.category || '') === group.category);
            this.renderNavGroup(body, group.key, group.label, group.category, members);
        }

        const footer = panel.createDiv('lme-youtube-nav-footer');
        const addCatBtn = footer.createEl('button', { cls: 'lme-youtube-nav-addcat', text: t('nav.youtubeAddCategory') });
        addCatBtn.type = 'button';
        setIcon(addCatBtn, 'plus');
        addCatBtn.onclick = () => this.promptAddCategory();

        // 左缘触发条:悬停展开;点击/回车切换;面板展开时隐藏避免遮挡面板内容
        const edge = host.createDiv('lme-youtube-nav-edge');
        edge.setAttr('role', 'button');
        edge.setAttr('tabindex', '0');
        edge.setAttr('aria-label', t('nav.youtubeOpenNav'));
        edge.setAttr('title', t('nav.youtubeOpenNav'));
        setIcon(edge, 'chevrons-right');
        edge.onclick = () => { if (this.navOpen) this.closeNav(); else this.openNav(); };
        edge.onmouseenter = () => { if (!this.navOpen) this.openNav(); };
        edge.onkeydown = (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (this.navOpen) this.closeNav(); else this.openNav();
            }
        };
    }

    /** 一个分类分组:组头(折叠/选中/计数/删除) + 频道行(拖动/选中/移除),整组是拖放目标。 */
    private renderNavGroup(parent: HTMLElement, key: string, label: string, category: string, members: YouTubeSubscription[]): void {
        const group = parent.createDiv('lme-youtube-nav-group');
        const collapsed = this.navCollapsedGroups.has(key);
        if (collapsed) group.addClass('is-collapsed');

        const heading = group.createDiv('lme-youtube-nav-group-heading');
        const caret = heading.createEl('button', { cls: 'lme-youtube-nav-iconbtn lme-youtube-nav-caret' + (collapsed ? ' is-collapsed' : ''), attr: { 'aria-expanded': String(!collapsed), 'aria-label': t('nav.collapseGroup') } });
        caret.type = 'button';
        setIcon(caret, 'chevron-down');
        caret.onclick = () => this.toggleNavGroupCollapsed(key, group, caret);

        const isActive = this.navSelection.type === 'category' && this.navSelection.name === category;
        const nameBtn = heading.createEl('button', { cls: 'lme-youtube-nav-group-name' + (isActive ? ' is-active' : ''), text: label });
        nameBtn.type = 'button';
        nameBtn.setAttr('title', label);
        nameBtn.onclick = () => this.selectNav({ type: 'category', name: category });

        heading.createSpan({ cls: 'lme-youtube-nav-count', text: String(members.length) });

        if (key !== UNCAT_KEY) {
            const del = heading.createEl('button', { cls: 'lme-youtube-nav-iconbtn lme-youtube-nav-del', attr: { 'aria-label': t('nav.youtubeDeleteCategory'), title: t('nav.youtubeDeleteCategory') } });
            del.type = 'button';
            setIcon(del, 'trash-2');
            del.onclick = async (evt) => {
                evt.stopPropagation();
                await this.service.removeCategory(category);
                if (this.navSelection.type === 'category' && this.navSelection.name === category) this.navSelection = { type: 'all' };
                new Notice(t('nav.youtubeCategoryDeleted', { name: label }));
                await this.render();
            };
        }

        const children = group.createDiv('lme-youtube-nav-children');
        for (const sub of members) this.renderNavChannel(children, sub);
        if (members.length === 0) children.createDiv({ cls: 'lme-youtube-nav-empty', text: t('nav.youtubeCategoryEmpty') });

        this.bindGroupDrop(group, category);
    }

    /** 频道行:点击筛选该频道;拖住可移动分类;悬停可移除订阅;拉取失败显示警示。 */
    private renderNavChannel(parent: HTMLElement, sub: YouTubeSubscription): void {
        const isActive = this.navSelection.type === 'channel' && this.navSelection.id === sub.id;
        const row = parent.createDiv('lme-youtube-nav-item lme-youtube-nav-channel' + (isActive ? ' is-active' : ''));
        row.setAttr('draggable', 'true');
        row.setAttr('title', t('nav.youtubeDragToCategory'));
        row.createSpan({ cls: 'lme-youtube-nav-channel-name', text: sub.channelName });
        if (sub.lastError) {
            const error = row.createSpan({ cls: 'lme-youtube-nav-error', attr: { title: sub.lastError } });
            setIcon(error, 'alert-triangle');
        }
        const remove = row.createEl('button', { cls: 'lme-youtube-nav-iconbtn lme-youtube-nav-remove', attr: { 'aria-label': t('nav.youtubeRemoveSubscription'), title: t('nav.youtubeRemoveSubscription') } });
        remove.type = 'button';
        setIcon(remove, 'x');
        remove.onclick = async (evt) => {
            evt.stopPropagation();
            await this.service.removeSubscription(sub.id);
            if (this.navSelection.type === 'channel' && this.navSelection.id === sub.id) this.navSelection = { type: 'all' };
            await this.render();
        };
        row.onclick = () => this.selectNav({ type: 'channel', id: sub.id });
        row.ondragstart = (evt) => {
            evt.dataTransfer?.setData('text/plain', sub.id);
            if (evt.dataTransfer) evt.dataTransfer.effectAllowed = 'move';
            row.addClass('is-dragging');
        };
        row.ondragend = () => row.removeClass('is-dragging');
    }

    /** 分组作为拖放目标(折叠时也能接收);空串分类=未分类。 */
    private bindGroupDrop(group: HTMLElement, category: string): void {
        group.ondragover = (evt) => {
            evt.preventDefault();
            if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'move';
            group.addClass('is-dropover');
        };
        group.ondragleave = (evt) => {
            if (!group.contains(evt.relatedTarget as Node | null)) group.removeClass('is-dropover');
        };
        group.ondrop = async (evt) => {
            evt.preventDefault();
            group.removeClass('is-dropover');
            const id = evt.dataTransfer?.getData('text/plain');
            if (!id) return;
            await this.service.setSubscriptionCategory(id, category);
            await this.render();
        };
    }

    /** 折叠/展开一个导航分组(会话内记忆)。 */
    private toggleNavGroupCollapsed(key: string, group: HTMLElement, caret: HTMLElement): void {
        const collapsing = !this.navCollapsedGroups.has(key);
        if (collapsing) {
            this.navCollapsedGroups.add(key);
            group.addClass('is-collapsed');
        } else {
            this.navCollapsedGroups.delete(key);
            group.removeClass('is-collapsed');
        }
        caret.setAttr('aria-expanded', String(!collapsing));
        caret.classList.toggle('is-collapsed', collapsing);
    }

    private selectNav(selection: NavSelection): void {
        this.navSelection = selection;
        this.closeNav();
        this.render();
    }

    private openNav(): void {
        this.navOpen = true;
        this.navHostEl?.addClass('is-open');
    }

    private closeNav(): void {
        this.cancelNavClose();
        this.navOpen = false;
        this.navHostEl?.removeClass('is-open');
    }

    private scheduleNavClose(): void {
        // 触屏设备没有 hover,收起交给「点击别处」;仅真鼠标设备启用离面板即收起
        if (!window.matchMedia('(hover: hover)').matches) return;
        this.cancelNavClose();
        this.navCloseTimer = window.setTimeout(() => this.closeNav(), 400);
    }

    private cancelNavClose(): void {
        if (this.navCloseTimer !== null) {
            window.clearTimeout(this.navCloseTimer);
            this.navCloseTimer = null;
        }
    }

    private promptAddCategory(): void {
        new TextInputModal(this.app, {
            title: t('nav.youtubeCategoryNameTitle'),
            placeholder: t('nav.youtubeCategoryNamePlaceholder'),
            confirmText: t('nav.youtubeAddCategory'),
        }, async (name) => {
            try {
                await this.service.addCategory(name);
                await this.render();
            } catch (error) {
                new Notice(error instanceof Error ? error.message : t('nav.youtubeCategoryAddFailed'));
            }
        }).open();
    }

    // ── 导航的全局事件:点外部收起 + 移动端左缘右滑展开/左滑收起 ──
    // 绑在 contentEl/document 上且随 onOpen/onClose 成对挂摘,避免整视图重渲时重复绑定。

    private handleOutsidePointer = (evt: PointerEvent): void => {
        if (!this.navOpen) return;
        const target = evt.target as Node | null;
        if (target && this.navHostEl?.contains(target)) return;
        this.closeNav();
    };

    private handleTouchStart = (evt: TouchEvent): void => {
        if (evt.touches.length !== 1) { this.navTouchStart = null; return; }
        const rect = this.contentEl.getBoundingClientRect();
        const touch = evt.touches[0];
        this.navTouchStart = {
            x: touch.clientX,
            y: touch.clientY,
            nearLeftEdge: touch.clientX - rect.left < 48,
        };
    };

    private handleTouchMove = (evt: TouchEvent): void => {
        const start = this.navTouchStart;
        if (!start || evt.touches.length !== 1) return;
        const dx = evt.touches[0].clientX - start.x;
        const dy = evt.touches[0].clientY - start.y;
        if (Math.abs(dx) < 28 || Math.abs(dy) > 60) return;
        if (dx > 0 && start.nearLeftEdge && !this.navOpen) {
            this.openNav();
            this.navTouchStart = null;
        } else if (dx < 0 && this.navOpen) {
            this.closeNav();
            this.navTouchStart = null;
        }
    };

    private bindNavEvents(): void {
        if (this.navEventsBound) return;
        this.navEventsBound = true;
        document.addEventListener('pointerdown', this.handleOutsidePointer);
        this.contentEl.addEventListener('touchstart', this.handleTouchStart, { passive: true });
        this.contentEl.addEventListener('touchmove', this.handleTouchMove, { passive: true });
    }

    private unbindNavEvents(): void {
        if (!this.navEventsBound) return;
        this.navEventsBound = false;
        this.navTouchStart = null;
        document.removeEventListener('pointerdown', this.handleOutsidePointer);
        this.contentEl.removeEventListener('touchstart', this.handleTouchStart);
        this.contentEl.removeEventListener('touchmove', this.handleTouchMove);
    }
}
