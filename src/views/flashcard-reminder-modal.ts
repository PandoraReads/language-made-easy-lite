// ============================================================
// Language Made Easy - Flashcard Review Reminder Modal
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// ============================================================

import { App, Modal } from 'obsidian';
import type LanguageMadeEasyPlugin from '../main-unified-full';
import { FLASHCARD_VIEW_TYPE } from './flashcard-view';
import { t } from '../i18n';

const LANG_INFO: Record<string, { flag: string; name: string }> = {
	english: { flag: '🇬🇧', name: 'English' },
	german: { flag: '🇩🇪', name: 'Deutsch' },
	french: { flag: '🇫🇷', name: 'Français' },
	spanish: { flag: '🇪🇸', name: 'Español' },
	korean: { flag: '🇰🇷', name: '한국어' },
	russian: { flag: '🇷🇺', name: 'Русский' },
	japanese: { flag: '🇯🇵', name: '日本語' },
	chinese: { flag: '🇨🇳', name: '中文' },
};

/**
 * Friendly once-per-day popup reminding the user to review due flashcards.
 * Shows every enabled language that has due cards, combined into one modal.
 */
export class FlashcardReminderModal extends Modal {
	private plugin: LanguageMadeEasyPlugin;
	private lines: { lang: string; count: number }[];

	constructor(app: App, plugin: LanguageMadeEasyPlugin, lines: { lang: string; count: number }[]) {
		super(app);
		this.plugin = plugin;
		this.lines = lines;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('lme-reminder-modal');

		contentEl.createEl('h2', { text: t('reminder.title') });
		contentEl.createEl('p', { text: t('reminder.greeting'), cls: 'lme-reminder-greeting' });

		const list = contentEl.createDiv('lme-reminder-list');
		for (const { lang, count } of this.lines) {
			const info = LANG_INFO[lang] || { flag: '', name: lang };
			const row = list.createDiv('lme-reminder-row');
			row.createSpan({ text: `${info.flag} ${info.name}`, cls: 'lme-reminder-lang' });
			row.createSpan({ text: t('reminder.count', { count }), cls: 'lme-reminder-count' });
		}

		const btns = contentEl.createDiv('lme-reminder-buttons');
		const laterBtn = btns.createEl('button', { text: t('reminder.later') });
		laterBtn.onclick = () => this.close();
		const reviewBtn = btns.createEl('button', { text: t('reminder.startReview'), cls: 'mod-cta' });
		reviewBtn.onclick = async () => {
			this.close();
			await this.plugin.activateView(FLASHCARD_VIEW_TYPE, 'main');
		};
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
