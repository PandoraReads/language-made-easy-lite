// ============================================================
// Language Made Easy - Flashcard Manager Modal (Redesigned)
// ============================================================

import { App, Modal, Notice, FuzzySuggestModal, setIcon } from 'obsidian';
import type LanguageMadeEasyPlugin from '../main-unified-full';
import { db } from '../core/Database';
import { SyncManager } from '../core/SyncManager';
import type { VocabularyEntry, FSRSData } from '../models';
import { randomUUID } from '../mocks/crypto';
import { t } from '../i18n';
import { FlashcardEditModal } from './flashcard-edit-modal';
import { UpgradeModal } from './upgrade-modal';
import { AddFlashcardModal } from '../views/flashcard-view';

type LanguageId = 'english' | 'german' | 'french' | 'spanish' | 'korean' | 'russian' | 'japanese' | 'chinese';
type MasteryFilter = 'all' | 'new' | 'learning' | 'mastered';
type SortField = 'addedTime' | 'reps' | 'word' | 'language';
type InlineEditableField = 'word' | 'phonetic' | 'partOfSpeech' | 'definition' | 'contextSnippet' | 'contextTranslation';

interface ManagedEntry extends VocabularyEntry {
	_mastered: boolean;
	_reps: number;
	_language: string;
}

const ALL_LANGUAGES: LanguageId[] = ['english', 'german', 'french', 'spanish', 'korean', 'russian', 'japanese', 'chinese'];

const LANG_FLAGS: Record<string, string> = {
	english: 'EN', german: 'DE', french: 'FR', spanish: 'ES',
	korean: 'KO', russian: 'RU', japanese: 'JA', chinese: 'ZH',
};

const LANG_NAMES: Record<string, string> = {
	english: 'English', german: 'Deutsch', french: 'Français', spanish: 'Español',
	korean: '한국어', russian: 'Русский', japanese: '日本語', chinese: '中文',
};

export class FlashcardManagerModal extends Modal {
	private plugin: LanguageMadeEasyPlugin;
	private styleEl: HTMLStyleElement | null = null;

	private filterLang: LanguageId | 'all' = 'all';
	private filterMastery: MasteryFilter = 'all';
	private searchQuery = '';
	private sortField: SortField = 'addedTime';
	private sortDesc = true;
	private selectedIds = new Set<string>();
	private page = 0;
	private readonly pageSize = 50;
	private allEntries: ManagedEntry[] = [];

	constructor(app: App, plugin: LanguageMadeEasyPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		this.injectStyles();
		const { contentEl, modalEl } = this;
		contentEl.empty();
		contentEl.addClass('lme-fmm');
		modalEl.addClass('lme-fmm-modal');

		this.buildHeader(contentEl);
		this.buildStats(contentEl);
		this.buildToolbar(contentEl);
		this.buildTableWrapper(contentEl);
		this.buildFooter(contentEl);

		this.loadData().then(() => {
			this.refresh();
		});
	}

	onClose() {
		this.contentEl.empty();
		if (this.styleEl?.parentNode) {
			this.styleEl.parentNode.removeChild(this.styleEl);
			this.styleEl = null;
		}
	}

	// ── UI Construction ─────────────────────────────────────

	private headerEl!: HTMLElement;
	private statEls: HTMLElement[] = [];
	private toolbarEl!: HTMLElement;
	private tableEl!: HTMLElement;
	private footerEl!: HTMLElement;
	private searchInput!: HTMLInputElement;
	private langSelect!: HTMLSelectElement;
	private masteryBtns: HTMLButtonElement[] = [];
	private deleteBtn!: HTMLButtonElement;
	private pagePrevBtn!: HTMLButtonElement;
	private pageNextBtn!: HTMLButtonElement;
	private pageInfo!: HTMLElement;
	private selectAllCheck!: HTMLInputElement;

	private buildHeader(root: HTMLElement) {
		const header = root.createDiv('lme-fmm-header');
		header.createEl('h2', { text: t('flashcardManager.title') });

		const right = header.createDiv('lme-fmm-header-right');

		this.searchInput = right.createEl('input', {
			type: 'text',
			placeholder: t('flashcardManager.searchPlaceholder'),
			cls: 'lme-fmm-search',
		});
		this.searchInput.oninput = () => {
			this.searchQuery = this.searchInput.value.trim().toLowerCase();
			this.page = 0;
			this.selectedIds.clear();
			this.refresh();
		};

		const closeBtn = right.createEl('button', { cls: 'lme-fmm-close-btn', attr: { 'aria-label': 'Close' } });
		setIcon(closeBtn, 'x');
		closeBtn.onclick = () => this.close();

		this.headerEl = header;
	}

