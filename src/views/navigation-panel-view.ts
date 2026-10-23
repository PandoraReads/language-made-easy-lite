// @ts-nocheck

import { ItemView, WorkspaceLeaf, Notice, setIcon, FuzzySuggestModal } from 'obsidian';
import { db } from '../core/Database';
import { vocabSizeService } from '../core/VocabSizeService';
import { t, getLocale } from '../i18n';
import { uiThemeLabel } from '../models';
import { FlashcardManagerModal } from '../ui/flashcard-manager-modal';
import { VocabTestModal } from './VocabTestModal';
import { FLASHCARD_VIEW_TYPE } from './flashcard-view';
import { WORKSHOP_CATALOG_VIEW_TYPE } from './workshop-catalog-view';
import { YOUTUBE_SUBSCRIPTIONS_VIEW_TYPE } from './youtube-subscriptions-view';
import { AI_REPORT_CATALOG_VIEW_TYPE } from './ai-report-catalog-view';
import type LanguageMadeEasyPlugin from '../main-unified-full';
import { UpgradeModal } from '../ui/upgrade-modal';
import logoUrl from '../../assets/lme-logo.svg';

export const NAVIGATION_VIEW_TYPE = 'lme-navigation-panel';
const NAVIGATION_STATS_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

const LANGUAGE_NAMES: Record<string, string> = {
	english: 'English',
	german: 'Deutsch',
	french: 'Français',
	spanish: 'Español',
	korean: '한국어',
	russian: 'Русский',
	japanese: '日本語',
	chinese: '中文',
};

const LANGUAGES = [
	{ id: 'english', name: 'English' },
	{ id: 'german', name: 'Deutsch' },
	{ id: 'french', name: 'Français' },
	{ id: 'spanish', name: 'Español' },
	{ id: 'korean', name: '한국어' },
	{ id: 'russian', name: 'Русский' },
	{ id: 'japanese', name: '日本語' },
	{ id: 'chinese', name: '中文' },
];

// Theme display names resolve through i18n at render time (see uiThemeLabel)
const THEMES = [
	{ id: 'paper-ink' },
	{ id: 'mint-coach' },
	{ id: 'rose-blush' },
	{ id: 'lavender-dream' },
	{ id: 'candy-pop' },
	{ id: 'mindful-oasis' },
	{ id: 'coral-warmth' },
	{ id: 'ocean-glass' },
	{ id: 'aurora-prism' },
	{ id: 'neon-lime' },
];

// Long-word locales: stat captions overflow the narrow stat columns, so stats
// render value-first with the label below and no hint (see createStat).
const COMPACT_STATS_LOCALES = new Set(['en', 'de', 'fr', 'es', 'ru', 'th']);

// Latin-script labels (accents included) get the stacked-word layout.
const LATIN_LABEL_RE = /^[\p{Script=Latin}\p{P}\d\s]+$/u;

/** Split words onto at most two lines, balancing the line lengths. */
function splitTwoBalancedLines(words: string[]): string[] {
	if (words.length <= 2) return words;
	let best: string[] = [words[0], words.slice(1).join(' ')];
	let bestDiff = Infinity;
	for (let i = 1; i < words.length; i++) {
		const first = words.slice(0, i).join(' ');
		const second = words.slice(i).join(' ');
		const diff = Math.abs(first.length - second.length);
		if (diff < bestDiff) {
			bestDiff = diff;
			best = [first, second];
		}
	}
	return best;
}

