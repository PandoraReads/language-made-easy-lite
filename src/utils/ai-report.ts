// ============================================================
// Language Made Easy - AI Report 共用工具
// ============================================================
// 从 ai-analysis-view.ts 抽出的渲染 / 消毒 / 导出 / 历史构造逻辑,
// 供 AIAnalysisView(侧栏) 与 AIReportCatalogView(目录页) / AIReportPreviewModal(预览) 共用。
// sanitizeDom 全仓仅此一份(安全关键),切勿在他处复制。
// 文件顶头无 @ts-nocheck —— 本模块是受类型检查的单一真源。

import { App, Component, MarkdownRenderer } from 'obsidian';
import { t } from '../i18n';
import type { AIAnalysisHistoryEntry } from '../models';

/** AI 解析历史最多保留条数(超出按时间挤掉最老的)。 */
export const AI_HISTORY_MAX = 50;

/** 生成该报告所用的提示词元信息(用于按类型分组)。 */
export interface PromptMeta {
	name: string;        // 内置项为翻译键片段(如 'builtin.comprehensive'),自定义项为字面显示名
	isBuiltIn: boolean;
}

// ── 危险标签 / 属性(消毒用) ──────────────────────────────
const DANGEROUS_ATTR_RE = /^on/i;
const DANGEROUS_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'applet', 'form', 'input', 'textarea', 'select', 'button', 'link', 'meta', 'base']);

/** 从报告 markdown/html 提取标题(<=30 字)。纯函数。 */
export function extractTitle(markdown: string): string {
	const h1Match = markdown.match(/<h1[^>]*>([^<]+)<\/h1>/);
	if (h1Match) return h1Match[1].trim().slice(0, 30);
	const headingMatch = markdown.match(/^##\s+(.+)$/m);
	if (headingMatch) return headingMatch[1].trim().slice(0, 30);
	const firstLine = markdown.split('\n').find(l => l.trim())?.trim() || t('aiAnalysis.viewTitle');
	return firstLine.replace(/<[^>]+>/g, '').trim().slice(0, 30);
}

/** 判断 content 主要为 HTML(提示词模板产出) 还是纯 Markdown。 */
export function isHtmlContent(text: string): boolean {
	const trimmed = text.trim();
	if (trimmed.startsWith('<')) return true;
	const htmlTags = (trimmed.match(/<(div|span|table|details|summary|h[1-6]|p|font|b|i|strong|em|br|hr|ul|ol|li)\b/g) || []).length;
	const mdHeaders = (trimmed.match(/^#{1,6}\s/m) || []).length;
	return htmlTags > 5 && htmlTags > mdHeaders * 3;
}

/**
 * 递归消毒 DOM:
 * - 整体移除危险标签
 * - 剥离事件属性(on*)
 * - 剥离 javascript: URL
 * - 保留 style / class / 视觉属性
 */
export function sanitizeDom(root: HTMLElement): void {
	const toRemove: Element[] = [];
	const walk = (el: Element) => {
		if (DANGEROUS_TAGS.has(el.tagName.toLowerCase())) {
			toRemove.push(el);
			return;
		}
		const attrs = Array.from(el.attributes);
		for (const attr of attrs) {
			if (DANGEROUS_ATTR_RE.test(attr.name)) {
				el.removeAttribute(attr.name);
				continue;
			}
			if ((attr.name === 'href' || attr.name === 'src' || attr.name === 'action') &&
				attr.value.trim().toLowerCase().startsWith('javascript:')) {
				el.removeAttribute(attr.name);
			}
		}
		for (const child of Array.from(el.children)) {
			walk(child);
		}
	};
	for (const child of Array.from(root.children)) {
		walk(child);
	}
	for (const el of toRemove) {
		el.remove();
	}
}

/** 安全渲染 HTML 内容,保留全部内联样式。 */
export function renderHtmlBody(html: string, container: HTMLElement): void {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	sanitizeDom(doc.body);
	while (doc.body.firstChild) {
		container.appendChild(doc.body.firstChild);
	}
}

/**
 * 按 content 类型分流渲染:
 * - HTML 为主:直接注入 + 消毒(保留内联样式)
 * - Markdown 为主:Obsidian MarkdownRenderer(继承主题/callout)
 * component 为生命周期归属(view/modal 各传 this)。
 */
export function renderBody(content: string, container: HTMLElement, app: App, component: Component): void {
	if (isHtmlContent(content)) {
		renderHtmlBody(content, container);
	} else {
		void MarkdownRenderer.render(app, content, container, '', component);
	}
}

/** 给容器内 table 加统一样式 class。 */
export function enhanceTables(container: HTMLElement): void {
	container.querySelectorAll('table').forEach(table => {
		table.classList.add('lme-ai-timeline-table');
	});
}

/** 构造一条历史 entry(可选携带提示词元信息)。 */
export function createHistoryEntry(markdown: string, promptMeta?: PromptMeta): AIAnalysisHistoryEntry {
	const entry: AIAnalysisHistoryEntry = {
		id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
		timestamp: Date.now(),
		title: extractTitle(markdown),
		content: markdown,
	};
	if (promptMeta) {
		entry.promptName = promptMeta.name;
		entry.promptIsBuiltin = promptMeta.isBuiltIn;
	}
	return entry;
}

/** 解析 entry 的提示词显示名(内置经 t() 解析,跨语言正确);无则返回空串。 */
export function resolvePromptName(entry: AIAnalysisHistoryEntry): string {
	if (!entry.promptName) return '';
	return entry.promptIsBuiltin ? t('prompts.' + entry.promptName) : entry.promptName;
}

// 社区免费版:saveReportToNote / saveReportAsHtml / exportReportAsImage 三个导出动作
// 随完整版移除,入口按钮在各视图改为弹 UpgradeModal 付费引导。
