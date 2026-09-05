// @ts-nocheck
// ============================================================
// Language Made Easy - Shadowing Workshop 目录页
// 点击导航页「Shadowing Workshop」进入;列出指定文件夹下的 .md 笔记,
// 点卡片打开该笔记并启动跟读工坊。默认文件夹由插件 seeding 自带 sample。
//
// 属性化目录:支持按 视频笔记属性 排序 / 筛选 / 分组。
//   - 自动派生(时长/段数/字数/添加日期/是否有视频/来源)——解析正文
//   - frontmatter(频道/tags/封面)——Obsidian 属性面板手填
//   - 练习状态(practiced/次数/上次时间)——插件自动追踪,持久化在 settings.workshopProgress
// 解析逻辑与类型放在类型受检的 src/utils/workshop-note.ts;本视图只 import。
// ============================================================

import { ItemView, WorkspaceLeaf, Notice, setIcon, TFile } from 'obsidian';
import type LanguageMadeEasyPlugin from '../main-unified-full';
import { t } from '../i18n';
import { ConfirmModal } from '../ui/confirm-modal';
import { NotePreviewModal } from '../ui/note-preview-modal';
import {
    parseWorkshopNote,
    formatDuration,
    resolveCoverSrc,
} from '../utils/workshop-note';
import type { NoteSource, WorkshopNoteProps } from '../utils/workshop-note';

export const WORKSHOP_CATALOG_VIEW_TYPE = 'lme-workshop-catalog';

/** 默认文件夹(vault 根下,ASCII 稳定路径)。setting 为空时用它。 */
export const DEFAULT_WORKSHOP_FOLDER = 'LME Workshop';

const REFRESH_DEBOUNCE_MS = 250;

/** 卡片/列表视图偏好持久化 key(localStorage,非 settings)。 */
const VIEW_MODE_KEY = 'lme-workshop-catalog-view';

type SortKey = 'dateAdded' | 'title' | 'duration' | 'lastPracticedAt' | 'segmentCount';
type GroupKey = 'none' | 'channel' | 'source' | 'practice' | 'month' | 'tags';
type PracticeFilter = 'all' | 'practiced' | 'not';

interface Opt { value: string; label: string }

/** 来源 → Lucide 图标名(播放器在用的同一套识别)。 */
function sourceIconName(s: NoteSource): string {
    switch (s) {
        case 'youtube': return 'youtube';
        case 'bilibili': return 'film';
        case 'local': return 'file-video';
        default: return 'circle-help';
    }
}

/** 来源 → 本地化名称。 */
function sourceLabel(s: NoteSource): string {
    switch (s) {
        case 'youtube': return t('nav.workshopCatalogSourceYouTube');
        case 'bilibili': return t('nav.workshopCatalogSourceBilibili');
        case 'local': return t('nav.workshopCatalogSourceLocal');
        default: return t('nav.workshopCatalogSourceUnknown');
    }
}

