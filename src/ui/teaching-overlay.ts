import { setIcon } from 'obsidian';
import { t } from '../i18n';

export interface TeachingOverlayOptions {
    host: HTMLElement;
    sourcePath: string;
    autoContinue: boolean;
    countdownSec: number;
    onContinue: () => void;
    onReplay: () => void;
}

type QuizMode = 'single' | 'multi' | 'tf';

type TeachSegment =
    | { kind: 'md'; text: string }
    | { kind: 'quiz'; mode: QuizMode; question: string; options: string[]; answers: string[] };

type QuizSegment = Extract<TeachSegment, { kind: 'quiz' }>;

/**
 * 解析教学块内容为段：普通 markdown 段 + 互动题段。
 * 题格式（行首标记决定类型，均支持前导空白/缩进）：
 *   单选： ? 题干   /   - 选项   /   答: 正确项
 *   多选： ?多选: 题干 / - 选项  /   答: 正确项A, 正确项B（逗号/顿号分隔）
 *   判断： ?判断: 陈述句        /   答: 对 | 错（也认 true/false/T/F/是/否/✓/✗）
 */
function parseTeaching(raw: string): TeachSegment[] {
    const segs: TeachSegment[] = [];
    const lines = raw.split('\n');
    let mdBuf: string[] = [];
    let quiz: { mode: QuizMode; question: string; options: string[]; answers: string[] } | null = null;

    const flushMd = () => {
        const text = mdBuf.join('\n').trim();
        if (text) segs.push({ kind: 'md', text });
        mdBuf = [];
    };
    const flushQuiz = () => {
        if (quiz && (quiz.mode === 'tf' || quiz.options.length > 0)) {
            segs.push({ kind: 'quiz', ...quiz });
        }
        quiz = null;
    };

    for (const line of lines) {
        const mMulti = line.match(/^\s*[?？]\s*多选\s*[:：]\s*(.+)/);
        const mTF = line.match(/^\s*[?？]\s*判断\s*[:：]\s*(.+)/);
        const mSingle = line.match(/^\s*[?？]\s*(.+)/);
        const opt = line.match(/^\s*[-*＋－]\s+(.+)/);
        const ans = line.match(/^\s*(?:答|答案|answer)\s*[:：]\s*(.+)$/i);

        if (mMulti || mTF || mSingle) {
            flushMd();
            flushQuiz();
            const mode: QuizMode = mMulti ? 'multi' : mTF ? 'tf' : 'single';
            const question = (mMulti ?? mTF ?? mSingle)![1].trim();
            quiz = { mode, question, options: [], answers: [] };
            continue;
        }
        if (quiz) {
            if (opt) { quiz.options.push(opt[1].trim()); continue; }
            if (ans) {
                const a = ans[1].trim();
                quiz.answers = quiz.mode === 'multi'
                    ? a.split(/[,，、]/).map(s => s.trim()).filter(Boolean)
                    : [a];
                continue;
            }
            if (line.trim() === '') { continue; }
            flushQuiz();
            mdBuf.push(line);
            continue;
        }
        mdBuf.push(line);
    }
    flushMd();
    flushQuiz();
    return segs;
}

/** 判断题答案归一化为 '对' | '错' */
function normalizeTF(s: string): '对' | '错' {
    const v = s.trim().toLowerCase();
    return ['对', 'true', 't', '是', '✓', '正确', 'yes', 'y'].includes(v) ? '对' : '错';
}

/**
 * 教学点浮层：视频播到标记块自动暂停并弹出。玻璃拟态、贴视频右下角。
 * 支持讲解(markdown) + 单选/多选/判断 互动题。
 */
export class TeachingOverlay {
    private el: HTMLElement | null = null;
    private autoTimer: number | null = null;
    private countdownTimer: number | null = null;
    private countdownEl: HTMLElement | null = null;
    private readonly opts: TeachingOverlayOptions;

    constructor(opts: TeachingOverlayOptions) {
        this.opts = opts;
    }

    get isOpen(): boolean {
        return this.el !== null;
    }

