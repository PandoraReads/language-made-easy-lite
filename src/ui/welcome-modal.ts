// ============================================================
// Language Made Easy - Welcome Modal(社区免费版首次加载通知)
// ============================================================
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com

import { App, Modal, setIcon } from 'obsidian';
import { t } from '../i18n';
import wechatQrUrl from '../../assets/wechat-qr.jpg';

/**
 * 基础版 vs 高级版对照行(与 README 的 Free vs Full 表保持一致)。
 * basicFree = 该功能基础版是否可用。
 */
const COMPARE_ROWS: Array<{ labelKey: string; basicFree: boolean; basicLabel?: string }> = [
	{ labelKey: 'welcome.rowEnglish', basicFree: true },
	{ labelKey: 'welcome.rowMdx', basicFree: true, basicLabel: '1 部' },
	{ labelKey: 'welcome.rowSubtitles', basicFree: true, basicLabel: '5 次/天' },
	{ labelKey: 'welcome.rowFlashcards', basicFree: true, basicLabel: '250 张' },
	{ labelKey: 'welcome.rowLanguages', basicFree: false },
	{ labelKey: 'welcome.rowThemes', basicFree: false },
	{ labelKey: 'welcome.rowVideoNote', basicFree: false },
	{ labelKey: 'welcome.rowBookmark', basicFree: false },
	{ labelKey: 'welcome.rowBatchFlashcard', basicFree: false },
	{ labelKey: 'welcome.rowGradedVocab', basicFree: false },
	{ labelKey: 'welcome.rowImportExport', basicFree: false },
	{ labelKey: 'welcome.rowAiExport', basicFree: false },
	{ labelKey: 'welcome.rowTeaching', basicFree: false },
	{ labelKey: 'welcome.rowStudyModes', basicFree: false },
	{ labelKey: 'welcome.rowPrompts', basicFree: false },
];

// PandoraReads — 首次加载通知:表格对照基础版/高级版 + 微信二维码引导。
export class WelcomeModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('lme-upgrade-modal lme-welcome-modal');

		// Header
		const header = contentEl.createDiv('lme-upgrade-header');
		const logo = header.createDiv('lme-upgrade-logo');
		setIcon(logo, 'graduation-cap');
		header.createEl('h1', { text: t('welcome.title') });
		header.createEl('p', { text: t('welcome.subtitle') });

		const body = contentEl.createDiv('lme-upgrade-body');

		// 对照表
		body.createDiv('lme-upgrade-stores-title').setText(t('welcome.tableTitle'));
		const tableWrap = body.createDiv('lme-welcome-table-wrap');
		const table = tableWrap.createEl('table', { cls: 'lme-welcome-table' });
		const thead = table.createEl('thead');
		const headRow = thead.createEl('tr');
		headRow.createEl('th', { text: t('welcome.colFeature') });
		headRow.createEl('th', { text: t('welcome.colBasic') });
		headRow.createEl('th', { text: t('welcome.colFull') });
		const tbody = table.createEl('tbody');
		for (const row of COMPARE_ROWS) {
			const tr = tbody.createEl('tr');
			tr.createEl('td', { text: t(row.labelKey) });
			const basic = tr.createEl('td', { text: row.basicLabel ?? (row.basicFree ? '✅' : '—') });
			basic.addClass(row.basicFree ? 'lme-welcome-yes' : 'lme-welcome-no');
			tr.createEl('td', { text: '✅', cls: 'lme-welcome-yes' });
		}

		// WeChat QR + 引导话术
		const wechat = body.createDiv('lme-upgrade-wechat');
		wechat.createEl('img', {
			cls: 'lme-upgrade-qr',
			attr: { src: wechatQrUrl, alt: t('upgrade.wechatQrAlt') },
		});
		const wechatText = wechat.createDiv('lme-upgrade-wechat-text');
		wechatText.createDiv('lme-upgrade-wechat-title').setText(t('welcome.wechatTitle'));
		wechatText.createDiv('lme-upgrade-wechat-desc').setText(t('welcome.wechatDesc'));

		// Footer
		const footer = contentEl.createDiv('lme-upgrade-footer');
		const closeBtn = footer.createEl('button', { text: t('welcome.start'), cls: 'mod-cta' });
		closeBtn.onclick = () => this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