export class NavigationPanelView extends ItemView {
	private plugin: LanguageMadeEasyPlugin;
	private statsRefreshTimer: number | null = null;
	private floatEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LanguageMadeEasyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return NAVIGATION_VIEW_TYPE; }
	getDisplayText(): string { return t('nav.viewTitle'); }
	getIcon(): string { return 'graduation-cap'; }

	async onOpen() {
		await this.render();
		this.startStatsAutoRefresh();
	}

	async onClose() {
		this.stopStatsAutoRefresh();
		this.removeFloatingActions();
	}

	async render() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('lme-navigation-view');

		this.renderLanguageBookmark(contentEl);
		const shell = contentEl.createDiv('lme-nav-shell');
		this.renderHero(shell);
		await this.renderStats(shell);
		this.renderLookup(shell);
		this.renderQuickActions(shell);
		shell.createDiv({ cls: 'lme-nav-footer', text: t('nav.footer') });
		shell.createEl('img', { cls: 'lme-nav-logo', attr: { src: logoUrl as string, alt: 'Logo', 'aria-hidden': 'true' } });
		this.renderFloatingActions(contentEl);
	}

	private renderLanguageBookmark(parent: HTMLElement): void {
		const badge = parent.createEl('button', { cls: 'lme-nav-language-badge' });
		badge.setAttr('aria-label', t('nav.switchLanguage'));
		badge.setText(LANGUAGE_NAMES[this.plugin.settings.activeLanguage || 'english'] || this.plugin.settings.activeLanguage || 'English');
		badge.onclick = () => {
			badge.removeClass('is-pulling');
			window.requestAnimationFrame(() => badge.addClass('is-pulling'));
			window.setTimeout(() => badge.removeClass('is-pulling'), 680);
			this.openLanguageSwitcher();
		};
	}

	private renderHero(parent: HTMLElement): void {
		const hero = parent.createDiv('lme-nav-hero');
		const copy = hero.createDiv('lme-nav-hero-copy');
		copy.createEl('h1', { text: 'Language Made Easy' });
		copy.createEl('p', { text: t('nav.subtitle') });
	}

	private async renderStats(parent: HTMLElement): Promise<void> {
		const section = parent.createEl('section', { cls: 'lme-nav-section lme-nav-stats-section' });
		await this.renderStatsContent(section);
	}

	async refreshStats(): Promise<void> {
		const section = this.contentEl.querySelector('.lme-nav-stats-section');
		if (!section) return;
		section.empty();
		await this.renderStatsContent(section);
	}

	private startStatsAutoRefresh(): void {
		this.stopStatsAutoRefresh();
		this.statsRefreshTimer = window.setInterval(() => {
			void this.refreshStats();
		}, NAVIGATION_STATS_REFRESH_INTERVAL_MS);
	}

	private stopStatsAutoRefresh(): void {
		if (this.statsRefreshTimer != null) {
			window.clearInterval(this.statsRefreshTimer);
			this.statsRefreshTimer = null;
		}
	}

	private async renderStatsContent(section: HTMLElement): Promise<void> {
		const compactStats = COMPACT_STATS_LOCALES.has(getLocale());
		const grid = section.createDiv('lme-nav-stats-grid');
		if (compactStats) grid.addClass('is-compact');
		const language = this.plugin.settings.activeLanguage || 'english';

		let vocabCount = 0;
		let dueCount = 0;
		let todayReviews = 0;
		let weekReviews = 0;
		let estimatedSize = t('nav.notTested');

		try {
			const [vocabulary, due, today, logs, hasTest, currentSize] = await Promise.all([
				db.getAllVocabulary(language),
				db.getTodayDueCount(language),
				db.getTodayReviewCount(language),
				db.getReviewLogsByLanguage(language),
				vocabSizeService.hasCompletedTest(language),
				vocabSizeService.getCurrentSize(language),
			]);
			vocabCount = vocabulary.length;
			dueCount = due;
			todayReviews = today;
			const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
			weekReviews = logs.filter((log: unknown) => log.reviewTime >= weekStart).length;
			if (hasTest && currentSize > 0) {
				estimatedSize = currentSize.toLocaleString();
			}
		} catch (error) {
			console.error('[LME] Failed to load navigation stats:', error);
		}

		this.createStat(grid, t('nav.vocabSize'), estimatedSize, t('nav.vocabSizeHint'), compactStats);
		this.createStat(grid, t('nav.flashcardCount'), String(vocabCount), t('nav.flashcardCountHint'), compactStats);
		this.createStat(grid, t('nav.dueToday'), String(dueCount), t('nav.dueTodayHint'), compactStats);
		this.createStat(grid, t('nav.reviewData'), `${todayReviews} / ${weekReviews}`, t('nav.reviewDataHint'), compactStats);
	}

	private createStat(parent: HTMLElement, label: string, value: string, hint: string, compact: boolean): void {
		const item = parent.createDiv('lme-nav-stat');
		if (compact) {
			// Long-word locales: value on top, label below, hint dropped.
			item.addClass('is-compact');
			item.createEl('strong', { text: value });
			item.createSpan({ text: label });
			return;
		}
		item.createSpan({ text: label });
		item.createEl('strong', { text: value });
		item.createEl('small', { text: hint });
	}

	private renderLookup(parent: HTMLElement): void {
		const section = parent.createEl('section', { cls: 'lme-nav-section lme-nav-lookup-section' });

		const row = section.createDiv('lme-nav-lookup-row');
		const input = row.createEl('input', {
			type: 'text',
			attr: {
				placeholder: t('nav.lookupPlaceholder'),
				'aria-label': t('nav.lookupPlaceholder'),
			}
		});
		const button = row.createEl('button', { cls: 'mod-cta lme-nav-primary-btn' });
		setIcon(button, 'search');
		button.createSpan({ text: t('nav.lookupButton') });

		const videoBtn = row.createEl('button', { cls: 'lme-nav-secondary-btn' });
		setIcon(videoBtn, 'clapperboard');
		videoBtn.createSpan({ text: t('nav.videoNote') });
		videoBtn.setAttr('aria-label', t('nav.videoNote'));

		const submit = async () => {
			const word = input.value.trim();
			if (!word) {
				new Notice(t('nav.enterWord'));
				return;
			}
			await this.plugin.triggerLookup(word);
		};
		const submitVideo = async () => {
			const url = input.value.trim();
			if (!url) {
				new Notice(t('nav.enterVideoUrl'));
				return;
			}
			if (!this.isSupportedVideoLink(url)) {
				new Notice(t('nav.invalidVideoUrl'));
				return;
			}
			videoBtn.disabled = true;
			try {
				await this.plugin.createVideoNoteFromUrl(url);
			} finally {
				videoBtn.disabled = false;
			}
		};
		button.onclick = () => { void submit(); };
		videoBtn.onclick = () => { void submitVideo(); };
		input.onkeydown = (evt) => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				void submit();
			}
		};
	}

	private renderQuickActions(parent: HTMLElement): void {
		const section = parent.createEl('section', { cls: 'lme-nav-section lme-nav-actions-section' });
		const grid = section.createDiv('lme-nav-actions-grid');

		const actions = [
			{ icon: 'play-circle', label: t('nav.shadowing'), tone: 'play', run: () => this.plugin.activateView(WORKSHOP_CATALOG_VIEW_TYPE, 'main') },
			{ icon: 'rss', label: t('nav.youtubeSubscriptionsTitle'), tone: 'play', run: () => this.plugin.activateView(YOUTUBE_SUBSCRIPTIONS_VIEW_TYPE, 'main') },
			{ icon: 'sparkles', label: t('nav.aiAnalyze'), tone: 'ai', run: () => this.plugin.activateView(AI_REPORT_CATALOG_VIEW_TYPE, 'main') },
			{ icon: 'brain', label: t('nav.flashcardReview'), tone: 'review', run: () => this.plugin.activateView(FLASHCARD_VIEW_TYPE, 'main') },
			{ icon: 'table-properties', label: t('nav.flashcardManager'), tone: 'batch', run: () => new FlashcardManagerModal(this.app, this.plugin).open() },
			{ icon: 'chart-column', label: t('nav.vocabTest'), tone: 'test', run: () => new VocabTestModal(this.app, this.plugin).open() },
		];
		actions.forEach(action => this.createAction(grid, action.icon, action.label, action.tone, action.run));
	}

	private createAction(parent: HTMLElement, icon: string, label: string, tone: string, action: () => void | Promise<void>): void {
		const button = parent.createEl('button', { cls: `lme-nav-action is-${tone}` });
		const iconEl = button.createSpan('lme-nav-action-icon');
		setIcon(iconEl, icon);
		const text = button.createSpan('lme-nav-action-copy');
		const labelEl = text.createEl('strong');
		const trimmed = label.trim();
		const words = trimmed.split(/\s+/).filter(Boolean);
		if (words.length > 1 && LATIN_LABEL_RE.test(trimmed)) {
			// Stack at most two balanced lines so labels stay inside the card.
			labelEl.addClass('is-word-stack');
			for (const line of splitTwoBalancedLines(words)) {
				labelEl.createSpan({ text: line, cls: 'lme-nav-action-word' });
			}
		} else {
			labelEl.setText(trimmed);
		}
		button.onclick = () => {
			button.addClass('is-pressed');
			window.setTimeout(() => button.removeClass('is-pressed'), 320);
			void action();
		};
	}

	private isSupportedVideoLink(url: string): boolean {
		const yt = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)[a-zA-Z0-9_-]{11}/i;
		const bili = /(?:https?:\/\/)?(?:www\.)?bilibili\.com\/video\/(?:BV[a-zA-Z0-9]{10}|av[0-9]+)/i;
		return yt.test(url) || bili.test(url);
	}

	private openLanguageSwitcher(): void {
		// 社区免费版:仅英语可切换;其他语种保留在列表中,选中时弹付费引导。
		new LanguageSelectModal(this.app, this.plugin, async (language: string) => {
			if (language !== 'english') {
				new UpgradeModal(this.app, LANGUAGE_NAMES[language] || language).open();
				return;
			}
			await this.plugin.switchLanguage('english');
			await this.render();
		}).open();
	}

	private openThemeSwitcher(): void {
		// 社区免费版:仅经典纸墨可用;其他主题保留在列表中,选中时弹付费引导。
		new ThemeSelectModal(this.app, this.plugin, async (theme: string) => {
			if (theme !== 'paper-ink') {
				const label = uiThemeLabel(THEMES.find(x => x.id === theme)?.id || theme);
				new UpgradeModal(this.app, label).open();
				return;
			}
			await this.plugin.setUiTheme(theme);
			await this.render();
		}).open();
	}

	private renderFloatingActions(parent: HTMLElement): void {
		this.removeFloatingActions();
		const wrap = parent.createDiv('lme-nav-float-actions');
		// 社区免费版:升级完整版入口(位于主题按钮上方)
		const upgradeBtn = wrap.createEl('button', { cls: 'lme-nav-float-btn lme-nav-upgrade-btn' });
		upgradeBtn.setAttr('aria-label', t('nav.upgradeBtn'));
		setIcon(upgradeBtn, 'crown');
		upgradeBtn.onclick = () => new UpgradeModal(this.app).open();
		const themeBtn = wrap.createEl('button', { cls: 'lme-nav-float-btn' });
		themeBtn.setAttr('aria-label', t('nav.themeSwitcher'));
		setIcon(themeBtn, 'palette');
		themeBtn.onclick = () => this.openThemeSwitcher();
		const guideBtn = wrap.createEl('button', { cls: 'lme-nav-float-btn' });
		guideBtn.setAttr('aria-label', t('nav.guide'));
		setIcon(guideBtn, 'book-open-check');
		guideBtn.onclick = () => { void this.openGuide(); };
		this.floatEl = wrap;
	}

	private removeFloatingActions(): void {
		if (this.floatEl) {
			this.floatEl.remove();
			this.floatEl = null;
		}
	}

	private async openGuide(): Promise<void> {
		await this.plugin.openBundledGuide();
	}
}