/** ms → "YYYY-MM"(用本地年月,避开 toISOString 的时区偏移)。 */
function monthKey(ms: number): string {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export class WorkshopCatalogView extends ItemView {
    private plugin: LanguageMadeEasyPlugin;

    // 解析缓存:path → {mtime, props}。mtime 未变则复用;练习态每次从 settings 现取。
    private parseCache: Map<string, { mtime: number; props: WorkshopNoteProps }> = new Map();
    private allProps: WorkshopNoteProps[] = [];

    // UI 状态(跨重渲保留;仅在 render() 全量重建时保留值)
    private sortKey: SortKey = 'dateAdded';
    private sortDir: 'asc' | 'desc' = 'desc';
    private groupBy: GroupKey = 'none';
    private filterPractice: PracticeFilter = 'all';
    private filterSource: string = 'all';      // 'all' | NoteSource
    private filterChannel: string = 'all';      // 'all' | 频道 文本
    private filterTags: string[] = [];          // OR 语义
    private searchText: string = '';
    private viewMode: 'grid' | 'list' = 'grid';  // 卡片 / 列表,持久化到 localStorage
    private cardSize: 'small' | 'medium' | 'large' = 'medium';  // 卡片大小,持久化;中=默认
    private sizeBtns: HTMLButtonElement[] = [];
    private collapsedGroups: Set<string> = new Set();

    // 工具栏控件引用(chip 点击 / 清除时反向同步 select 显示)
    private channelSelect: HTMLSelectElement | null = null;
    private tagSelect: HTMLSelectElement | null = null;
    private filterPracticeSelect: HTMLSelectElement | null = null;
    private filterSourceSelect: HTMLSelectElement | null = null;
    private dirBtn: HTMLButtonElement | null = null;
    private gridBtn: HTMLButtonElement | null = null;
    private listBtn: HTMLButtonElement | null = null;
    private clearBtn: HTMLButtonElement | null = null;

    // 容器引用(renderList 只重建这三处,保留搜索框焦点)
    private chiprowEl: HTMLElement | null = null;
    private resultsEl: HTMLElement | null = null;
    private bodyEl: HTMLElement | null = null;

    // 事件与去抖
    private eventsBound = false;
    private refreshTimer: number | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: LanguageMadeEasyPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.viewMode = this.readStoredViewMode();
        this.cardSize = this.readStoredCardSize();
    }

    getViewType(): string { return WORKSHOP_CATALOG_VIEW_TYPE; }
    getDisplayText(): string { return t('nav.workshopCatalogTitle'); }
    getIcon(): string { return 'library'; }

    async onOpen() {
        this.bindFolderEvents();
        await this.render();
    }

    async onClose() {
        if (this.refreshTimer != null) {
            window.clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
        this.parseCache.clear();
        this.channelSelect = this.filterPracticeSelect = this.filterSourceSelect = null;
        this.tagSelect = null;
        this.dirBtn = this.gridBtn = this.listBtn = this.clearBtn = null;
        this.chiprowEl = this.resultsEl = this.bodyEl = null;
        this.contentEl.empty();
    }

    /** 打开后或外部刷新时重渲。 */
    async refresh(): Promise<void> {
        await this.render();
    }

    async render() {
        // 先吸收对端经同步落地的文件夹更新(data.json 会被旧快照互覆,真身在 sidecar);
        // 采纳后本次渲染即用新值,手机端不必重启
        await this.plugin.refreshWorkshopFolderFromDisk();
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lme-catalog-view');
        this.applyCardSize();

        const folder = this.getFolder();
        const usingDefault = this.isDefaultFolder();

        // 仅默认文件夹做首次 seeding(只播一次;之后用户删 sample 或整个文件夹都不重建)
        if (usingDefault) {
            try { await this.plugin.ensureWorkshopSamples(folder); } catch (e) { console.warn('[LME] ensureWorkshopSamples failed', e); }
        }

        // Header
        const header = contentEl.createDiv('lme-catalog-header');
        header.createEl('h2', { text: t('nav.workshopCatalogTitle') });
        header.createEl('p', { text: t('nav.workshopCatalogDesc', { folder }), cls: 'lme-catalog-sub' });

        // 计算所有笔记属性(memoized)
        await this.ensureProps();
        if (this.allProps.length === 0) {
            await this.renderEmpty(contentEl, folder);
            return;
        }

        this.buildToolbar(contentEl);
        this.chiprowEl = contentEl.createDiv('lme-catalog-chiprow');
        this.resultsEl = contentEl.createDiv('lme-catalog-results-meta');
        this.bodyEl = contentEl.createDiv('lme-catalog-body');
        this.renderList();
    }

    // ── 属性计算 ───────────────────────────────────────────────

    private async ensureProps(): Promise<void> {
        const folder = this.getFolder();
        const files = await this.listMarkdownFiles(folder);
        const progress = this.plugin.settings.workshopProgress || {};
        const out: WorkshopNoteProps[] = [];
        for (const file of files) {
            const cached = this.parseCache.get(file.path);
            if (cached && cached.mtime === file.stat.mtime) {
                out.push(this.applyProgress(cached.props, progress[file.path]));
            } else {
                const props = await parseWorkshopNote(file, this.app, progress[file.path]);
                this.parseCache.set(file.path, { mtime: file.stat.mtime, props });
                out.push(props);
            }
        }
        this.allProps = out;
    }

    /** 用最新练习态覆盖缓存的练习字段(不可变)。解析结果复用,练习态每次现取。 */
    private applyProgress(base: WorkshopNoteProps, p: { practiced?: boolean; practiceCount?: number; lastPracticedAt?: number } | undefined): WorkshopNoteProps {
        return {
            ...base,
            practiced: !!(p && p.practiced),
            practiceCount: (p && p.practiceCount) || 0,
            lastPracticedAt: (p && p.lastPracticedAt) || 0,
        };
    }

    // ── 工具栏 ─────────────────────────────────────────────────

    private buildToolbar(parent: HTMLElement): void {
        const tb = parent.createDiv('lme-catalog-toolbar');

        // 搜索(直接挂在工具栏,占剩余宽度;其后每个 zone 用左 border 分隔)
        const search = tb.createEl('input', { cls: 'lme-catalog-search' });
        search.type = 'search';
        search.placeholder = t('nav.workshopCatalogSearch');
        search.value = this.searchText;
        search.setAttr('aria-label', t('nav.workshopCatalogSearch'));
        search.oninput = () => { this.searchText = search.value; this.renderList(); };

        // 手动刷新(搜索框右侧):清解析缓存并重扫文件夹,清掉仓库中已删除笔记的残留
        const refreshBtn = tb.createEl('button', { cls: 'lme-catalog-refresh' });
        refreshBtn.type = 'button';
        refreshBtn.setAttr('title', t('nav.workshopCatalogRefresh'));
        refreshBtn.setAttr('aria-label', t('nav.workshopCatalogRefresh'));
        setIcon(refreshBtn, 'rotate-cw');
        refreshBtn.onclick = () => {
            refreshBtn.addClass('is-busy');
            window.setTimeout(() => refreshBtn.removeClass('is-busy'), 450);
            this.parseCache.clear();
            void this.refresh();
        };

        // ── 视图切换(紧跟刷新右侧):卡片 / 列表(segmented) ──
        const viewZone = tb.createDiv('lme-catalog-zone');
        const toggle = viewZone.createDiv('lme-catalog-viewtoggle');
        toggle.setAttr('role', 'group');
        toggle.setAttr('aria-label', t('nav.workshopCatalogViewAria'));
        this.gridBtn = this.viewBtn(toggle, 'layout-grid', t('nav.workshopCatalogViewGrid'), () => this.setViewMode('grid'));
        this.listBtn = this.viewBtn(toggle, 'list', t('nav.workshopCatalogViewList'), () => this.setViewMode('list'));
        this.applyViewToggleStates();

        // ── 排序(微标签 + select+方向 融合成一个控件) ──
        const sortZone = tb.createDiv('lme-catalog-zone');
        sortZone.createEl('span', { cls: 'lme-catalog-zone-label', text: t('nav.workshopCatalogSortLabel') });
        const sortPair = sortZone.createDiv('lme-catalog-sortpair');
        const sortOpts: Opt[] = [
            { value: 'dateAdded', label: t('nav.workshopCatalogSortDateAdded') },
            { value: 'title', label: t('nav.workshopCatalogSortTitle') },
            { value: 'duration', label: t('nav.workshopCatalogSortDuration') },
            { value: 'lastPracticedAt', label: t('nav.workshopCatalogSortLast') },
            { value: 'segmentCount', label: t('nav.workshopCatalogSortSegments') },
        ];
        sortPair.appendChild(this.buildSelect(sortOpts, this.sortKey, (v) => { this.sortKey = v as SortKey; }));
        this.dirBtn = sortPair.createEl('button', { cls: 'lme-catalog-dir' });
        this.applyDirIcon();
        this.dirBtn.onclick = () => {
            this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
            this.applyDirIcon();
            this.renderList();
        };

        // ── 分组 ──
        const groupZone = tb.createDiv('lme-catalog-zone');
        groupZone.createEl('span', { cls: 'lme-catalog-zone-label', text: t('nav.workshopCatalogGroupLabel') });
        const groupOpts: Opt[] = [
            { value: 'none', label: t('nav.workshopCatalogGroupNone') },
            { value: 'channel', label: t('nav.workshopCatalogGroupChannel') },
            { value: 'tags', label: t('nav.workshopCatalogGroupTags') },
            { value: 'source', label: t('nav.workshopCatalogGroupSource') },
            { value: 'practice', label: t('nav.workshopCatalogGroupPractice') },
            { value: 'month', label: t('nav.workshopCatalogGroupMonth') },
        ];
        groupZone.appendChild(this.buildSelect(groupOpts, this.groupBy, (v) => { this.groupBy = v as GroupKey; }));

        // ── 卡片大小(分组右侧):小 / 中(默认) / 大 ──
        const sizeZone = tb.createDiv('lme-catalog-zone');
        const sizeToggle = sizeZone.createDiv('lme-catalog-sizetoggle');
        sizeToggle.setAttr('role', 'group');
        sizeToggle.setAttr('aria-label', t('nav.workshopCatalogSizeLabel'));
        this.sizeBtns = [];
        for (const size of ['small', 'medium', 'large'] as const) {
            const label = size === 'small' ? t('nav.workshopCatalogSizeSmall')
                : size === 'medium' ? t('nav.workshopCatalogSizeMedium')
                    : t('nav.workshopCatalogSizeLarge');
            const btn = sizeToggle.createEl('button', { cls: 'lme-catalog-size-btn' + (this.cardSize === size ? ' is-active' : ''), text: label });
            btn.type = 'button';
            btn.setAttr('title', label);
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

        // ── 筛选(zone 标签 + 练习/来源/主题 + 清除) ──
        const filterZone = tb.createDiv('lme-catalog-zone');
        filterZone.createEl('span', { cls: 'lme-catalog-zone-label', text: t('nav.workshopCatalogFilterZone') });

        this.filterPracticeSelect = this.buildSelect(
            [
                { value: 'all', label: t('nav.workshopCatalogFilterAll') },
                { value: 'practiced', label: t('nav.workshopCatalogFilterPracticed') },
                { value: 'not', label: t('nav.workshopCatalogFilterNot') },
            ],
            this.filterPractice,
            (v) => { this.filterPractice = v as PracticeFilter; },
        );
        this.field(filterZone, t('nav.workshopCatalogFilterPractice')).appendChild(this.filterPracticeSelect);

        this.filterSourceSelect = this.buildSelect(
            [
                { value: 'all', label: t('nav.workshopCatalogFilterAll') },
                { value: 'youtube', label: t('nav.workshopCatalogSourceYouTube') },
                { value: 'bilibili', label: t('nav.workshopCatalogSourceBilibili') },
                { value: 'local', label: t('nav.workshopCatalogSourceLocal') },
                { value: 'unknown', label: t('nav.workshopCatalogSourceUnknown') },
            ],
            this.filterSource,
            (v) => { this.filterSource = v; },
        );
        this.field(filterZone, t('nav.workshopCatalogFilterSource')).appendChild(this.filterSourceSelect);

        const channelSet = new Set<string>();
        for (const p of this.allProps) if (p.channel) channelSet.add(p.channel);
        this.channelSelect = this.buildSelect(
            [
                { value: 'all', label: t('nav.workshopCatalogFilterAll') },
                ...[...channelSet].sort().map((ch) => ({ value: ch, label: ch })),
            ],
            this.filterChannel,
            (v) => { this.filterChannel = v; },
        );
        this.field(filterZone, t('nav.workshopCatalogFilterChannel')).appendChild(this.channelSelect);

        // 标签筛选:单选下拉,与卡片上的标签 chip 共享 filterTags(选一个=只留该标签;chip 可再叠加多选)
        const tagSet = new Set<string>();
        for (const p of this.allProps) for (const tg of p.tags) tagSet.add(tg);
        this.tagSelect = this.buildSelect(
            [
                { value: 'all', label: t('nav.workshopCatalogFilterAll') },
                ...[...tagSet].sort().map((tg) => ({ value: tg, label: '#' + tg })),
            ],
            this.filterTags.length === 1 ? this.filterTags[0] : 'all',
            (v) => { this.filterTags = v === 'all' ? [] : [v]; },
        );
        this.field(filterZone, t('nav.workshopCatalogFilterTags')).appendChild(this.tagSelect);

        // 清除(仅当任一筛选激活时显示)
        this.clearBtn = filterZone.createEl('button', { cls: 'lme-catalog-clear' });
        this.clearBtn.type = 'button';
        setIcon(this.clearBtn, 'x');
        this.clearBtn.createSpan({ text: t('nav.workshopCatalogClear') });
        this.clearBtn.onclick = () => this.clearFilters();
    }

    private viewBtn(parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLButtonElement {
        const btn = parent.createEl('button', { cls: 'lme-catalog-viewtoggle-btn' });
        btn.type = 'button';
        btn.setAttr('title', label);
        btn.setAttr('aria-label', label);
        setIcon(btn, icon);
        btn.onclick = onClick;
        return btn;
    }

    private field(parent: HTMLElement, label: string): HTMLElement {
        const f = parent.createDiv('lme-catalog-field');
        f.createEl('span', { cls: 'lme-catalog-field-label', text: label });
        return f;
    }

    private buildSelect(opts: Opt[], current: string, onPick: (v: string) => void): HTMLSelectElement {
        const sel = document.createElement('select');
        sel.className = 'lme-catalog-select';
        for (const o of opts) {
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label;
            if (o.value === current) opt.selected = true;
            sel.appendChild(opt);
        }
        sel.onchange = () => { onPick(sel.value); this.renderList(); };
        return sel;
    }

    private applyDirIcon(): void {
        if (!this.dirBtn) return;
        const asc = this.sortDir === 'asc';
        this.dirBtn.setAttr('title', asc ? t('nav.workshopCatalogSortAsc') : t('nav.workshopCatalogSortDesc'));
        setIcon(this.dirBtn, asc ? 'arrow-up-narrow-wide' : 'arrow-down-narrow-wide');
    }

    // ── 列表渲染(只重建 chiprow/results/body,保留搜索框焦点) ──

    private renderList(): void {
        if (!this.bodyEl || !this.resultsEl || !this.chiprowEl) return;
        const filtered = this.filterProps(this.allProps);
        const sorted = this.sortProps(filtered);
        const groups = this.groupProps(sorted);

        // 结果计数
        this.resultsEl.empty();
        this.resultsEl.createSpan({
            text: t('nav.workshopCatalogResultsMeta', {
                shown: String(filtered.length),
                total: String(this.allProps.length),
            }),
        });

        // 已选标签 chip(可移除)
        this.chiprowEl.empty();
        for (const tag of this.filterTags) {
            const chip = this.chiprowEl.createEl('button', { cls: 'lme-catalog-chip is-active' });
            chip.type = 'button';
            chip.createSpan({ text: '#' + tag });
            chip.createSpan({ cls: 'lme-catalog-chip-x', text: '×' });
            chip.onclick = () => { this.toggleTag(tag); };
        }

        // 同步筛选激活态 + 清除按钮显隐(每次重渲都跑,与结果数无关)
        this.refreshFilterStates();

        // 主体(视图模式决定容器类与卡片/行)
        this.bodyEl.empty();
        if (filtered.length === 0) {
            this.renderNoMatch(this.bodyEl);
            return;
        }
        const list = this.viewMode === 'list';
        const containerCls = list ? 'lme-catalog-list' : 'lme-catalog-grid';
        const fill = (boxParent: HTMLElement, items: WorkshopNoteProps[]): void => {
            const box = boxParent.createDiv(containerCls);
            for (const p of items) {
                if (list) this.createRow(box, p);
                else this.createCard(box, p);
            }
        };
        if (this.groupBy === 'none') {
            fill(this.bodyEl, sorted);
        } else {
            for (const grp of groups) {
                const wrap = this.bodyEl.createDiv('lme-catalog-group');
                const collapsed = this.collapsedGroups.has(grp.label);
                if (collapsed) wrap.addClass('is-collapsed');
                const head = wrap.createDiv('lme-catalog-group-header');
                const toggle = head.createEl('button', { cls: 'lme-catalog-group-toggle', attr: { 'aria-expanded': String(!collapsed), 'aria-label': t('nav.collapseGroup') } });
                toggle.type = 'button';
                setIcon(toggle, 'chevron-down');
                toggle.onclick = () => this.toggleGroupCollapsed(grp.label, wrap, toggle);
                head.createSpan({ cls: 'lme-catalog-group-label', text: grp.label });
                head.createSpan({ cls: 'lme-catalog-group-count', text: String(grp.items.length) });
                fill(wrap, grp.items);
            }
        }
    }

    /** 折叠/展开一个分组(会话内记忆,筛选/重排/重渲后保持)。 */
    private toggleGroupCollapsed(label: string, wrap: HTMLElement, toggle: HTMLElement): void {
        const collapsing = !this.collapsedGroups.has(label);
        if (collapsing) {
            this.collapsedGroups.add(label);
            wrap.addClass('is-collapsed');
        } else {
            this.collapsedGroups.delete(label);
            wrap.removeClass('is-collapsed');
        }
        toggle.setAttr('aria-expanded', String(!collapsing));
    }

    private renderNoMatch(parent: HTMLElement): void {
        const empty = parent.createDiv('lme-catalog-empty');
        setIcon(empty.createDiv('lme-catalog-empty-icon'), 'search-x');
        empty.createEl('p', { text: t('nav.workshopCatalogNoMatch') });
    }

    // ── 卡片(用 div role=button,内含可点击 chip;避免 button 套 button 非法) ──

    private createCard(parent: HTMLElement, p: WorkshopNoteProps): void {
        const card = parent.createDiv('lme-catalog-card');
        card.setAttr('role', 'button');
        card.setAttr('tabindex', '0');
        if (p.practiced) card.addClass('is-practiced');

        const open = () => { void this.plugin.openWorkshopWithFile(p.file); };
        const preview = () => { new NotePreviewModal(this.app, p.file).open(); };
        card.setAttr('title', t('notePreview.cardHint'));
        card.onclick = (e: MouseEvent) => {
            if (e.shiftKey) { e.preventDefault(); preview(); return; }
            open();
        };
        card.onkeydown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (e.shiftKey) { preview(); } else { open(); }
            }
        };

        // 封面(frontmatter「封面」链接):满幅顶图;无封面保持纯文字布局。
        const coverSrc = resolveCoverSrc(this.app, p.cover, p.path);
        if (coverSrc) {
            card.createEl('img', {
                cls: 'lme-catalog-card-cover',
                attr: {
                    src: coverSrc,
                    alt: p.title,
                    loading: 'lazy',
                    decoding: 'async',
                    referrerpolicy: 'no-referrer',
                },
            });
        }

        // 头部:标题(+ 未设影片提示)。来源(播放)图标按需求精简移除。
        const head = card.createDiv('lme-catalog-card-head');
        head.createEl('strong', { cls: 'lme-catalog-card-title', text: p.title });
        if (!p.hasVideo) {
            const warn = head.createDiv('lme-catalog-card-novideo');
            setIcon(warn, 'alert-circle');
            warn.setAttr('title', t('nav.workshopCatalogNoVideo'));
        }

        // meta 行:时长居左 + 删除按钮居右(仅图标,直接删,与时间同行省一行空间)
        const metaRow = card.createDiv('lme-catalog-card-metarow');
        const dur = formatDuration(p.durationMs);
        if (dur) metaRow.createSpan({ cls: 'lme-catalog-card-meta', text: dur });
        const del = metaRow.createEl('button', { cls: 'lme-catalog-card-delete' });
        del.type = 'button';
        del.setAttr('title', t('nav.workshopCatalogDeleteTitle'));
        del.setAttr('aria-label', t('nav.workshopCatalogDeleteTitle'));
        setIcon(del, 'trash-2');
        del.onclick = (e: MouseEvent) => { e.stopPropagation(); void this.deleteNote(p); };

        // 标签 chips(点击切换筛选;CSS 限制最多两行,贴卡片底部)
        if (p.tags.length) {
            const tagRow = card.createDiv('lme-catalog-card-tagchips');
            for (const tag of p.tags) {
                const c = tagRow.createEl('button', { cls: 'lme-catalog-card-tagchip' + (this.filterTags.includes(tag) ? ' is-active' : '') });
                c.type = 'button';
                c.createSpan({ text: '#' + tag });
                c.onclick = (e: MouseEvent) => { e.stopPropagation(); this.toggleTag(tag); };
            }
        }
    }

    // ── 列表视图行(极简:左标题 / 右属性 / 末尾删除) ──

    private createRow(parent: HTMLElement, p: WorkshopNoteProps): void {
        const row = parent.createDiv('lme-catalog-row');
        row.setAttr('role', 'button');
        row.setAttr('tabindex', '0');

        const open = () => { void this.plugin.openWorkshopWithFile(p.file); };
        const preview = () => { new NotePreviewModal(this.app, p.file).open(); };
        row.setAttr('title', t('notePreview.cardHint'));
        row.onclick = (e: MouseEvent) => {
            if (e.shiftKey) { e.preventDefault(); preview(); return; }
            open();
        };
        row.onkeydown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (e.shiftKey) { preview(); } else { open(); }
            }
        };

        // 封面缩略图(无封面不占位)
        const coverSrc = resolveCoverSrc(this.app, p.cover, p.path);
        if (coverSrc) {
            row.createEl('img', {
                cls: 'lme-catalog-row-cover',
                attr: {
                    src: coverSrc,
                    alt: p.title,
                    loading: 'lazy',
                    decoding: 'async',
                    referrerpolicy: 'no-referrer',
                },
            });
        }

        // 左:标题
        row.createEl('span', { cls: 'lme-catalog-row-title', text: p.title });

        // 右:属性(来源 · 时长 · 段数 · 练习态),纯文本、紧凑
        const attrs: string[] = [sourceLabel(p.source)];
        const dur = formatDuration(p.durationMs);
        if (dur) attrs.push(dur);
        if (p.segmentCount > 0) attrs.push(t('nav.workshopCatalogSegs', { n: String(p.segmentCount) }));
        if (p.practiced) {
            attrs.push(p.practiceCount > 1
                ? t('nav.workshopCatalogPracticedTimes', { n: String(p.practiceCount) })
                : t('nav.workshopCatalogFilterPracticed'));
        }
        row.createEl('span', { cls: 'lme-catalog-row-attrs', text: attrs.join(' · ') });

        // 末尾:删除(stopPropagation 避免触发行打开)
        const del = row.createEl('button', { cls: 'lme-catalog-row-delete' });
        del.type = 'button';
        del.setAttr('title', t('nav.workshopCatalogDeleteTitle'));
        del.setAttr('aria-label', t('nav.workshopCatalogDeleteTitle'));
        setIcon(del, 'trash-2');
        del.onclick = (e: MouseEvent) => { e.stopPropagation(); this.confirmDelete(p); };
    }

    private confirmDelete(p: WorkshopNoteProps): void {
        new ConfirmModal(this.app, {
            title: t('nav.workshopCatalogDeleteTitle'),
            message: t('nav.workshopCatalogDeleteConfirm', { title: p.title }),
            confirmText: t('nav.workshopCatalogDeleteConfirmBtn'),
            cancelText: t('common.cancel'),
            confirmStyle: 'danger',
            onConfirm: () => { void this.deleteNote(p); },
        }).open();
    }

    /** 移到 Obsidian 垃圾桶(遵循用户「已删除文件」设置);列表经 vault delete 事件自动重渲。 */
    private async deleteNote(p: WorkshopNoteProps): Promise<void> {
        try {
            await this.app.vault.trash(p.file);
        } catch (e) {
            console.warn('[LME] delete workshop note failed', e);
            new Notice(t('nav.workshopCatalogDeleteFailed'));
        }
    }

    // ── 视图模式 / 筛选态同步 ──

    private setViewMode(mode: 'grid' | 'list'): void {
        if (this.viewMode === mode) return;
        this.viewMode = mode;
        this.writeStoredViewMode(mode);
        this.applyViewToggleStates();
        this.renderList();
    }

    private applyViewToggleStates(): void {
        const grid = this.viewMode === 'grid';
        if (this.gridBtn) {
            this.gridBtn.classList.toggle('is-active', grid);
            this.gridBtn.setAttr('aria-pressed', String(grid));
        }
        if (this.listBtn) {
            this.listBtn.classList.toggle('is-active', !grid);
            this.listBtn.setAttr('aria-pressed', String(!grid));
        }
    }

    /** 同步三个筛选 select 的 .is-active 与清除按钮显隐(renderList 末尾调用)。 */
    private refreshFilterStates(): void {
        this.toggleSelectActive(this.filterPracticeSelect, this.filterPractice !== 'all');
        this.toggleSelectActive(this.filterSourceSelect, this.filterSource !== 'all');
        this.toggleSelectActive(this.channelSelect, this.filterChannel !== 'all');
        // 标签下拉与 chip 同步:仅当恰好选中一个标签时显示该值,多选时回显"全部"(实际状态看 chip 行)
        if (this.tagSelect) {
            this.tagSelect.value = this.filterTags.length === 1 ? this.filterTags[0] : 'all';
            this.toggleSelectActive(this.tagSelect, this.filterTags.length > 0);
        }
        const anyFilter = this.filterPractice !== 'all'
            || this.filterSource !== 'all'
            || this.filterChannel !== 'all'
            || this.filterTags.length > 0;
        if (this.clearBtn) this.clearBtn.style.display = anyFilter ? 'inline-flex' : 'none';
    }

    private toggleSelectActive(sel: HTMLSelectElement | null, on: boolean): void {
        if (!sel) return;
        sel.classList.toggle('is-active', on);
    }

    private clearFilters(): void {
        this.filterPractice = 'all';
        this.filterSource = 'all';
        this.filterChannel = 'all';
        this.filterTags = [];
        if (this.filterPracticeSelect) this.filterPracticeSelect.value = 'all';
        if (this.filterSourceSelect) this.filterSourceSelect.value = 'all';
        if (this.channelSelect) this.channelSelect.value = 'all';
        if (this.tagSelect) this.tagSelect.value = 'all';
        this.renderList();
    }

    private readStoredViewMode(): 'grid' | 'list' {
        try {
            return localStorage.getItem(VIEW_MODE_KEY) === 'list' ? 'list' : 'grid';
        } catch {
            return 'grid';
        }
    }

    private writeStoredViewMode(mode: 'grid' | 'list'): void {
        try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* localStorage 不可用时静默 */ }
    }

    // ── 卡片大小(小/中/大,持久化到 localStorage) ──

    private static readonly CARD_SIZE_KEY = 'lme-workshop-catalog-size';

    private applyCardSize(): void {
        this.contentEl.removeClass('is-size-small', 'is-size-medium', 'is-size-large');
        this.contentEl.addClass(`is-size-${this.cardSize}`);
    }

    private readStoredCardSize(): 'small' | 'medium' | 'large' {
        try {
            const stored = localStorage.getItem(WorkshopCatalogView.CARD_SIZE_KEY);
            return stored === 'small' || stored === 'large' ? stored : 'medium';
        } catch {
            return 'medium';
        }
    }

    private writeStoredCardSize(size: 'small' | 'medium' | 'large'): void {
        try { localStorage.setItem(WorkshopCatalogView.CARD_SIZE_KEY, size); } catch { /* localStorage 不可用时静默 */ }
    }

    private toggleTag(tag: string): void {
        this.filterTags = this.filterTags.includes(tag)
            ? this.filterTags.filter((x) => x !== tag)
            : [...this.filterTags, tag];
        this.renderList();
    }

    /** ms → "last Nd ago" / "3 天前练习";>30d 或未来时间回退绝对日期。 */
    private relTime(ms: number): string {
        const diff = Date.now() - ms;
        const day = 86400000;
        if (diff < 0 || diff >= 30 * day) return new Date(ms).toLocaleDateString();
        const days = Math.floor(diff / day);
        if (days >= 1) return t('nav.workshopCatalogLastAgo', { n: String(days), unit: t('nav.workshopCatalogUnitDay') });
        const hours = Math.floor(diff / 3600000);
        if (hours >= 1) return t('nav.workshopCatalogLastAgo', { n: String(hours), unit: t('nav.workshopCatalogUnitHour') });
        const mins = Math.max(1, Math.floor(diff / 60000));
        return t('nav.workshopCatalogLastAgo', { n: String(mins), unit: t('nav.workshopCatalogUnitMin') });
    }

    // ── 排序 / 筛选 / 分组 ────────────────────────────────────

    private filterProps(list: WorkshopNoteProps[]): WorkshopNoteProps[] {
        const q = this.searchText.trim().toLowerCase();
        return list.filter((p) => {
            if (this.filterPractice === 'practiced' && !p.practiced) return false;
            if (this.filterPractice === 'not' && p.practiced) return false;
            if (this.filterSource !== 'all' && p.source !== this.filterSource) return false;
            if (this.filterChannel !== 'all' && p.channel !== this.filterChannel) return false;
            if (this.filterTags.length && !this.filterTags.some((tag) => p.tags.includes(tag))) return false;
            if (q) {
                const hay = `${p.title} ${p.channel} ${p.tags.join(' ')}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }

    private sortProps(list: WorkshopNoteProps[]): WorkshopNoteProps[] {
        const dir = this.sortDir === 'asc' ? 1 : -1;
        const key = this.sortKey;
        const num = (p: WorkshopNoteProps): number => {
            switch (key) {
                case 'duration': return p.durationMs;
                case 'lastPracticedAt': return p.lastPracticedAt;
                case 'segmentCount': return p.segmentCount;
                case 'dateAdded':
                default: return p.dateAdded;
            }
        };
        return [...list].sort((a, b) => {
            let cmp: number;
            if (key === 'title') {
                cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
            } else {
                const va = num(a), vb = num(b);
                cmp = va < vb ? -1 : va > vb ? 1 : 0;
            }
            if (cmp === 0) cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
            return cmp * dir;
        });
    }

    private groupProps(list: WorkshopNoteProps[]): { label: string; items: WorkshopNoteProps[] }[] {
        const g = this.groupBy;
        if (g === 'none') return [{ label: '', items: list }];
        const buckets = new Map<string, WorkshopNoteProps[]>();
        const order: string[] = [];
        for (const p of list) {
            const keys: string[] = [];
            if (g === 'channel') keys.push(p.channel || '__nochannel__');
            else if (g === 'source') keys.push(p.source);
            else if (g === 'practice') keys.push(p.practiced ? '__practiced__' : '__notpracticed__');
            else if (g === 'month') keys.push(monthKey(p.dateAdded));
            else if (g === 'tags') keys.push(...(p.tags.length ? p.tags : ['__notags__']));
            for (const key of keys) {
                if (!buckets.has(key)) { buckets.set(key, []); order.push(key); }
                buckets.get(key)!.push(p);
            }
        }
        if (g === 'practice') order.sort((a) => (a === '__practiced__' ? -1 : 1));
        else if (g === 'month') order.sort((a, b) => b.localeCompare(a));
        else if (g === 'source') order.sort();
        else if (g === 'channel') order.sort((a, b) => (a === '__nochannel__' ? 1 : a.localeCompare(b)));
        else if (g === 'tags') order.sort((a, b) => (a === '__notags__' ? 1 : b === '__notags__' ? -1 : a.localeCompare(b)));
        return order.map((k) => ({ label: this.groupLabel(g, k), items: buckets.get(k)! }));
    }

    private groupLabel(g: GroupKey, key: string): string {
        if (g === 'channel') return key === '__nochannel__' ? t('nav.workshopCatalogNoChannel') : key;
        if (g === 'tags') return key === '__notags__' ? t('nav.workshopCatalogNoTags') : '#' + key;
        if (g === 'source') return sourceLabel(key as NoteSource);
        if (g === 'practice') return key === '__practiced__' ? t('nav.workshopCatalogFilterPracticed') : t('nav.workshopCatalogFilterNot');
        return key; // month → "YYYY-MM"
    }

    // ── 事件绑定(文件夹范围,去抖) ─────────────────────────────

    private bindFolderEvents(): void {
        if (this.eventsBound) return; // onOpen 可能被 refreshGatedViews 重调,防重复
        this.eventsBound = true;
        const inFolder = (p: string): boolean => p === this.getFolder() || p.startsWith(this.folderPrefix());
        const isTFile = (f: any): f is TFile => f instanceof TFile;
        this.registerEvent(this.app.vault.on('create', (f) => { if (isTFile(f) && inFolder(f.path)) this.scheduleRefresh(); }));
        this.registerEvent(this.app.vault.on('delete', (f) => { if (isTFile(f) && inFolder(f.path)) this.scheduleRefresh(); }));
        this.registerEvent(this.app.vault.on('rename', (f, old) => {
            if ((isTFile(f) && inFolder(f.path)) || inFolder(old)) this.scheduleRefresh();
        }));
        this.registerEvent(this.app.metadataCache.on('changed', (f) => {
            if (isTFile(f) && inFolder(f.path)) { this.parseCache.delete(f.path); this.scheduleRefresh(); }
        }));
    }

    private scheduleRefresh(): void {
        if (this.refreshTimer != null) window.clearTimeout(this.refreshTimer);
        this.refreshTimer = window.setTimeout(() => {
            this.refreshTimer = null;
            void this.refresh();
        }, REFRESH_DEBOUNCE_MS);
    }

    // ── 杂项 ───────────────────────────────────────────────────

    /** 目录文件夹:主存储在插件 sidecar workshop-catalog.json(跨设备同步,
     *  data.json 里的 workshopCatalogFolder 会被另一端旧快照覆写),经 plugin 读取。 */
    private getFolder(): string {
        return this.plugin.getWorkshopFolder();
    }

    private folderPrefix(): string {
        const f = this.getFolder();
        return f.endsWith('/') ? f : f + '/';
    }

    private isDefaultFolder(): boolean {
        return !this.plugin.getWorkshopFolderRaw();
    }

    private async listMarkdownFiles(folder: string): Promise<TFile[]> {
        const adapter = this.app.vault.adapter as any;
        try {
            if (!(await adapter.exists(folder))) return [];
        } catch { return []; }
        const prefix = folder.endsWith('/') ? folder : folder + '/';
        return this.app.vault.getMarkdownFiles()
            .filter((f: TFile) => f.path === folder || f.path.startsWith(prefix));
    }

    /** 空态分两种病因:文件夹在本设备不存在(未同步/被同步排除) vs 文件夹在但没有笔记。 */
    private async renderEmpty(parent: HTMLElement, folder: string): Promise<void> {
        const empty = parent.createDiv('lme-catalog-empty');
        let missing = false;
        try {
            missing = !(await (this.app.vault.adapter as any).exists(folder));
        } catch { /* 检查失败按"没有笔记"文案展示 */ }
        setIcon(empty.createDiv('lme-catalog-empty-icon'), missing ? 'folder-off' : 'folder-open');
        empty.createEl('p', {
            text: missing
                ? t('nav.workshopCatalogFolderMissing', { folder })
                : t('nav.workshopCatalogEmpty', { folder }),
        });
        const btn = empty.createEl('button', { cls: 'mod-cta', text: t('nav.workshopCatalogOpenSettings') });
        btn.onclick = () => this.openSettings();
    }

    private openSettings(): void {
        try {
            const setting = (this.app as any).setting;
            if (setting?.openTabById) {
                setting.openTabById('language-made-easy');
            } else if (setting?.openTab) {
                setting.openTab();
            } else {
                new Notice(t('nav.workshopCatalogChangeFolder'));
            }
        } catch {
            new Notice(t('nav.workshopCatalogChangeFolder'));
        }
    }
}
