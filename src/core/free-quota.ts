// ============================================================
// 免费版配额校验 —— 所有"新增闪卡"写入口的统一闸门
// ============================================================
// 现有写入口:查词一键入本(dict-view)、手动新建卡(AddFlashcardModal,
// 含 AI 补齐后的保存)、同步合并(Database.importLanguageDataWithMerge,
// 在 Database 内部按剩余配额截断)。改动闪卡写入路径时必须接入本闸门。

import { App, Notice } from 'obsidian';
import { db } from './Database';
import { UpgradeModal } from '../ui/upgrade-modal';
import { t } from '../i18n';
import { FREE_FLASHCARD_LIMIT, FREE_SUBTITLE_WEEKLY_LIMIT } from '../config/free-limits';

/**
 * 闪卡配额校验:还有余量返回 true;触顶时弹 Notice「已满 X/250,升级解锁无限量」
 * 并打开付费引导弹窗,返回 false。调用方在写入前 await 本函数,false 则中止。
 * @param adding 本次预计新增的张数(默认 1)
 */
export async function assertFlashcardQuota(app: App, adding = 1): Promise<boolean> {
	try {
		const total = await db.getTotalVocabularyCount();
		if (total + adding <= FREE_FLASHCARD_LIMIT) return true;
		new Notice(t('freeLimit.flashcardFull', { count: String(total), limit: String(FREE_FLASHCARD_LIMIT) }), 5000);
		new UpgradeModal(app, t('freeLimit.flashcardFeature')).open();
		return false;
	} catch (e) {
		// 统计失败不阻断写入(宁可漏拦不可误伤已有流程)
		console.warn('[LME] flashcard quota check failed:', e);
		return true;
	}
}

// ── 视频笔记每周配额 ─────────────────────────────────────
// 计数存 localStorage 的按周键(以本周一日期为键,新一周自动归零);
// 失败/无字幕不消耗,仅字幕真正写入笔记后由调用方 record。

function subtitleQuotaKey(): string {
	const now = new Date();
	const day = (now.getDay() + 6) % 7; // 周一=0 … 周日=6
	const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `lme.subdl.w.${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

function getSubtitleUsedThisWeek(): number {
	try {
		return parseInt(window.localStorage.getItem(subtitleQuotaKey()) || '0', 10) || 0;
	} catch {
		return 0;
	}
}

/**
 * 视频笔记每周配额校验:还有余量返回 true;本周已用完时弹 Notice 并打开
 * 付费引导弹窗,返回 false。调用方在发起下载前检查,false 则中止。
 */
export function checkSubtitleWeeklyQuota(app: App): boolean {
	try {
		const used = getSubtitleUsedThisWeek();
		if (used < FREE_SUBTITLE_WEEKLY_LIMIT) return true;
		new Notice(t('freeLimit.subtitleFull', { used: String(used), limit: String(FREE_SUBTITLE_WEEKLY_LIMIT) }), 5000);
		new UpgradeModal(app, t('freeLimit.subtitleFeature')).open();
		return false;
	} catch (e) {
		console.warn('[LME] subtitle quota check failed:', e);
		return true;
	}
}

/** 字幕成功写入笔记后调用:本周计数 +1。 */
export function recordSubtitleDownload(): void {
	try {
		const used = getSubtitleUsedThisWeek();
		window.localStorage.setItem(subtitleQuotaKey(), String(used + 1));
	} catch {
		// localStorage 不可用时跳过计数(不阻断功能)
	}
}