    async show(teaching: string): Promise<void> {
        this.close();
        const host = this.opts.host;

        const el = host.createDiv({ cls: 'lme-teaching-overlay' });
        this.el = el;

        const card = el.createDiv('lme-teaching-card');

        const head = card.createDiv('lme-teaching-head');
        head.createDiv({ cls: 'lme-teaching-kicker', text: t('shadowing.teachingTitle') });

        const body = card.createDiv('lme-teaching-body');

        const segments = parseTeaching(teaching);
        const hasQuiz = segments.some(s => s.kind === 'quiz');
        const onCorrect = () => {
            // 题卡答对 → 短延迟后自动续播(让看到绿色反馈)
            if (this.opts.autoContinue) this.scheduleAutoContinue(1200);
        };
        for (const seg of segments) {
            if (seg.kind === 'md') {
                const md = body.createDiv('lme-teaching-md');
                this.renderMd(md, seg.text);
            } else {
                this.renderQuiz(body, seg, onCorrect);
            }
        }

        const footer = card.createDiv('lme-teaching-footer');
        this.countdownEl = footer.createDiv({ cls: 'lme-teach-countdown' });
        this.countdownEl.style.display = 'none';
        const replayBtn = footer.createEl('button', { cls: 'lme-teaching-replay' });
        setIcon(replayBtn, 'rotate-ccw');
        replayBtn.createSpan({ text: t('shadowing.teachingReplay') });
        replayBtn.onclick = () => { this.cancelTimers(); this.opts.onReplay(); };
        const continueBtn = footer.createEl('button', {
            cls: 'lme-teaching-continue mod-cta',
            text: t('shadowing.teachingContinue')
        });
        continueBtn.onclick = () => { this.cancelTimers(); this.opts.onContinue(); };
        window.setTimeout(() => continueBtn.focus(), 0);

        // 自动续播：纯讲解卡倒计时；题卡靠 onCorrect(答对)触发
        if (this.opts.autoContinue && !hasQuiz) {
            this.startCountdown(this.opts.countdownSec);
        }
    }

    private renderQuiz(parent: HTMLElement, quiz: QuizSegment, onCorrect: () => void): void {
        const wrap = parent.createDiv('lme-teach-quiz');
        if (quiz.question) {
            wrap.createDiv({ cls: 'lme-teach-quiz-q', text: quiz.question });
        }

        const norm = (s: string) => s.trim().toLowerCase();
        const isCorrectOpt = (opt: string) => quiz.answers.some(a => norm(a) === norm(opt));

        if (quiz.mode === 'tf') {
            const correct = normalizeTF(quiz.answers[0] ?? '');
            const row = wrap.createDiv('lme-teach-tf-row');
            (['对', '错'] as const).forEach(val => {
                const label = val === '对' ? t('shadowing.teachingTrue') : t('shadowing.teachingFalse');
                const b = row.createEl('button', { cls: 'lme-teach-opt is-tf', text: label });
                b.onclick = () => {
                    Array.from(row.querySelectorAll('button')).forEach(x => x.disabled = true);
                    if (val === correct) {
                        b.addClass('is-correct');
                        onCorrect();
                    } else {
                        b.addClass('is-wrong');
                        const rightBtn = Array.from(row.querySelectorAll('button'))
                            .find(x => x.textContent?.trim() === (correct === '对' ? t('shadowing.teachingTrue') : t('shadowing.teachingFalse')));
                        rightBtn?.addClass('is-answer');
                    }
                };
            });
            return;
        }

        const optBtns: HTMLButtonElement[] = [];
        if (quiz.mode === 'single') {
            quiz.options.forEach(opt => {
                const b = wrap.createEl('button', { cls: 'lme-teach-opt', text: opt });
                b.onclick = () => {
                    optBtns.forEach(x => x.disabled = true);
                    if (isCorrectOpt(opt)) {
                        b.addClass('is-correct');
                        onCorrect();
                    } else {
                        b.addClass('is-wrong');
                        const ai = quiz.options.findIndex(isCorrectOpt);
                        if (ai >= 0) optBtns[ai]?.addClass('is-answer');
                    }
                };
                optBtns.push(b);
            });
            return;
        }

        // 多选：先勾选，再提交判分
        const selected = new Set<number>();
        quiz.options.forEach((opt, i) => {
            const b = wrap.createEl('button', { cls: 'lme-teach-opt is-toggle', text: opt });
            b.onclick = () => {
                if (b.disabled) return;
                if (selected.has(i)) { selected.delete(i); b.removeClass('is-selected'); }
                else { selected.add(i); b.addClass('is-selected'); }
            };
            optBtns.push(b);
        });
        const submit = wrap.createEl('button', { cls: 'lme-teach-submit', text: t('shadowing.teachingSubmit') });
        submit.onclick = () => {
            optBtns.forEach(x => x.disabled = true);
            submit.remove();
            let fullyCorrect = true;
            quiz.options.forEach((opt, i) => {
                const b = optBtns[i];
                const correct = isCorrectOpt(opt);
                const picked = selected.has(i);
                if (correct !== picked) fullyCorrect = false;
                if (correct) b.addClass('is-correct');
                if (picked && !correct) b.addClass('is-wrong');
                if (correct && !picked) b.addClass('is-answer');
            });
            if (fullyCorrect) onCorrect();
        };
    }

