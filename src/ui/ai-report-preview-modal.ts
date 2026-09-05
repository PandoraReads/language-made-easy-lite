import { App, Modal, setIcon } from 'obsidian';
import type LanguageMadeEasyPlugin from '../main-unified-full';
import type { AIAnalysisHistoryEntry } from '../models';
import { t } from '../i18n';
import { renderBody, enhanceTables } from '../utils/ai-report';
import { UpgradeModal } from './upgrade-modal';

/**
 * AI 解析报告预览弹窗:把一条历史报告的 content(HTML / Markdown) 渲染进一个
 * 可滚动弹窗(类似 html 浏览窗口),并提供 下载至仓库 / 下载图片 / 关闭。
 * 复用 lme-note-preview-* 尺寸样式(80vh/94vw)与 ai-report util 的渲染/导出。
 */
export class AIReportPreviewModal extends Modal {
	private readonly plugin: LanguageMadeEasyPlugin;
	private readonly entry: AIAnalysisHistoryEntry;

	constructor(app: App, plugin: LanguageMadeEasyPlugin, entry: AIAnalysisHistoryEntry) {
		super(app);
		this.plugin = plugin;
		this.entry = entry;
	}

	async onOpen(): Promise<void> {
		const { contentEl, modalEl } = this;
		modalEl.addClass('lme-note-preview-modal-wrap');
		contentEl.empty();
		contentEl.addClass('lme-note-preview-modal');

		// Header
		const header = contentEl.createDiv({ cls: 'lme-note-preview-header' });

		const titleWrap = header.createDiv({ cls: 'lme-note-preview-title' });
		setIcon(titleWrap.createSpan(), 'file-text');
		titleWrap.createSpan({ text: this.entry.title || t('aiAnalysis.viewTitle') });

		const actions = header.createDiv({ cls: 'lme-note-preview-actions' });

		// 社区免费版:下载/导出图片为完整版功能,按钮保留,点击弹付费引导
		const mdBtn = actions.createEl('button', { cls: 'lme-note-preview-btn' });
		mdBtn.setAttribute('aria-label', t('nav.aiReportCatalogDownloadMd'));
		setIcon(mdBtn, 'download');
		mdBtn.title = t('nav.aiReportCatalogDownloadMd');
		mdBtn.addEventListener('click', () => { new UpgradeModal(this.app, t('nav.aiReportCatalogDownloadMd')).open(); });

		const imgBtn = actions.createEl('button', { cls: 'lme-note-preview-btn' });
		imgBtn.setAttribute('aria-label', t('nav.aiReportCatalogDownloadImage'));
		setIcon(imgBtn, 'image');
		imgBtn.title = t('nav.aiReportCatalogDownloadImage');
		imgBtn.addEventListener('click', () => {
			new UpgradeModal(this.app, t('nav.aiReportCatalogDownloadImage')).open();
		});

		const closeBtn = actions.createEl('button', { cls: 'lme-note-preview-btn' });
		closeBtn.setAttribute('aria-label', t('common.close'));
		setIcon(closeBtn, 'x');
		closeBtn.addEventListener('click', () => this.close());

		// Body (可滚动)
		const editor = contentEl.createDiv({ cls: 'lme-note-preview-editor' });
		const body = editor.createDiv({ cls: 'lme-ai-analysis-body' });
		body.style.flex = '1';
		body.style.minHeight = '0';
		body.style.overflowY = 'auto';
		body.style.padding = '16px 20px';
		renderBody(this.entry.content, body, this.app, this);
		enhanceTables(body);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
