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
import { FREE_FLASHCARD_LIMIT } from '../config/free-limits';

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
