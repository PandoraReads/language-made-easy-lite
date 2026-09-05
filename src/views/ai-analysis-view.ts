// @ts-nocheck
// ============================================================
// Language Made Easy - AI Analysis Sidebar View
// ============================================================
// 渲染/消毒/导出/历史构造逻辑已抽到 src/utils/ai-report.ts(单一真源,与本视图及
// AIReportCatalogView / AIReportPreviewModal 共用)。本视图只保留侧栏专属的
// header 渲染、历史菜单、时间戳点击 seek、门禁等状态相关逻辑。

import { ItemView, WorkspaceLeaf, setIcon, Notice, Menu } from 'obsidian';
import type LanguageMadeEasyPlugin from '../main-unified-full';
import type { AIAnalysisHistoryEntry } from '../models';
import { t } from '../i18n';
import {
	AI_HISTORY_MAX,
	type PromptMeta,
	createHistoryEntry,
	renderBody,
	enhanceTables,
} from '../utils/ai-report';
import { UpgradeModal } from '../ui/upgrade-modal';

export const AI_ANALYSIS_VIEW_TYPE = 'lme-ai-analysis-view';

export class AIAnalysisView extends ItemView {
	private plugin: LanguageMadeEasyPlugin;
	private currentMarkdown = '';
	private shadowingLeaf: WorkspaceLeaf | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LanguageMadeEasyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return AI_ANALYSIS_VIEW_TYPE; }
	getDisplayText(): string { return t('aiAnalysis.viewTitle'); }
	getIcon(): string { return 'lightbulb'; }

	async onOpen() {
		this.containerEl.classList.add('lme-ai-analysis-view');
		if (this.currentMarkdown) {
			this.renderContent(this.currentMarkdown);
		} else if (!this.loadMostRecent()) {
			// 重启后内存 currentMarkdown 被清空，从已持久化的历史恢复最近一条；
			// 没有历史才显示空状态
			this.renderEmpty();
		}
	}

	async onClose() {
		this.contentEl.empty();
	}

	/** 生成新报告的入口：写历史 + 渲染。promptMeta 记录所用提示词(供目录页按类型分组)。 */
	setResult(markdown: string, shadowingLeaf?: WorkspaceLeaf, promptMeta?: PromptMeta) {
		this.currentMarkdown = markdown;
		this.shadowingLeaf = shadowingLeaf || null;
		this.saveToHistory(markdown, promptMeta).catch(err => {
			console.error('[LME] Failed to save analysis history:', err);
		});
		if (this.contentEl) {
			this.renderContent(markdown);
		}
	}

	private async saveToHistory(markdown: string, promptMeta?: PromptMeta) {
		const existing = this.plugin.settings.aiAnalysisHistory || [];
		const entry = createHistoryEntry(markdown, promptMeta);
		this.plugin.settings.aiAnalysisHistory = [entry, ...existing].slice(0, AI_HISTORY_MAX);
		await this.plugin.saveSettings();
		// 若报告管理目录页正打开,通知它刷新
		void this.plugin.refreshAiReportCatalog();
	}

	private loadFromHistory(entry: AIAnalysisHistoryEntry) {
		this.currentMarkdown = entry.content;
		this.renderContent(entry.content);
	}

	private renderEmpty() {
		this.contentEl.empty();
		this.contentEl.createEl('div', {
			cls: 'lme-ai-analysis-empty',
			text: t('aiAnalysis.noResult')
		});
	}

	private renderContent(markdown: string) {
		this.contentEl.empty();

		// -- Header bar (all inline styles to bypass any CSS override issues) --
		const header = this.contentEl.createDiv();
		header.style.cssText = 'display:flex;flex-direction:row;flex-wrap:nowrap;justify-content:space-between;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--background-modifier-border,rgba(0,0,0,0.08));position:sticky;top:0;z-index:10;background:var(--background-primary,#ffffff);';

		const titleEl = header.createDiv();
		titleEl.style.cssText = 'display:inline-flex;flex-direction:row;align-items:center;gap:6px;font-weight:600;font-size:0.9em;color:var(--text-normal,#333);white-space:nowrap;flex:0 1 auto;';
		setIcon(titleEl, 'lightbulb');
		titleEl.createSpan({ text: t('aiAnalysis.viewTitle') });

		const actions = header.createDiv();
		actions.style.cssText = 'display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:4px;flex:0 0 auto;';

		const mkBtn = (icon: string, text?: string): HTMLButtonElement => {
			const btn = actions.createEl('button');
			btn.style.cssText = 'display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:3px;padding:4px 8px;border-radius:5px;border:1px solid rgba(0,0,0,0.08);background:transparent;color:var(--text-muted,#888);cursor:pointer;font-size:0.8em;font-weight:500;white-space:nowrap;flex-shrink:0;line-height:1.2;transition:all 0.15s ease;';
			if (text) btn.createSpan({ text });
			setIcon(btn, icon);
			btn.onmouseenter = () => { btn.style.color = 'var(--text-accent)'; btn.style.borderColor = 'var(--text-accent)'; btn.style.background = 'rgba(0,0,0,0.03)'; };
			btn.onmouseleave = () => { btn.style.color = 'var(--text-muted,#888)'; btn.style.borderColor = 'rgba(0,0,0,0.08)'; btn.style.background = 'transparent'; };
			return btn;
		};

		const historyBtn = mkBtn('history');
		historyBtn.setAttribute('aria-label', t('aiAnalysis.historyLabel'));
		historyBtn.onclick = (evt) => this.showHistoryMenu(evt);

		// Separator dot
		const sep = actions.createDiv();
		sep.style.cssText = 'width:3px;height:3px;border-radius:50%;background:var(--text-muted,#888);opacity:0.35;flex-shrink:0;';

		// 社区免费版:导出笔记/长图/存为 HTML 为完整版功能,按钮保留,点击弹付费引导
		const saveBtn = mkBtn('download', t('common.export'));
		saveBtn.onclick = () => new UpgradeModal(this.app, t('common.export')).open();

		const imageBtn = mkBtn('image', t('aiAnalysis.longImage'));
		imageBtn.onclick = () => new UpgradeModal(this.app, t('aiAnalysis.longImage')).open();

		const htmlBtn = mkBtn('file-code', t('aiAnalysis.saveAsHtml'));
		htmlBtn.onclick = () => new UpgradeModal(this.app, t('aiAnalysis.saveAsHtml')).open();

		// -- Body --
		const body = this.contentEl.createDiv('lme-ai-analysis-body');
		renderBody(markdown, body, this.app, this);

		this.makeTimestampsClickable(body);
		enhanceTables(body);
	}

	private showHistoryMenu(evt: MouseEvent) {
		const history = this.plugin.settings.aiAnalysisHistory || [];
		const menu = new Menu();

		if (history.length === 0) {
			menu.addItem((item) => {
				item.setTitle(t('aiAnalysis.noHistory'));
				item.setDisabled(true);
			});
		} else {
			menu.addItem((item) => {
				item.setTitle(t('aiAnalysis.historyTitle'));
				item.setIsLabel?.(true);
				item.setDisabled(true);
			});
			menu.addSeparator();
			history.forEach((entry, idx) => {
				const date = new Date(entry.timestamp);
				const pad = (n: number) => String(n).padStart(2, '0');
				const timeLabel = `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
				menu.addItem((item) => {
					item.setTitle(`${entry.title}  ${timeLabel}`);
					item.setIcon(idx === 0 ? 'file-check' : 'file-text');
					item.onClick(() => this.loadFromHistory(entry));
				});
			});
		}

		menu.showAtMouseEvent(evt);
	}

	private makeTimestampsClickable(container: HTMLElement) {
		const walk = (el: HTMLElement) => {
			const children = Array.from(el.childNodes);
			for (const child of children) {
				if (child.nodeType === Node.TEXT_NODE) {
					const text = child.textContent || '';
					const tsRegex = /\[(\d{1,2}):(\d{2})\]/g;
					if (!tsRegex.test(text)) continue;
					tsRegex.lastIndex = 0;

					const fragment = document.createDocumentFragment();
					let lastIndex = 0;
					let match;
					while ((match = tsRegex.exec(text)) !== null) {
						if (match.index > lastIndex) {
							fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
						}
						const sec = parseInt(match[1]) * 60 + parseInt(match[2]);
						const span = document.createElement('span');
						span.className = 'lme-ai-timestamp';
						span.textContent = match[0];
						span.onclick = () => this.seekInShadowingView(sec);
						fragment.appendChild(span);
						lastIndex = tsRegex.lastIndex;
					}
					if (lastIndex < text.length) {
						fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
					}
					el.replaceChild(fragment, child);
				} else if (child instanceof HTMLElement) {
					walk(child);
				}
			}
		};
		walk(container);
	}

	private seekInShadowingView(sec: number) {
		if (this.shadowingLeaf && (this.shadowingLeaf.view as any).seekTo) {
			(this.shadowingLeaf.view as any).seekTo(sec);
			return;
		}
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType('lme-shadowing-view');
		if (leaves.length > 0 && (leaves[0].view as any).seekTo) {
			(leaves[0].view as any).seekTo(sec);
		} else {
			new Notice(t('aiAnalysis.noShadowingView'));
		}
	}

	loadMostRecent(): boolean {
		const history = this.plugin.settings.aiAnalysisHistory || [];
		if (history.length === 0) return false;
		this.currentMarkdown = history[0].content;
		this.renderContent(history[0].content);
		return true;
	}
}