	private buildStats(root: HTMLElement) {
		const row = root.createDiv('lme-fmm-stats');
		const configs = [
			{ cls: 'lme-fmm-stat-total', label: t('flashcardManager.total'), icon: 'list' },
			{ cls: 'lme-fmm-stat-new', label: t('flashcardManager.newCards'), icon: 'sparkles' },
			{ cls: 'lme-fmm-stat-learning', label: t('flashcardManager.learning'), icon: 'book-open' },
			{ cls: 'lme-fmm-stat-mastered', label: t('flashcardManager.mastered'), icon: 'check-circle' },
		];
		this.statEls = [];
		for (const c of configs) {
			const card = row.createDiv(`lme-fmm-stat-card ${c.cls}`);
			card.createEl('span', { cls: 'lme-fmm-stat-val', text: '0' });
			card.createEl('span', { cls: 'lme-fmm-stat-lbl', text: c.label });
			this.statEls.push(card);
		}
	}

	private buildToolbar(root: HTMLElement) {
		const toolbar = root.createDiv('lme-fmm-toolbar');
		this.toolbarEl = toolbar;

		// Language filter
		this.langSelect = toolbar.createEl('select', { cls: 'lme-fmm-select' });
		this.langSelect.createEl('option', { text: t('flashcardManager.allLanguages'), value: 'all' });
		for (const lang of ALL_LANGUAGES) {
			this.langSelect.createEl('option', {
				text: LANG_NAMES[lang],
				value: lang,
			});
		}
		this.langSelect.value = this.filterLang;
		this.langSelect.onchange = async () => {
			const v = this.langSelect.value;
			// 社区免费版:非英语语种弹付费引导,筛选保持原值
			if (v !== 'all' && v !== 'english') {
				this.langSelect.value = this.filterLang as string;
				new UpgradeModal(this.app, LANG_NAMES[v] || v).open();
				return;
			}
			this.filterLang = v as LanguageId | 'all';
			this.page = 0;
			this.selectedIds.clear();
			await this.loadData();
			this.refresh();
		};

		// Mastery pills
		const pillGroup = toolbar.createDiv('lme-fmm-pills');
		const masteryOptions: { value: MasteryFilter; label: string }[] = [
			{ value: 'all', label: t('flashcardManager.all') },
			{ value: 'new', label: t('flashcardManager.newCards') },
			{ value: 'learning', label: t('flashcardManager.learning') },
			{ value: 'mastered', label: t('flashcardManager.mastered') },
		];
		this.masteryBtns = [];
		for (const mo of masteryOptions) {
			const pill = pillGroup.createEl('button', {
				cls: `lme-fmm-pill ${this.filterMastery === mo.value ? 'is-active' : ''}`,
				text: mo.label,
			});
			pill.dataset.value = mo.value;
			this.masteryBtns.push(pill);
			pill.onclick = () => {
				this.filterMastery = mo.value;
				this.masteryBtns.forEach(p => p.toggleClass('is-active', p.dataset.value === mo.value));
				this.page = 0;
				this.selectedIds.clear();
				this.refresh();
			};
		}

			// Sort field
			const sortSelect = toolbar.createEl('select', { cls: 'lme-fmm-select' });
			sortSelect.createEl('option', { text: t('flashcardManager.sortByCreated'), value: 'addedTime' });
			sortSelect.createEl('option', { text: t('flashcardManager.sortByReviews'), value: 'reps' });
			sortSelect.createEl('option', { text: t('flashcardManager.sortByWord'), value: 'word' });
			sortSelect.createEl('option', { text: t('flashcardManager.sortByLanguage'), value: 'language' });
			sortSelect.value = this.sortField;
			sortSelect.onchange = () => {
				this.sortField = sortSelect.value as SortField;
				this.page = 0;
				this.refresh();
			};

			// Sort direction toggle
			const sortDirBtn = toolbar.createEl('button', {
				cls: 'lme-fmm-sort-dir',
				text: this.sortDesc ? '↓' : '↑',
			});
			sortDirBtn.onclick = () => {
				this.sortDesc = !this.sortDesc;
				sortDirBtn.textContent = this.sortDesc ? '↓' : '↑';
				this.page = 0;
				this.refresh();
			};

		// Spacer
		toolbar.createDiv('lme-fmm-spacer');

		// Action buttons
		this.deleteBtn = toolbar.createEl('button', {
			cls: 'lme-fmm-btn lme-fmm-btn-danger',
			text: t('flashcardManager.deleteSelected', { count: 0 }),
		});
		this.deleteBtn.disabled = true;
		this.deleteBtn.onclick = async () => {
			const count = this.selectedIds.size;
			if (count === 0) return;
			if (!confirm(t('flashcardManager.deleteConfirm', { count }))) return;
			await db.batchDeleteVocabulary(Array.from(this.selectedIds));
			new Notice(t('flashcardManager.deleted', { count }));
			this.selectedIds.clear();
			await this.loadData();
			this.page = 0;
			this.refresh();
		};

		const addBtn = toolbar.createEl('button', { cls: 'lme-fmm-btn lme-fmm-btn-add', text: t('flashcardManager.addNew') });
		setIcon(addBtn, 'plus');
		addBtn.onclick = () => {
			new AddFlashcardModal(this.app, this.plugin).open();
		};

		const exportBtn = toolbar.createEl('button', { cls: 'lme-fmm-btn', text: t('common.export') });
		// 社区免费版:数据导出为完整版功能,弹付费引导
		exportBtn.onclick = () => new UpgradeModal(this.app, t('common.export')).open();

		const importBtn = toolbar.createEl('button', { cls: 'lme-fmm-btn', text: t('common.import') });
		// 社区免费版:数据导入为完整版功能,弹付费引导
		importBtn.onclick = () => new UpgradeModal(this.app, t('common.import')).open();

		// Sync button (refresh icon, imports from sync file)
		const syncBtn = toolbar.createEl('button', { cls: 'lme-fmm-btn', attr: { 'aria-label': t('flashcardManager.syncData') } });
		setIcon(syncBtn, 'refresh-cw');
		syncBtn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;padding:6px 10px;';
		syncBtn.onclick = () => this.handleSync();
	}

