// @ts-nocheck
// ============================================================
// Language Made Easy - AI 解析报告管理目录页
// ============================================================
// 从导航页「AI 解析」进入。数据源 = plugin.settings.aiAnalysisHistory(历史报告数组,
// 非仓库文件夹)。支持卡片/列表视图、按时间排序、按标题搜索、按月份/类型分组、
// 清空全部;每项可 下载至仓库 / 下载为图片 / 删除;点击打开预览弹窗。
// 结构仿 workshop-catalog-view,复用 lme-catalog-* 样式。

import { ItemView, WorkspaceLeaf, Notice, setIcon } from 'obsidian';
import type LanguageMadeEasyPlugin from '../main-unified-full';
import type { AIAnalysisHistoryEntry } from '../models';
import { t } from '../i18n';
import { ConfirmModal } from '../ui/confirm-modal';
import { AIReportPreviewModal } from '../ui/ai-report-preview-modal';
import {
	resolvePromptName,
} from '../utils/ai-report';
import { UpgradeModal } from '../ui/upgrade-modal';

export const AI_REPORT_CATALOG_VIEW_TYPE = 'lme-ai-report-catalog';
const VIEW_MODE_KEY = 'lme-ai-report-catalog-view';

type GroupKey = 'none' | 'month' | 'type';
interface Opt { value: string; label: string }

export class AIReportCatalogView extends ItemView {
	private plugin: LanguageMadeEasyPlugin;

	private allEntries: AIAnalysisHistoryEntry[] = [];
	private sortDir: 'asc' | 'desc' = 'desc';      // 默认新的在前
	private groupBy: GroupKey = 'none';
	private searchText = '';
	private viewMode: 'grid' | 'list' = 'grid';

