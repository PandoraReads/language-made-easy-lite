// ============================================================
// 学习模式渲染器统一契约
// 社区免费版仅保留 flip(翻卡)模式;听力/填空随完整版移除,
// 切换条上的对应 tab 改为弹 UpgradeModal 付费引导。
// ============================================================

import type { Rating } from 'ts-fsrs';
import type { App, Component } from 'obsidian';
import type { VocabularyEntry } from '../../models';

/** 学习模式(免费版运行时恒为 flip,类型保留 audio/write 供切换条标签使用)。 */
export type StudyMode = 'flip' | 'audio' | 'write';

/** 由 FlashcardView 提供给模式渲染器的上下文。 */
export interface ModeContext {
    /** MarkdownRenderer.render 所需的 App 实例。 */
    app: App;
    /** 当前卡片。 */
    entry: VocabularyEntry;
    /** 当前语言（播音频/TTS 用）。 */
    language: string;
    /** MarkdownRenderer 需要的 component（传 FlashcardView 自身）。 */
    component: Component;
    /** 提交 FSRS 评分。 */
    onGrade: (rating: Rating) => void;
    /** 翻面回调（view 内部播翻页音效）。 */
    onFlip?: () => void;
}

/** 学习模式渲染器统一契约。 */
export interface ModeRenderer {
    /** 渲染到 parent（调用前 view 已 empty）。 */
    render(parent: HTMLElement, ctx: ModeContext): void;
}
