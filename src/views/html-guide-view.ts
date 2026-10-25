// @ts-nocheck

import { ItemView, WorkspaceLeaf } from 'obsidian';
import { t, getLocale, type Locale } from '../i18n';
import guideZh from '../../docs/guide/LME外语助手（使用说明）.html';
import guideZhTW from '../../docs/guide/guide-zh-TW.html';
import guideEn from '../../docs/guide/guide-en.html';
import guideDe from '../../docs/guide/guide-de.html';
import guideFr from '../../docs/guide/guide-fr.html';
import guideEs from '../../docs/guide/guide-es.html';
import guideJa from '../../docs/guide/guide-ja.html';
import guideKo from '../../docs/guide/guide-ko.html';
import guideRu from '../../docs/guide/guide-ru.html';
import guideTh from '../../docs/guide/guide-th.html';

export const HTML_GUIDE_VIEW_TYPE = 'lme-html-guide-view';

/** Bundled guides per locale; zh-CN uses the original manual, others fall back to English. */
const GUIDES: Record<Locale, string> = {
	'zh-CN': guideZh,
	'zh-TW': guideZhTW,
	en: guideEn,
	de: guideDe,
	fr: guideFr,
	es: guideEs,
	ja: guideJa,
	ko: guideKo,
	ru: guideRu,
	th: guideTh,
};

function pickGuide(): string {
	return GUIDES[getLocale()] ?? guideEn;
}

export class HtmlGuideView extends ItemView {
	private iframe: HTMLIFrameElement | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string { return HTML_GUIDE_VIEW_TYPE; }
	getDisplayText(): string { return t('nav.guide'); }
	getIcon(): string { return 'book-open-check'; }

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('lme-html-guide-view');

		this.iframe = contentEl.createEl('iframe', {
			cls: 'lme-html-guide-frame',
			attr: {
				srcdoc: pickGuide(),
				sandbox: 'allow-same-origin allow-scripts allow-popups allow-forms',
			}
		});
		this.iframe.setAttr('title', t('nav.guide'));
	}

	/** Re-render the guide in the current UI locale (called after a language switch). */
	public refresh(): void {
		if (!this.iframe) return;
		this.iframe.setAttr('srcdoc', pickGuide());
		this.iframe.setAttr('title', t('nav.guide'));
	}
}