	private buildTableWrapper(root: HTMLElement) {
		const wrapper = root.createDiv('lme-fmm-table-wrap');
		const table = wrapper.createEl('table', { cls: 'lme-fmm-table' });

		// Thead
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');

		// Checkbox column
		const thCheck = headerRow.createEl('th', { cls: 'lme-fmm-th-check' });
		this.selectAllCheck = thCheck.createEl('input', { type: 'checkbox', cls: 'lme-fmm-check' });
		this.selectAllCheck.onchange = () => {
			const filtered = this.getFilteredEntries();
			const start = this.page * this.pageSize;
			const pageEntries = filtered.slice(start, start + this.pageSize);
			if (this.selectAllCheck.checked) {
				for (const e of pageEntries) this.selectedIds.add(e.id);
			} else {
				for (const e of pageEntries) this.selectedIds.delete(e.id);
			}
			this.refresh();
		};

			const columns = [
				{ key: 'word', label: t('flashcardManager.sortByWord'), width: '13%' },
				{ key: 'phonetic', label: t('flashcardManager.phonetic'), width: '10%' },
				{ key: 'partOfSpeech', label: t('flashcardManager.partOfSpeech'), width: '8%' },
				{ key: 'definition', label: t('flashcardManager.definition'), width: '19%' },
				{ key: 'contextSnippet', label: t('flashcardManager.example'), width: '18%' },
				{ key: 'contextTranslation', label: t('flashcardManager.translation'), width: '14%' },
			{ key: 'language', label: t('flashcardManager.sortByLanguage'), width: '5%' },
			{ key: 'status', label: t('flashcardManager.status'), width: '7%' },
			{ key: 'reps', label: t('flashcardManager.sortByReviews'), width: '4%' },
			{ key: 'addedTime', label: t('flashcardManager.sortByCreated'), width: '7%' },
			{ key: 'actions', label: '', width: '6%' },
		];
		for (const col of columns) {
			const th = headerRow.createEl('th', { text: col.label });
			th.addClass(`lme-fmm-col-${col.key}`);
			if (col.width) th.style.width = col.width;
			if (['word', 'reps', 'addedTime', 'language'].includes(col.key)) {
				th.addClass('lme-fmm-sortable');
				th.onclick = () => {
					const field = col.key as SortField;
					if (this.sortField === field) {
						this.sortDesc = !this.sortDesc;
					} else {
						this.sortField = field;
						this.sortDesc = true;
					}
					this.page = 0;
					this.refresh();
				};
			}
		}

		// Tbody
		table.createEl('tbody', { cls: 'lme-fmm-tbody' });
		this.tableEl = table;
	}

	private buildFooter(root: HTMLElement) {
		const footer = root.createDiv('lme-fmm-footer');

		this.pagePrevBtn = footer.createEl('button', { cls: 'lme-fmm-page-btn', text: t('flashcardManager.prevPage') });
		this.pagePrevBtn.onclick = () => { this.page--; this.refresh(); };

		this.pageInfo = footer.createEl('span', { cls: 'lme-fmm-page-info', text: '1 / 1' });

		this.pageNextBtn = footer.createEl('button', { cls: 'lme-fmm-page-btn', text: t('flashcardManager.nextPage') });
		this.pageNextBtn.onclick = () => { this.page++; this.refresh(); };

		this.footerEl = footer;
	}

	// ── Data ────────────────────────────────────────────────

	private async loadData() {
		const langs = this.filterLang === 'all' ? ALL_LANGUAGES : [this.filterLang];
		const entries: ManagedEntry[] = [];
		for (const lang of langs) {
			const withMastery = await db.getVocabularyWithMastery(lang);
			const logs = await db.getReviewLogsByLanguage(lang);
			const repsMap = new Map<string, number>();
			for (const log of logs) {
				repsMap.set(log.vocabId, (repsMap.get(log.vocabId) || 0) + 1);
			}
			for (const entry of withMastery) {
				entries.push({ ...entry, _reps: repsMap.get(entry.id) || 0, _language: lang });
			}
		}
		this.allEntries = entries;
	}