    // 自带渲染：callout + 列表 + 内联标记(** * ~~ == `)，保证稳定(不依赖 Obsidian MarkdownRenderer)
    private renderMd(el: HTMLElement, text: string): void {
        const lines = text.split('\n');
        const parts: string[] = [];
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            const calloutStart = line.match(/^>\s*\[!([\w-]+)\]\s*(.*)$/);
            if (calloutStart) {
                const type = calloutStart[1].toLowerCase();
                const title = calloutStart[2].trim();
                const body: string[] = [];
                i++;
                while (i < lines.length && /^>/.test(lines[i])) {
                    body.push(lines[i].replace(/^>\s?/, ''));
                    i++;
                }
                parts.push(this.formatCallout(type, title, body));
                continue;
            }
            if (/^\s*-\s+/.test(line)) {
                const items: string[] = [];
                while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
                    items.push(lines[i].replace(/^\s*-\s+/, ''));
                    i++;
                }
                parts.push(`<ul class="lme-teach-list">${items.map(it => `<li>${this.formatInline(it)}</li>`).join('')}</ul>`);
                continue;
            }
            parts.push(this.formatInline(line));
            i++;
        }
        el.innerHTML = parts.join('<br>');
    }

    private formatCallout(type: string, title: string, body: string[]): string {
        const titleHtml = title ? `<div class="lme-teach-callout-title">${this.formatInline(title)}</div>` : '';
        const bodyHtml = body.map(b => this.formatInline(b)).join('<br>');
        return `<div class="lme-teach-callout is-${type}">${titleHtml}<div class="lme-teach-callout-body">${bodyHtml}</div></div>`;
    }

    private formatInline(line: string): string {
        let s = line
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
        s = s.replace(/==([^=]+)==/g, '<mark>$1</mark>');
        s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
        s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
        return s;
    }

    // 答对后延迟自动续播
    private scheduleAutoContinue(ms: number): void {
        this.cancelTimers();
        this.autoTimer = window.setTimeout(() => {
            this.autoTimer = null;
            this.opts.onContinue();
        }, ms);
    }

    // 纯讲解卡可见倒计时，到 0 自动续播
    private startCountdown(sec: number): void {
        this.cancelTimers();
        if (!this.countdownEl) return;
        let remaining = sec;
        this.countdownEl.setText(`${remaining}s`);
        this.countdownEl.style.display = '';
        this.countdownTimer = window.setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                const handle = this.countdownTimer;
                this.countdownTimer = null;
                if (handle != null) window.clearInterval(handle);
                this.opts.onContinue();
                return;
            }
            this.countdownEl?.setText(`${remaining}s`);
        }, 1000);
    }

    private cancelTimers(): void {
        if (this.autoTimer != null) { window.clearTimeout(this.autoTimer); this.autoTimer = null; }
        if (this.countdownTimer != null) { window.clearInterval(this.countdownTimer); this.countdownTimer = null; }
        if (this.countdownEl) this.countdownEl.style.display = 'none';
    }

    close(): void {
        this.cancelTimers();
        if (this.el) {
            this.el.remove();
            this.el = null;
        }
    }
}
