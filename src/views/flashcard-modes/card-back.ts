// @ts-nocheck
// ============================================================
// 卡片背面 + 评分栏共享渲染（flip/audio 共用）
// 从原 flashcard-view.renderCard 提取，保证视觉与交互一致。
// ============================================================

import { setIcon, MarkdownRenderer } from 'obsidian';
import { Rating } from 'ts-fsrs';
import { playAudio } from '../../services/UnifiedDictionaryService';
import { t } from '../../i18n';
import type { VocabularyEntry } from '../../models';
import type { ModeContext } from './types';

/**
 * 填充卡片背面：word + 音标 + 发音按钮 + 释义（Markdown）+ 例句 + 译文。
 * 与原 renderCard 背面逐行等价。
 */
export function fillCardBack(back: HTMLElement, entry: VocabularyEntry, ctx: ModeContext): void {
    back.createDiv({ cls: 'lme-card-word lme-card-word-sm', text: entry.word });

    const phonRow = back.createDiv('lme-card-phonetic-row');
    if (entry.phonetic) {
        phonRow.createDiv({ cls: 'lme-card-phonetic', text: entry.phonetic });
    }
    const audioBtn = phonRow.createEl('button', {
        cls: 'lme-icon-btn lme-audio-btn',
        attr: { 'aria-label': t('dict.playAudio') },
    });
    setIcon(audioBtn, 'volume-2');
    audioBtn.onclick = (e: MouseEvent) => {
        e.stopPropagation();   // 按钮在 flipper 内，防止冒泡触发翻转
        playAudio(entry.word, ctx.language).catch(err => console.error('[FC] Audio btn failed:', err));
    };

    const defEl = back.createDiv('lme-card-definition');
    void MarkdownRenderer.render(ctx.app, entry.definition, defEl, entry.sourceNotePath || '', ctx.component);

    if (entry.contextSnippet) {
        const ctxWrap = back.createDiv('lme-card-context');
        const ctxTextEl = ctxWrap.createDiv('lme-card-context-text');
        void MarkdownRenderer.render(ctx.app, entry.contextSnippet, ctxTextEl, entry.sourceNotePath || '', ctx.component);

        if (entry.contextTranslation) {
            const transEl = ctxWrap.createDiv('lme-card-context-translation');
            transEl.createSpan({ text: entry.contextTranslation });
        }
    }
}

/**
 * 创建 4 档评分栏（Again/Hard/Good/Easy）。初始可见，调用方用 opacity/pointerEvents
 * 控制翻面前隐藏。返回 ratingBar 元素。
 */
export function createRatingBar(parent: HTMLElement, onGrade: (rating: Rating) => void): HTMLDivElement {
    const ratingBar = parent.createDiv('lme-rating-bar-refined');
    const ratings: Array<{ label: string; cls: string; rating: Rating }> = [
        { label: t('flashcard.again'), cls: 'again', rating: Rating.Again },
        { label: t('flashcard.hard'), cls: 'hard', rating: Rating.Hard },
        { label: t('flashcard.good'), cls: 'good', rating: Rating.Good },
        { label: t('flashcard.easy'), cls: 'easy', rating: Rating.Easy },
    ];
    ratings.forEach(({ label, cls, rating }) => {
        const btn = ratingBar.createEl('button', {
            cls: `lme-rating-btn-v2 lme-rating-${cls}`,
            text: label,
        });
        btn.onclick = () => onGrade(rating);
    });
    return ratingBar;
}
