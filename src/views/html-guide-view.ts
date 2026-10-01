// @ts-nocheck

import { ItemView, WorkspaceLeaf } from 'obsidian';
import { t } from '../i18n';
import guideHtml from '../../LME外语助手（使用说明）.html';

export const HTML_GUIDE_VIEW_TYPE = 'lme-html-guide-view';

export class HtmlGuideView extends ItemView {
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

		const iframe = contentEl.createEl('iframe', {
			cls: 'lme-html-guide-frame',
			attr: {
				srcdoc: guideHtml as string,
				sandbox: 'allow-same-origin allow-scripts allow-popups allow-forms',
			}
		});
		iframe.setAttr('title', t('nav.guide'));
	}
}
