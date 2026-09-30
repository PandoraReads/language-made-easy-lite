// ============================================================
// Language Made Easy - Flashcard Manager Modal (Redesigned)
// ============================================================

import { App, Modal, Notice, FuzzySuggestModal, setIcon } from 'obsidian';
import type LanguageMadeEasyPlugin from '../main-unified-full';
import { db } from '../core/Database';
import type { LanguageId,  VocabularyEntry, FSRSData } from '../models';
import { randomUUID } from '../mocks/crypto';
import { t } from '../i18n';
import { FlashcardEditModal } from './flashcard-edit-modal';
import { UpgradeModal } from './upgrade-modal';
import { AddFlashcardModal } from '../views/flashcard-view';

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
			card.createSpan({ cls: 'lme-fmm-stat-val', text: '0' });
			card.createSpan({ cls: 'lme-fmm-stat-lbl', text: c.label });
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
				this.langSelect.value = this.filterLang;
				new UpgradeModal(this.app, LANG_NAMES[v] || v).open();
				return;
			}
			this.filterLang = v;
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
		// 社区免费版:闪卡多端同步为完整版功能,弹付费引导
		syncBtn.onclick = () => new UpgradeModal(this.app, t('flashcardManager.syncData')).open();
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

		this.pageInfo = footer.createSpan({ cls: 'lme-fmm-page-info', text: '1 / 1' });

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

			const tdTranslation = tr.createEl('td', { cls: 'lme-fmm-td-translation', text: this.truncateCell((entry as unknown).contextTranslation || '', 70) });
			tdTranslation.ondblclick = () => this.startInlineEdit(tdTranslation, entry, 'contextTranslation');

			// Language badge
			const tdLang = tr.createEl('td', { cls: 'lme-fmm-td-lang' });
			tdLang.createSpan({
				cls: `lme-fmm-lang-badge lme-fmm-lang-${entry._language}`,
				text: LANG_FLAGS[entry._language] || entry._language,
			});

			// Status badge
			const tdStatus = tr.createEl('td', { cls: 'lme-fmm-td-status' });
			if (entry._mastered) {
				tdStatus.createSpan({ cls: 'lme-fmm-badge lme-fmm-badge-mastered', text: t('flashcardManager.mastered') });
			} else if (entry.fsrsData.state === 0) {
				tdStatus.createSpan({ cls: 'lme-fmm-badge lme-fmm-badge-new', text: t('flashcardManager.newCards') });
			} else {
				tdStatus.createSpan({ cls: 'lme-fmm-badge lme-fmm-badge-learning', text: t('flashcardManager.learning') });
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
		const original = String((entry as unknown)[field] || '');
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
				await db.updateVocabulary(entry.id, { [field]: val });
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