	private getFilteredEntries(): ManagedEntry[] {
		let entries = this.allEntries;

		if (this.filterMastery === 'new') {
			entries = entries.filter(e => e.fsrsData.state === 0 && !e._mastered);
		} else if (this.filterMastery === 'learning') {
			entries = entries.filter(e => e.fsrsData.state !== 0 && !e._mastered);
		} else if (this.filterMastery === 'mastered') {
			entries = entries.filter(e => e._mastered);
		}

		if (this.searchQuery) {
			entries = entries.filter(e =>
				e.word.toLowerCase().includes(this.searchQuery) ||
				(e.definition || '').toLowerCase().includes(this.searchQuery)
			);
		}

		const dir = this.sortDesc ? -1 : 1;
		return [...entries].sort((a, b) => {
			switch (this.sortField) {
				case 'addedTime': return dir * (a.addedTime - b.addedTime);
				case 'reps': return dir * (a._reps - b._reps);
				case 'word': return dir * a.word.localeCompare(b.word);
				case 'language': return dir * a._language.localeCompare(b._language);
				default: return 0;
			}
		});
	}

	// ── Render ──────────────────────────────────────────────

	private refresh() {
		this.renderStats();
		this.renderTable();
		this.renderFooter();
		this.renderActionButtons();
	}

	private renderStats() {
		const total = this.allEntries.length;
		const newC = this.allEntries.filter(e => e.fsrsData.state === 0 && !e._mastered).length;
		const learnC = this.allEntries.filter(e => e.fsrsData.state !== 0 && !e._mastered).length;
		const masterC = this.allEntries.filter(e => e._mastered).length;
		const values = [total, newC, learnC, masterC];
		this.statEls.forEach((el, i) => {
			const val = el.querySelector('.lme-fmm-stat-val') as HTMLElement;
			if (val) val.textContent = String(values[i]);
		});
	}

	private renderTable() {
		const tbody = this.tableEl.querySelector('.lme-fmm-tbody') as HTMLElement;
		if (!tbody) return;
		tbody.empty();

		const filtered = this.getFilteredEntries();
		const totalPages = Math.max(1, Math.ceil(filtered.length / this.pageSize));
		if (this.page >= totalPages) this.page = totalPages - 1;
		if (this.page < 0) this.page = 0;

		const start = this.page * this.pageSize;
		const pageEntries = filtered.slice(start, start + this.pageSize);

		// Update select-all checkbox state
		if (this.selectAllCheck) {
			const allSelected = pageEntries.length > 0 && pageEntries.every(e => this.selectedIds.has(e.id));
			this.selectAllCheck.checked = allSelected;
		}

		if (pageEntries.length === 0) {
			const tr = tbody.createEl('tr');
			const td = tr.createEl('td', { cls: 'lme-fmm-empty', attr: { colspan: '8' } });
			td.textContent = t('flashcardManager.noMatch');
			return;
		}

		for (const entry of pageEntries) {
			const tr = tbody.createEl('tr');
			if (this.selectedIds.has(entry.id)) tr.addClass('is-selected');

			// Checkbox
			const tdCheck = tr.createEl('td', { cls: 'lme-fmm-td-check' });
			const check = tdCheck.createEl('input', { type: 'checkbox', cls: 'lme-fmm-check' });
			check.checked = this.selectedIds.has(entry.id);
			check.onchange = () => {
				if (check.checked) {
					this.selectedIds.add(entry.id);
					tr.addClass('is-selected');
				} else {
					this.selectedIds.delete(entry.id);
					tr.removeClass('is-selected');
				}
				this.renderActionButtons();
				if (this.selectAllCheck) {
					const filtered2 = this.getFilteredEntries();
					const s = this.page * this.pageSize;
					const pe = filtered2.slice(s, s + this.pageSize);
					this.selectAllCheck.checked = pe.length > 0 && pe.every(e => this.selectedIds.has(e.id));
				}
			};

			// Word (双击内联编辑)
			const tdWord = tr.createEl('td', { cls: 'lme-fmm-td-word', text: entry.word });
			tdWord.ondblclick = () => this.startInlineEdit(tdWord, entry, 'word');

			const tdPhonetic = tr.createEl('td', { cls: 'lme-fmm-td-phonetic', text: entry.phonetic || '' });
			tdPhonetic.ondblclick = () => this.startInlineEdit(tdPhonetic, entry, 'phonetic');

			const tdPos = tr.createEl('td', { cls: 'lme-fmm-td-pos', text: entry.partOfSpeech || '' });
			tdPos.ondblclick = () => this.startInlineEdit(tdPos, entry, 'partOfSpeech');

			// Definition (双击内联编辑,单元格显示截断)
			const tdDef = tr.createEl('td', { cls: 'lme-fmm-td-def', text: this.truncateCell(entry.definition || '', 70) });
			tdDef.ondblclick = () => this.startInlineEdit(tdDef, entry, 'definition');

			const tdExample = tr.createEl('td', { cls: 'lme-fmm-td-example', text: this.truncateCell(entry.contextSnippet || '', 70) });
			tdExample.ondblclick = () => this.startInlineEdit(tdExample, entry, 'contextSnippet');

			const tdTranslation = tr.createEl('td', { cls: 'lme-fmm-td-translation', text: this.truncateCell((entry as any).contextTranslation || '', 70) });
			tdTranslation.ondblclick = () => this.startInlineEdit(tdTranslation, entry, 'contextTranslation');

			// Language badge
			const tdLang = tr.createEl('td', { cls: 'lme-fmm-td-lang' });
			tdLang.createEl('span', {
				cls: `lme-fmm-lang-badge lme-fmm-lang-${entry._language}`,
				text: LANG_FLAGS[entry._language] || entry._language,
			});

			// Status badge
			const tdStatus = tr.createEl('td', { cls: 'lme-fmm-td-status' });
			if (entry._mastered) {
				tdStatus.createEl('span', { cls: 'lme-fmm-badge lme-fmm-badge-mastered', text: t('flashcardManager.mastered') });
			} else if (entry.fsrsData.state === 0) {
				tdStatus.createEl('span', { cls: 'lme-fmm-badge lme-fmm-badge-new', text: t('flashcardManager.newCards') });
			} else {
				tdStatus.createEl('span', { cls: 'lme-fmm-badge lme-fmm-badge-learning', text: t('flashcardManager.learning') });
			}

			// Reps
			tr.createEl('td', { cls: 'lme-fmm-td-reps', text: String(entry._reps) });

			// Date
			tr.createEl('td', {
				cls: 'lme-fmm-td-date',
				text: new Date(entry.addedTime).toISOString().slice(0, 10),
			});

			// Actions
			const tdActions = tr.createEl('td', { cls: 'lme-fmm-td-actions' });
			const editBtn = tdActions.createEl('button', { cls: 'lme-fmm-edit-btn', text: t('common.edit') });
			editBtn.onclick = () => {
				new FlashcardEditModal(this.app, entry, async () => {
					await this.loadData();
					this.refresh();
				}).open();
			};
			const delBtn = tdActions.createEl('button', { cls: 'lme-fmm-del-btn', text: t('common.delete') });
			delBtn.onclick = async () => {
				if (!confirm(t('flashcardManager.deleteOneConfirm', { word: entry.word }))) return;
				await db.deleteVocabulary(entry.id);
				this.selectedIds.delete(entry.id);
				await this.loadData();
				this.refresh();
			};
		}
	}