class LanguageSelectModal extends FuzzySuggestModal<{ id: string; name: string }> {
	private plugin: LanguageMadeEasyPlugin;
	private onSelect: (language: string) => Promise<void>;

	constructor(app: unknown, plugin: LanguageMadeEasyPlugin, onSelect: (language: string) => Promise<void>) {
		super(app);
		this.plugin = plugin;
		this.onSelect = onSelect;
		this.setPlaceholder(t('nav.languagePlaceholder'));
	}

	getItems() {
		return LANGUAGES;
	}

	getItemText(item: { id: string; name: string }) {
		const current = this.plugin.settings.activeLanguage === item.id ? t('nav.currentTag') : '';
		return current ? `${item.name} ${current}` : item.name;
	}

	onChooseItem(item: { id: string; name: string }) {
		void this.onSelect(item.id);
	}
}

class ThemeSelectModal extends FuzzySuggestModal<{ id: string; name: string }> {
	private plugin: LanguageMadeEasyPlugin;
	private onSelect: (theme: string) => Promise<void>;

	constructor(app: unknown, plugin: LanguageMadeEasyPlugin, onSelect: (theme: string) => Promise<void>) {
		super(app);
		this.plugin = plugin;
		this.onSelect = onSelect;
		this.setPlaceholder(t('nav.themePlaceholder'));
	}

	getItems() {
		return THEMES;
	}

	getItemText(item: { id: string; name?: string }) {
		const current = (this.plugin.settings.uiStyle || 'paper-ink') === item.id ? t('nav.currentTag') : '';
		const name = uiThemeLabel(item.id);
		return current ? `${name} ${current}` : name;
	}

	onChooseItem(item: { id: string; name: string }) {
		void this.onSelect(item.id);
	}
}
