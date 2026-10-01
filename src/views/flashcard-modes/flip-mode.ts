// @ts-nocheck
// ============================================================
// Flip 翻卡模式：正面单词面，背面全字段，翻面后显 4 档评分栏。
// ============================================================

import { t } from '../../i18n';
import { playAudio } from '../../services/UnifiedDictionaryService';
import { fillCardBack, createRatingBar } from './card-back';
import type { ModeRenderer, ModeContext } from './types';

export const flipMode: ModeRenderer = {
    render(parent: HTMLElement, ctx: ModeContext): void {
        const { entry, language, onGrade, onFlip } = ctx;

        const flipper = parent.createDiv('lme-card-flipper');
        const inner = flipper.createDiv('lme-card-inner');
        const front = inner.createDiv('lme-card-face lme-card-front');
        const back = inner.createDiv('lme-card-face lme-card-back');

        // 正面：单词
        front.createDiv({ cls: 'lme-card-word', text: entry.word });
        const hint = front.createDiv({ cls: 'lme-card-hint', text: t('flashcard.clickFlip') });

        // 背面（word + 音标 + 发音 + 释义 + 例句）
        fillCardBack(back, entry, ctx);

        // 评分栏（翻面前隐藏）
        const ratingBar = createRatingBar(parent, onGrade);
        ratingBar.setCssStyles({ opacity: '0', pointerEvents: 'none' });

        let flipped = false;
        flipper.onclick = () => {
            if (flipped) return;
            flipped = true;
            inner.addClass('lme-flipped');
            hint.setCssStyles({ opacity: '0' });
            ratingBar.setCssStyles({ opacity: '1', pointerEvents: 'auto' });
            onFlip?.();
            playAudio(entry.word, language).catch(e => console.error('[FC] Auto-play failed:', e));
        };
    },
};