	/**
	 * 单元格双击内联编辑。Enter 提交,Esc 取消,blur 提交。
	 * word 改成同语言已存在单词 → 唯一索引报错 → 提示。
	 */
	private startInlineEdit(td: HTMLElement, entry: ManagedEntry, field: InlineEditableField) {
		const original = String((entry as any)[field] || '');
		td.textContent = original;
		td.classList.add('lme-fmm-editing');
		td.setAttribute('contenteditable', 'true');
		td.focus();
		const range = document.createRange();
		range.selectNodeContents(td);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);

		let finished = false;
		const finish = async (commit: boolean) => {
			if (finished) return;
			finished = true;
			td.removeAttribute('contenteditable');
			td.classList.remove('lme-fmm-editing');
			td.onkeydown = null;
			td.onblur = null;
			if (!commit) { this.refresh(); return; }
			let val = (td.textContent || '').trim();
			if (field === 'word') val = val.toLowerCase();
			if (val === original) { this.refresh(); return; }
			try {
				await db.updateVocabulary(entry.id, { [field]: val } as Partial<VocabularyEntry>);
				await this.loadData();
				this.refresh();
			} catch (e) {
				new Notice(t('flashcardManager.editDuplicateWord'));
				this.refresh();
			}
		};
		td.onkeydown = (e: KeyboardEvent) => {
			if (e.key === 'Enter') { e.preventDefault(); void finish(true); }
			else if (e.key === 'Escape') { e.preventDefault(); void finish(false); }
	};
	td.onblur = () => { void finish(true); };
	}

	private truncateCell(text: string, max: number): string {
		return text.length > max ? text.slice(0, max) + '...' : text;
	}

	private renderFooter() {
		const filtered = this.getFilteredEntries();
		const totalPages = Math.max(1, Math.ceil(filtered.length / this.pageSize));
		if (this.pageInfo) this.pageInfo.textContent = `${this.page + 1} / ${totalPages}`;
		if (this.pagePrevBtn) this.pagePrevBtn.disabled = this.page <= 0;
		if (this.pageNextBtn) this.pageNextBtn.disabled = this.page >= totalPages - 1;
	}

	private renderActionButtons() {
		if (this.deleteBtn) {
			this.deleteBtn.textContent = t('flashcardManager.deleteSelected', { count: this.selectedIds.size });
			this.deleteBtn.disabled = this.selectedIds.size === 0;
		}
	}


	// ── Dynamic CSS Injection ───────────────────────────────

	private injectStyles() {
		if (this.styleEl) return;

		this.styleEl = document.createElement('style');
		this.styleEl.textContent = `
			/* ── Modal Container ── */
			.modal.lme-fmm-modal {
				width: 96vw !important;
				max-width: 1200px !important;
				height: 90vh !important;
				max-height: 900px !important;
				border-radius: 14px !important;
				overflow: hidden !important;
				padding: 0 !important;
				display: flex !important;
				flex-direction: column !important;
			}
			.theme-dark .modal.lme-fmm-modal {
				background: rgba(30, 30, 38, 0.96) !important;
			}
			.theme-light .modal.lme-fmm-modal {
				background: rgba(255, 255, 255, 0.97) !important;
				box-shadow: 0 20px 60px rgba(0,0,0,0.12), 0 0 0 1px var(--background-modifier-border) !important;
			}
			.modal.lme-fmm-modal > .modal-close-button { display: none !important; }

			/* ── Content Root ── */
			.lme-fmm {
				padding: 0 !important;
				margin: 0 !important;
				height: 100%;
				display: flex;
				flex-direction: column;
				overflow: hidden;
				font-size: 13px;
			}

			/* ── Header ── */
			.lme-fmm-header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				padding: 18px 24px 14px;
				flex-shrink: 0;
				gap: 12px;
			}
			.lme-fmm-header h2 {
				margin: 0;
				font-size: 18px;
				font-weight: 700;
				letter-spacing: -0.3px;
			}
			.lme-fmm-header-right {
				display: flex;
				align-items: center;
				gap: 10px;
			}
			.lme-fmm-search {
				padding: 7px 14px;
				border-radius: 8px;
				border: 1px solid var(--background-modifier-border);
				background: var(--background-primary);
				color: var(--text-normal);
				font-size: 13px;
				width: 220px;
				transition: border-color 0.15s;
			}
			.lme-fmm-search:focus {
				border-color: var(--interactive-accent);
				outline: none;
			}
			.lme-fmm-search::placeholder {
				color: var(--text-faint);
			}
			.lme-fmm-close-btn {
				width: 30px; height: 30px;
				border: none; border-radius: 8px;
				background: var(--background-modifier-hover);
				color: var(--text-muted);
				cursor: pointer;
				display: flex; align-items: center; justify-content: center;
			}
			.lme-fmm-close-btn svg {
				width: 14px; height: 14px;
				flex-shrink: 0;
			}
			.lme-fmm-close-btn:hover {
				background: var(--background-modifier-error);
				color: var(--text-error);
			}

			/* ── Stats Bar ── */
			.lme-fmm-stats {
				display: grid;
				grid-template-columns: repeat(4, 1fr);
				gap: 10px;
				padding: 0 24px 14px;
				flex-shrink: 0;
			}
			.lme-fmm-stat-card {
				border-radius: 10px;
				padding: 10px 16px;
				text-align: center;
				border: 1px solid var(--background-modifier-border);
			}
			.lme-fmm-stat-val {
				display: block;
				font-size: 20px;
				font-weight: 700;
				line-height: 1.2;
			}
			.lme-fmm-stat-lbl {
				display: block;
				font-size: 10px;
				color: var(--text-muted);
				margin-top: 2px;
				text-transform: uppercase;
				letter-spacing: 0.5px;
			}
			.lme-fmm-stat-total { background: rgba(99,102,241,0.07); border-color: rgba(99,102,241,0.18) !important; }
			.lme-fmm-stat-new { background: rgba(59,130,246,0.07); border-color: rgba(59,130,246,0.18) !important; }
			.lme-fmm-stat-learning { background: rgba(245,158,11,0.07); border-color: rgba(245,158,11,0.18) !important; }
			.lme-fmm-stat-mastered { background: rgba(34,197,94,0.07); border-color: rgba(34,197,94,0.18) !important; }

			/* ── Toolbar ── */
			.lme-fmm-toolbar {
				display: flex;
				flex-wrap: wrap;
				gap: 8px;
				align-items: center;
				padding: 10px 24px;
				border-top: 1px solid var(--background-modifier-border);
				border-bottom: 1px solid var(--background-modifier-border);
				flex-shrink: 0;
			}
			.lme-fmm-select {
				padding: 6px 10px;
				border-radius: 7px;
				border: 1px solid var(--background-modifier-border);
				background: var(--background-primary);
				color: var(--text-normal);
				font-size: 12px;
				cursor: pointer;
				flex-shrink: 0;
			}
			.lme-fmm-select:focus { border-color: var(--interactive-accent); outline: none; }

			/* Mastery pills */
			.lme-fmm-pills {
				display: flex; gap: 3px;
				background: var(--background-secondary);
				border-radius: 7px; padding: 3px;
				flex-shrink: 0;
			}
			.lme-fmm-pill {
				padding: 4px 12px; border: none; border-radius: 5px;
				background: transparent; color: var(--text-muted);
				font-size: 12px; cursor: pointer; font-weight: 500;
				flex-shrink: 0; white-space: nowrap;
			}
			.lme-fmm-pill:hover { color: var(--text-normal); }
			.lme-fmm-pill.is-active {
				background: var(--interactive-accent);
				color: var(--text-on-accent);
			}

			.lme-fmm-sort-dir {
				width: 32px; height: 32px; padding: 0;
				border-radius: 7px;
				border: 1px solid var(--background-modifier-border);
				background: var(--background-primary);
				color: var(--text-normal); font-size: 14px; cursor: pointer;
				display: flex; align-items: center; justify-content: center;
				flex-shrink: 0;
			}
			.lme-fmm-sort-dir:hover { background: var(--background-modifier-hover); }

			.lme-fmm-spacer { margin-left: auto; }

			.lme-fmm-btn {
				padding: 6px 14px; border-radius: 7px;
				border: 1px solid var(--background-modifier-border);
				background: var(--background-primary);
				color: var(--text-normal); font-size: 12px;
				cursor: pointer; font-weight: 500;
				flex-shrink: 0; white-space: nowrap; height: 30px;
				display: inline-flex; align-items: center; justify-content: center; gap: 4px;
			}
			.lme-fmm-btn svg { width: 14px; height: 14px; flex-shrink: 0; }
			.lme-fmm-btn:hover { background: var(--background-modifier-hover); border-color: var(--interactive-accent); }
			.lme-fmm-btn-danger { color: var(--text-error); }
			.lme-fmm-btn-danger:hover { background: rgba(244,63,94,0.1); border-color: var(--text-error); }
			.lme-fmm-btn:disabled { opacity: 0.4; cursor: not-allowed; }

			/* ── Table ── */
			.lme-fmm-table-wrap {
				flex: 1;
				overflow-y: auto;
				padding: 0 24px;
			}
			.lme-fmm-table {
				width: 100%;
				border-collapse: collapse;
				table-layout: fixed;
			}
			.lme-fmm-table thead {
				position: sticky;
				top: 0;
				z-index: 2;
			}
			.lme-fmm-table thead th {
				text-align: left;
				padding: 9px 6px;
				font-size: 10px;
				font-weight: 600;
				color: var(--text-muted);
				text-transform: none;
				letter-spacing: 0;
				line-height: 1.15;
				border-bottom: 2px solid var(--background-modifier-border);
				background: var(--background-primary);
				white-space: normal;
				overflow-wrap: anywhere;
			}
			.lme-fmm-th-check { width: 32px !important; }
			.lme-fmm-sortable { cursor: pointer; }
				.lme-fmm-th-center { text-align: center; }
				.lme-fmm-table thead th:nth-child(8),
				.lme-fmm-table thead th:nth-child(9),
				.lme-fmm-table thead th:nth-child(10) { text-align: center; }
			.lme-fmm-sortable:hover { color: var(--text-normal); }

			.lme-fmm-table tbody tr {
				border-bottom: 1px solid var(--background-modifier-border);
				transition: background 0.1s;
			}
			.lme-fmm-table tbody tr:hover {
				background: var(--background-modifier-hover);
			}
			.lme-fmm-table tbody tr.is-selected {
				background: rgba(99,102,241,0.06);
			}

			.lme-fmm-table td {
				padding: 8px;
				vertical-align: middle;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.lme-fmm-check {
				width: 16px; height: 16px;
				cursor: pointer;
				accent-color: var(--interactive-accent);
			}
			.lme-fmm-td-check { width: 32px; text-align: center; }
			.lme-fmm-td-word {
				font-weight: 600;
				color: var(--text-normal);
				font-size: 13px;
			}
			.lme-fmm-td-phonetic,
			.lme-fmm-td-pos,
			.lme-fmm-td-def,
			.lme-fmm-td-example,
			.lme-fmm-td-translation {
				color: var(--text-muted);
				font-size: 12px;
				max-width: 0;
			}
			.lme-fmm-td-lang { text-align: center; }
			.lme-fmm-lang-badge {
				font-size: 10px;
				font-weight: 700;
				padding: 2px 6px;
				border-radius: 4px;
				letter-spacing: 0.3px;
			}
			.lme-fmm-lang-english { background: rgba(59,130,246,0.12); color: #3b82f6; }
			.lme-fmm-lang-german { background: rgba(245,158,11,0.12); color: #f59e0b; }
			.lme-fmm-lang-french { background: rgba(99,102,241,0.12); color: #6366f1; }
			.lme-fmm-lang-spanish { background: rgba(239,68,68,0.12); color: #ef4444; }
			.lme-fmm-lang-korean { background: rgba(16,185,129,0.12); color: #10b981; }
			.lme-fmm-lang-russian { background: rgba(168,85,247,0.12); color: #a855f7; }
			.lme-fmm-lang-japanese { background: rgba(236,72,153,0.12); color: #ec4899; }
				.lme-fmm-lang-chinese { background: rgba(239,68,68,0.12); color: #ef4444; }

			.lme-fmm-td-status { text-align: center; }
			.lme-fmm-badge {
				font-size: 9px; font-weight: 600;
				padding: 2px 8px; border-radius: 10px;
				letter-spacing: 0.3px; text-transform: uppercase;
				white-space: nowrap;
			}
			.lme-fmm-badge-new { background: rgba(59,130,246,0.12); color: #3b82f6; }
			.lme-fmm-badge-learning { background: rgba(245,158,11,0.12); color: #f59e0b; }
			.lme-fmm-badge-mastered { background: rgba(34,197,94,0.12); color: #22c55e; }

			.lme-fmm-td-reps { text-align: center; color: var(--text-faint); font-size: 12px; }
			.lme-fmm-td-date { color: var(--text-faint); font-size: 11px; }
			.lme-fmm-td-actions { text-align: center; }
			.lme-fmm-del-btn {
				border: none; background: transparent;
				color: var(--text-faint); cursor: pointer;
				font-size: 11px; padding: 3px 8px; border-radius: 4px;
				opacity: 0;
				transition: opacity 0.1s, background 0.1s;
			}
			.lme-fmm-table tbody tr:hover .lme-fmm-del-btn { opacity: 1; }
			.lme-fmm-del-btn:hover {
				background: rgba(244,63,94,0.12);
				color: var(--text-error);
			}

			.lme-fmm-edit-btn {
				border: none; background: transparent;
				color: var(--text-faint); cursor: pointer;
				font-size: 11px; padding: 3px 8px; border-radius: 4px;
				opacity: 0;
				transition: opacity 0.1s, background 0.1s;
			}
			.lme-fmm-table tbody tr:hover .lme-fmm-edit-btn { opacity: 1; }
			.lme-fmm-edit-btn:hover {
				background: rgba(99,102,241,0.12);
				color: var(--text-accent);
			}
			.lme-fmm-td-word,
			.lme-fmm-td-phonetic,
			.lme-fmm-td-pos,
			.lme-fmm-td-def,
			.lme-fmm-td-example,
			.lme-fmm-td-translation { cursor: text; }
			.lme-fmm-editing {
				outline: 2px solid var(--text-accent, #3D6B35) !important;
				outline-offset: -2px;
				background: var(--background-modifier-form-field, #fff) !important;
				white-space: normal !important;
				overflow: visible !important;
				max-width: none !important;
			}
			.lme-fmm-empty {
				text-align: center;
				color: var(--text-muted);
				padding: 60px 0;
				font-size: 14px;
			}

			/* ── Footer ── */
			.lme-fmm-footer {
				display: flex;
				align-items: center;
				justify-content: center;
				gap: 14px;
				padding: 12px 24px;
				border-top: 1px solid var(--background-modifier-border);
				flex-shrink: 0;
			}
			.lme-fmm-page-btn {
				padding: 5px 14px; border-radius: 6px;
				border: 1px solid var(--background-modifier-border);
				background: var(--background-primary);
				color: var(--text-normal); font-size: 12px; cursor: pointer;
			}
			.lme-fmm-page-btn:hover { background: var(--background-modifier-hover); }
			.lme-fmm-page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
			.lme-fmm-page-info {
				font-size: 12px;
				color: var(--text-muted);
				min-width: 60px;
				text-align: center;
			}

			/* ── Responsive (Tablet, iPad etc.) ── */
			@media (max-width: 1024px) {
				.lme-fmm-search { width: 160px; }
				.lme-fmm-toolbar { padding: 8px 16px; }
			}
			/* ── Responsive (Mobile) ── */
			@media (max-width: 768px) {
				.modal.lme-fmm-modal {
					width: 100vw !important;
					max-width: 100vw !important;
					height: 100vh !important;
					max-height: 100vh !important;
					border-radius: 0 !important;
				}
				.lme-fmm-search { width: 140px; }
				.lme-fmm-stats { grid-template-columns: repeat(2, 1fr); }
				.lme-fmm-toolbar { padding: 8px 14px; }
				.lme-fmm-table-wrap { padding: 0 14px; overflow-x: auto; }
					.lme-fmm-table { font-size: 11px; table-layout: auto; }
					.lme-fmm-table thead th { width: auto !important; }
					.lme-fmm-col-definition, .lme-fmm-td-def { display: none; }
					.lme-fmm-del-btn { opacity: 1; }
			}
			@media (max-width: 480px) {
				.lme-fmm-header h2 { font-size: 15px; }
				.lme-fmm-search { width: 100px; font-size: 12px; }
					.lme-fmm-col-language, .lme-fmm-td-lang,
					.lme-fmm-col-reps, .lme-fmm-td-reps,
					.lme-fmm-col-addedTime, .lme-fmm-td-date { display: none; }
			}
		`;

		document.head.appendChild(this.styleEl);
	}
}

// ============================================================
// Default FSRS data for new entries
// ============================================================

function DEFAULT_FSRS(now: number): FSRSData {
	return {
		due: now,
		stability: 0,
		difficulty: 0,
		elapsed_days: 0,
		scheduled_days: 0,
		reps: 0,
		lapses: 0,
		state: 0,
		last_review: undefined,
	};
}