	// 工具栏控件引用
	private gridBtn: HTMLButtonElement | null = null;
	private listBtn: HTMLButtonElement | null = null;
	private dirBtn: HTMLButtonElement | null = null;
	// 渲染容器(只重建这三处)
	private resultsEl: HTMLElement | null = null;
	private bodyEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LanguageMadeEasyPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.viewMode = this.readStoredViewMode();
	}

	getViewType(): string { return AI_REPORT_CATALOG_VIEW_TYPE; }
	getDisplayText(): string { return t('nav.aiReportCatalogTitle'); }
	getIcon(): string { return 'sparkles'; }

	async onOpen() {
		await this.render();
	}

	async onClose() {
		this.gridBtn = this.listBtn = this.dirBtn = null;
		this.resultsEl = this.bodyEl = null;
		this.contentEl.empty();
	}

	/** 外部刷新(新报告生成后由 plugin.refreshAiReportCatalog 调用)。 */
	async refresh(): Promise<void> {
		await this.render();
	}

	private async render() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('lme-catalog-view');

		this.allEntries = this.plugin.settings.aiAnalysisHistory || [];

		// Header
		const header = contentEl.createDiv('lme-catalog-header');
		header.createEl('h2', { text: t('nav.aiReportCatalogTitle') });
		header.createEl('p', { text: t('nav.aiReportCatalogDesc'), cls: 'lme-catalog-sub' });

		if (this.allEntries.length === 0) {
			this.renderEmpty(contentEl);
			return;
		}

		this.buildToolbar(contentEl);
		this.resultsEl = contentEl.createDiv('lme-catalog-results-meta');
		this.bodyEl = contentEl.createDiv('lme-catalog-body');
		this.renderList();
	}

	// ── 工具栏 ─────────────────────────────────────────────────

	private buildToolbar(parent: HTMLElement): void {
		const tb = parent.createDiv('lme-catalog-toolbar');

		// 搜索
		const search = tb.createEl('input', { cls: 'lme-catalog-search' });
		search.type = 'search';
		search.placeholder = t('nav.aiReportCatalogSearch');
		search.value = this.searchText;
		search.setAttr('aria-label', t('nav.aiReportCatalogSearch'));
		search.oninput = () => { this.searchText = search.value; this.renderList(); };

		// 视图切换
		const viewZone = tb.createDiv('lme-catalog-zone');
		const toggle = viewZone.createDiv('lme-catalog-viewtoggle');
		toggle.setAttr('role', 'group');
		toggle.setAttr('aria-label', t('nav.aiReportCatalogViewAria'));
		this.gridBtn = this.viewBtn(toggle, 'layout-grid', t('nav.aiReportCatalogViewGrid'), () => this.setViewMode('grid'));
		this.listBtn = this.viewBtn(toggle, 'list', t('nav.aiReportCatalogViewList'), () => this.setViewMode('list'));
		this.applyViewToggleStates();

		// 排序方向(只按时间)
		const sortZone = tb.createDiv('lme-catalog-zone');
		sortZone.createSpan({ cls: 'lme-catalog-zone-label', text: t('nav.aiReportCatalogSortDesc') });
		this.dirBtn = sortZone.createEl('button', { cls: 'lme-catalog-dir' });
		this.applyDirIcon();
		this.dirBtn.onclick = () => {
			this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
			this.applyDirIcon();
			this.renderList();
		};

		// 分组
		const groupZone = tb.createDiv('lme-catalog-zone');
		groupZone.createSpan({ cls: 'lme-catalog-zone-label', text: t('nav.aiReportCatalogGroupLabel') });
		const groupOpts: Opt[] = [
			{ value: 'none', label: t('nav.aiReportCatalogGroupNone') },
			{ value: 'month', label: t('nav.aiReportCatalogGroupMonth') },
			{ value: 'type', label: t('nav.aiReportCatalogGroupType') },
		];
		groupZone.appendChild(this.buildSelect(groupOpts, this.groupBy, (v) => { this.groupBy = v as GroupKey; }));

		// 清空全部
		const clearBtn = tb.createEl('button', { cls: 'lme-catalog-clear' });
		clearBtn.type = 'button';
		setIcon(clearBtn, 'trash');
		clearBtn.createSpan({ text: t('nav.aiReportCatalogClearAll') });
		clearBtn.onclick = () => this.confirmClearAll();
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

	private buildSelect(opts: Opt[], current: string, onPick: (v: string) => void): HTMLSelectElement {
		const sel = createEl('select');
		sel.className = 'lme-catalog-select';
		for (const o of opts) {
			const opt = createEl('option');
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
		this.dirBtn.setAttr('title', asc ? t('nav.aiReportCatalogSortAsc') : t('nav.aiReportCatalogSortDesc'));
		setIcon(this.dirBtn, asc ? 'arrow-up-narrow-wide' : 'arrow-down-narrow-wide');
	}

	// ── 列表渲染 ───────────────────────────────────────────────

	private renderList(): void {
		if (!this.bodyEl || !this.resultsEl) return;
		const filtered = this.filterEntries(this.allEntries);
		const sorted = this.sortEntries(filtered);
		const groups = this.groupEntries(sorted);

		// 结果计数
		this.resultsEl.empty();
		this.resultsEl.createSpan({
			text: t('nav.aiReportCatalogResultsMeta', { total: String(this.allEntries.length) }),
		});

		// 主体
		this.bodyEl.empty();
		if (filtered.length === 0) {
			this.renderNoMatch(this.bodyEl);
			return;
		}
		const list = this.viewMode === 'list';
		const containerCls = list ? 'lme-catalog-list' : 'lme-catalog-grid';
		const fill = (boxParent: HTMLElement, items: AIAnalysisHistoryEntry[]): void => {
			const box = boxParent.createDiv(containerCls);
			for (const e of items) {
				if (list) this.createRow(box, e);
				else this.createCard(box, e);
			}
		};
		if (this.groupBy === 'none') {
			fill(this.bodyEl, sorted);
		} else {
			for (const grp of groups) {
				const wrap = this.bodyEl.createDiv('lme-catalog-group');
				const head = wrap.createDiv('lme-catalog-group-header');
				head.createSpan({ cls: 'lme-catalog-group-label', text: grp.label });
				head.createSpan({ cls: 'lme-catalog-group-count', text: String(grp.items.length) });
				fill(wrap, grp.items);
			}
		}
	}

	private renderNoMatch(parent: HTMLElement): void {
		const empty = parent.createDiv('lme-catalog-empty');
		setIcon(empty.createDiv('lme-catalog-empty-icon'), 'search-x');
		empty.createEl('p', { text: t('nav.aiReportCatalogNoMatch') });
	}

	private renderEmpty(parent: HTMLElement): void {
		const empty = parent.createDiv('lme-catalog-empty');
		setIcon(empty.createDiv('lme-catalog-empty-icon'), 'sparkles');
		empty.createEl('p', { text: t('nav.aiReportCatalogEmpty') });
		const newBtn = empty.createEl('button', { cls: 'lme-catalog-empty-btn' });
		newBtn.type = 'button';
		setIcon(newBtn, 'plus');
		newBtn.createSpan({ text: t('nav.aiReportCatalogNew') });
		newBtn.onclick = () => { void this.plugin.pickDocumentForAIAnalysis(); };
	}

	// ── 卡片 / 行 ──────────────────────────────────────────────

	private createCard(parent: HTMLElement, e: AIAnalysisHistoryEntry): void {
		const card = parent.createDiv('lme-catalog-card');
		card.setAttr('role', 'button');
		card.setAttr('tabindex', '0');
		card.setAttr('title', t('nav.aiReportCatalogPreviewHint'));
		card.onclick = () => this.preview(e);
		card.onkeydown = (ev: KeyboardEvent) => {
			if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this.preview(e); }
		};

		const head = card.createDiv('lme-catalog-card-head');
		head.createEl('strong', { cls: 'lme-catalog-card-title', text: e.title });

		// meta:时间
		card.createDiv('lme-catalog-card-meta').createSpan({ text: this.formatTime(e.timestamp) });

		// 类型 chip + 操作按钮(同一行)
		const acts = card.createDiv('lme-catalog-card-tagchips');
		const typeName = resolvePromptName(e);
		if (typeName) {
			const tc = acts.createSpan({ cls: 'lme-catalog-card-tagchip is-static' });
			tc.createSpan({ text: typeName });
		}
		this.appendActionBtns(acts, e);
	}

	private createRow(parent: HTMLElement, e: AIAnalysisHistoryEntry): void {
		const row = parent.createDiv('lme-catalog-row');
		row.setAttr('role', 'button');
		row.setAttr('tabindex', '0');
		row.setAttr('title', t('nav.aiReportCatalogPreviewHint'));
		row.onclick = () => this.preview(e);
		row.onkeydown = (ev: KeyboardEvent) => {
			if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this.preview(e); }
		};

		row.createSpan({ cls: 'lme-catalog-row-title', text: e.title });

		const attrs: string[] = [this.formatTime(e.timestamp)];
		const typeName = resolvePromptName(e);
		if (typeName) attrs.push(typeName);
		row.createSpan({ cls: 'lme-catalog-row-attrs', text: attrs.join(' · ') });

		this.appendActionBtns(row, e);
	}

	/** 三按钮:下载至仓库 / 下载为图片 / 删除(stopPropagation 避免触发卡片/行点击)。 */
	private appendActionBtns(parent: HTMLElement, e: AIAnalysisHistoryEntry): void {
		const mk = (icon: string, label: string, onClick: () => void): HTMLButtonElement => {
			const b = parent.createEl('button', { cls: 'lme-catalog-row-delete' });
			b.type = 'button';
			b.setAttr('title', label);
			b.setAttr('aria-label', label);
			setIcon(b, icon);
			b.onclick = (ev: MouseEvent) => { ev.stopPropagation(); onClick(); };
			return b;
		};
		// 社区免费版:下载至仓库/下载为图片为完整版功能,按钮保留,点击弹付费引导
		mk('download', t('nav.aiReportCatalogDownloadMd'), () => { new UpgradeModal(this.app, t('nav.aiReportCatalogDownloadMd')).open(); });
		mk('image', t('nav.aiReportCatalogDownloadImage'), () => { new UpgradeModal(this.app, t('nav.aiReportCatalogDownloadImage')).open(); });
		mk('trash-2', t('nav.aiReportCatalogDeleteTitle'), () => this.confirmDelete(e));
	}

	private preview(e: AIAnalysisHistoryEntry): void {
		new AIReportPreviewModal(this.app, this.plugin, e).open();
	}

	// ── 删除 / 清空 ────────────────────────────────────────────

	private confirmDelete(e: AIAnalysisHistoryEntry): void {
		new ConfirmModal(this.app, {
			title: t('nav.aiReportCatalogDeleteTitle'),
			message: t('nav.aiReportCatalogDeleteConfirm', { title: e.title }),
			confirmText: t('nav.aiReportCatalogDeleteConfirmBtn'),
			cancelText: t('common.cancel'),
			confirmStyle: 'danger',
			onConfirm: () => { void this.deleteEntry(e); },
		}).open();
	}

	private async deleteEntry(e: AIAnalysisHistoryEntry): Promise<void> {
		this.plugin.settings.aiAnalysisHistory = (this.plugin.settings.aiAnalysisHistory || [])
			.filter((x) => x.id !== e.id);
		await this.plugin.saveSettings();
		await this.render();
	}

	private confirmClearAll(): void {
		new ConfirmModal(this.app, {
			title: t('nav.aiReportCatalogClearAll'),
			message: t('nav.aiReportCatalogClearAllConfirm', { total: String(this.allEntries.length) }),
			confirmText: t('nav.aiReportCatalogClearAllConfirmBtn'),
			cancelText: t('common.cancel'),
			confirmStyle: 'danger',
			onConfirm: () => { void this.clearAll(); },
		}).open();
	}

	private async clearAll(): Promise<void> {
		this.plugin.settings.aiAnalysisHistory = [];
		await this.plugin.saveSettings();
		new Notice(t('nav.aiReportCatalogClearAllDone'));
		await this.render();
	}

	// ── 视图模式 ───────────────────────────────────────────────

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

	// ── 搜索 / 排序 / 分组 ─────────────────────────────────────

	private filterEntries(list: AIAnalysisHistoryEntry[]): AIAnalysisHistoryEntry[] {
		const q = this.searchText.trim().toLowerCase();
		if (!q) return list;
		return list.filter((e) => {
			const hay = `${e.title} ${resolvePromptName(e)}`.toLowerCase();
			return hay.includes(q);
		});
	}

	private sortEntries(list: AIAnalysisHistoryEntry[]): AIAnalysisHistoryEntry[] {
		const dir = this.sortDir === 'asc' ? 1 : -1;
		return [...list].sort((a, b) => (a.timestamp - b.timestamp) * dir);
	}

	private groupEntries(list: AIAnalysisHistoryEntry[]): { label: string; items: AIAnalysisHistoryEntry[] }[] {
		const g = this.groupBy;
		if (g === 'none') return [{ label: '', items: list }];
		const buckets = new Map<string, AIAnalysisHistoryEntry[]>();
		const order: string[] = [];
		for (const e of list) {
			const key = g === 'month' ? monthKey(e.timestamp) : (resolvePromptName(e) || '__notype__');
			if (!buckets.has(key)) { buckets.set(key, []); order.push(key); }
			buckets.get(key)!.push(e);
		}
		if (g === 'month') order.sort((a, b) => b.localeCompare(a));
		else order.sort((a, b) => (a === '__notype__' ? 1 : b === '__notype__' ? -1 : a.localeCompare(b)));
		return order.map((k) => ({
			label: (g === 'month' ? k : (k === '__notype__' ? t('nav.aiReportCatalogNoType') : k)),
			items: buckets.get(k)!,
		}));
	}

	// ── 时间格式 ───────────────────────────────────────────────

	private formatTime(ms: number): string {
		const d = new Date(ms);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}
}

/** ms → "YYYY-MM"(本地年月,避开时区偏移)。 */
function monthKey(ms: number): string {
	const d = new Date(ms);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
