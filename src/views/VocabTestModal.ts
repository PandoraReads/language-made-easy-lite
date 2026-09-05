// @ts-nocheck
// ============================================================
// Language Made Easy - Vocabulary Test Modal
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// 120-question test with enhanced diagnostics
// ============================================================

import { Modal, App } from 'obsidian';
import type LanguageMadeEasyPlugin from '../main-unified-full';
import type { VocabTestItem, VocabTestResult } from '../models';
import { vocabSizeService } from '../core/VocabSizeService';
import { db } from '../core/Database';
import type { TestResult, BandResult } from '../core/VocabTestGenerator';
import { t, getLocale } from '../i18n';

const STYLE_ID = 'lme-vocab-test-styles';

function injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
/* ===== Modal outer ===== */
.lme-vocab-test-outer {
    max-width: 520px !important;
    width: 520px !important;
    border-radius: 24px !important;
    background: var(--lme-bg-deep) !important;
    padding: 0 !important;
    box-shadow: 0 24px 64px rgba(0,0,0,0.18) !important;
    overflow: hidden !important;
    border: 1px solid var(--lme-glass-border) !important;
    font-family: var(--lme-font-sans) !important;
}
.lme-vocab-test-modal {
    padding: 0 !important;
    background: transparent !important;
}

/* ===== Intro ===== */
.lme-vocab-test-intro {
    display: flex; flex-direction: column; align-items: center;
    gap: 16px; padding: 40px 32px 32px;
}
.lme-vocab-test-intro-icon { font-size: 48px; margin-bottom: 4px; }
.lme-vocab-test-intro h2 {
    color: var(--lme-seal-red); font-family: var(--lme-font-serif);
    font-size: 1.6em; font-weight: 700; margin: 0;
}
.lme-vocab-test-intro-desc {
    text-align: center; color: var(--lme-text-secondary);
    font-size: 14px; max-width: 360px; line-height: 1.7;
}
.lme-vocab-test-rules {
    width: 100%; max-width: 380px;
    background: var(--lme-glass-bg); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--lme-glass-border); border-radius: 12px;
    padding: 16px 20px; margin: 4px 0;
}
.lme-vocab-test-rules ul { list-style: none; padding: 0; margin: 0; }
.lme-vocab-test-rules li {
    padding: 5px 0; font-size: 13px; color: var(--lme-text-secondary);
    position: relative; padding-left: 20px; line-height: 1.5;
}
.lme-vocab-test-rules li::before {
    content: '\\2022'; position: absolute; left: 6px; color: var(--lme-accent);
}
.lme-vocab-test-info {
    display: flex; gap: 12px; font-size: 12px;
    color: var(--lme-text-muted); margin: 8px 0;
}
.lme-vocab-test-info span {
    padding: 4px 12px; border-radius: 10px;
    background: var(--lme-glass-bg); border: 1px solid var(--lme-glass-border);
}

/* ===== Shared button ===== */
.lme-vocab-test-btn-container { display: flex; gap: 12px; justify-content: center; margin-top: 8px; }
.lme-vocab-test-btn {
    padding: 12px 32px; border-radius: 20px; border: none;
    font-size: 15px; font-family: var(--lme-font-sans); cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); font-weight: 600;
}
.lme-vocab-test-btn-primary {
    display: flex; align-items: center; gap: 6px;
    padding: 10px 24px; border-radius: 18px;
    background: var(--lme-accent); color: var(--lme-paper-cream);
    box-shadow: 0 4px 14px rgba(0,0,0,0.15);
    border: none;
    font-size: 14px; font-family: var(--lme-font-sans); font-weight: 600;
    cursor: pointer; transition: all 0.2s ease;
}
.lme-vocab-test-btn-primary:hover {
    transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.2);
}
.lme-vocab-test-btn-primary:active { transform: scale(0.97); }

/* ===== Test card ===== */
.lme-vocab-test-card {
    display: flex; flex-direction: column; align-items: center;
    padding: 32px 32px 28px; gap: 24px; min-height: 380px; justify-content: center;
}
.lme-vocab-test-progress-container { width: 100%; display: flex; align-items: center; gap: 12px; }
.lme-vocab-test-progress-track {
    flex: 1; height: 6px; border-radius: 3px;
    background: var(--lme-paper-edge); overflow: hidden;
}
.lme-vocab-test-progress-bar {
    height: 100%; border-radius: 3px;
    background: var(--lme-accent); transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.lme-vocab-test-progress-text {
    font-size: 12px; color: var(--lme-text-muted);
    white-space: nowrap; font-variant-numeric: tabular-nums;
}
.lme-vocab-test-band {
    font-size: 11px; color: var(--lme-text-muted);
    padding: 2px 10px; border-radius: 8px;
    background: var(--lme-glass-bg); border: 1px solid var(--lme-glass-border);
}
.lme-vocab-test-word {
    font-size: 38px; font-weight: 700; color: var(--lme-seal-red);
    letter-spacing: 0.5px; font-family: var(--lme-font-serif);
    min-height: 52px; display: flex; align-items: center;
}
.lme-vocab-test-choice-container { display: flex; gap: 20px; }
.lme-vocab-test-btn-yes, .lme-vocab-test-btn-no {
    display: flex; align-items: center; gap: 8px;
    padding: 14px 36px; border-radius: 22px;
    border: 1px solid var(--lme-glass-border);
    font-size: 16px; font-family: var(--lme-font-sans); font-weight: 600;
    cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    background: var(--lme-glass-bg); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    color: var(--lme-text-primary); box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.lme-vocab-test-btn-icon { font-size: 16px; }
.lme-vocab-test-btn-yes:hover {
    background: var(--lme-academic-green); color: var(--lme-paper-cream);
    border-color: transparent; transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}
.lme-vocab-test-btn-no:hover {
    background: var(--lme-seal-red); color: var(--lme-paper-cream);
    border-color: transparent; transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}
.lme-vocab-test-hint { font-size: 12px; color: var(--lme-text-muted); }

/* ===== Results ===== */
.lme-vocab-test-results {
    display: flex; flex-direction: column; align-items: center;
    gap: 10px; padding: 32px 28px 28px;
}
.lme-vocab-test-results h2 {
    color: var(--lme-text-primary); font-family: var(--lme-font-serif);
    font-size: 1.2em; font-weight: 700; margin: 0;
}
.lme-vocab-test-results-size { display: flex; align-items: baseline; gap: 6px; margin: 4px 0; }
.lme-vocab-test-results-number {
    font-size: 48px; font-weight: 800; color: var(--lme-seal-red);
    letter-spacing: -1px; font-family: var(--lme-font-serif); line-height: 1;
}
.lme-vocab-test-results-unit { font-size: 16px; color: var(--lme-text-muted); }

/* Benchmark badge */
.lme-vocab-test-benchmark {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    margin: 4px 0 8px;
}
.lme-vocab-test-benchmark-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 16px; border-radius: 14px;
    font-size: 16px; font-weight: 700; letter-spacing: 0.5px;
    background: var(--lme-accent); color: var(--lme-paper-cream);
}
.lme-vocab-test-benchmark-desc {
    font-size: 13px; color: var(--lme-text-secondary);
}
.lme-vocab-test-cefr {
    font-size: 12px; color: var(--lme-text-muted);
    padding: 2px 8px; border-radius: 8px;
    background: var(--lme-glass-bg); border: 1px solid var(--lme-glass-border);
}

/* Honesty section */
.lme-vocab-test-honesty {
    width: 100%; max-width: 380px;
    padding: 10px 16px; border-radius: 10px; text-align: center;
    font-size: 12px; line-height: 1.5;
}
.lme-vocab-test-honesty-green {
    background: rgba(34,197,94,0.08); color: #16a34a;
    border: 1px solid rgba(34,197,94,0.15);
}
.lme-vocab-test-honesty-yellow {
    background: rgba(245,158,11,0.08); color: #d97706;
    border: 1px solid rgba(245,158,11,0.15);
}
.lme-vocab-test-honesty-red {
    background: rgba(239,68,68,0.08); color: #dc2626;
    border: 1px solid rgba(239,68,68,0.15);
}
.lme-vocab-test-honesty-label {
    font-weight: 700; font-size: 13px; margin-bottom: 2px;
}

/* Band decay chart */
.lme-vocab-test-bands {
    width: 100%; max-width: 400px; margin: 4px 0;
    background: var(--lme-glass-bg); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--lme-glass-border); border-radius: 12px; padding: 14px 18px;
}
.lme-vocab-test-bands h3 {
    font-size: 12px; color: var(--lme-text-muted); margin: 0 0 10px 0;
    text-align: center; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em;
}
.lme-vocab-test-band-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
.lme-vocab-test-band-label {
    font-size: 12px; font-weight: 600; color: var(--lme-text-secondary);
    width: 28px; text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums;
}
.lme-vocab-test-band-range {
    font-size: 10px; color: var(--lme-text-muted);
    width: 52px; text-align: right; flex-shrink: 0;
}
.lme-vocab-test-band-bar-bg {
    flex: 1; height: 8px; border-radius: 4px;
    background: var(--lme-paper-edge); overflow: hidden;
}
.lme-vocab-test-band-bar-fill {
    height: 100%; border-radius: 4px;
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    min-width: 0;
}
.lme-vocab-test-band-bar-fill-good { background: var(--lme-academic-green); }
.lme-vocab-test-band-bar-fill-mid { background: #f59e0b; }
.lme-vocab-test-band-bar-fill-low { background: var(--lme-seal-red); }
.lme-vocab-test-band-pct {
    font-size: 11px; color: var(--lme-text-muted);
    width: 34px; text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums;
}
.lme-vocab-test-band-size {
    font-size: 10px; color: var(--lme-text-muted);
    width: 44px; text-align: right; flex-shrink: 0;
}

.lme-vocab-test-unavailable { text-align: center; padding: 40px; color: var(--lme-text-muted); font-size: 14px; }
.lme-vocab-test-error { text-align: center; padding: 20px; color: var(--lme-seal-red); font-size: 14px; }

/* Action buttons (save/share) */
.lme-vocab-test-action-container {
    display: flex; gap: 10px; justify-content: center; margin-top: 8px;
}
.lme-vocab-test-btn-save, .lme-vocab-test-btn-share {
    display: flex; align-items: center; gap: 6px;
    padding: 10px 24px; border-radius: 18px;
    border: 1px solid var(--lme-glass-border);
    font-size: 14px; font-family: var(--lme-font-sans); font-weight: 600;
    cursor: pointer; transition: all 0.2s ease;
    background: var(--lme-glass-bg); color: var(--lme-text-primary);
}
.lme-vocab-test-btn-save:hover, .lme-vocab-test-btn-share:hover {
    transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
`;
    document.head.appendChild(s);
}

// PandoraReads — 词汇量测试
export class VocabTestModal extends Modal {
    private plugin: LanguageMadeEasyPlugin;
    private items: VocabTestItem[] = [];
    private answers: Map<string, boolean> = new Map();
    private currentIndex = 0;
    private phase: 'intro' | 'testing' | 'results' = 'intro';
    private processingAnswer = false;
    private results: TestResult | null = null;

    constructor(app: App, plugin: LanguageMadeEasyPlugin) {
        super(app);
        this.plugin = plugin;
    }

    private getLangDisplayName(language: string): string {
        const names: Record<string, { zh: string; en: string }> = {
            english: { zh: '英语', en: 'English' },
            french: { zh: '法语', en: 'French' },
            german: { zh: '德语', en: 'German' },
            spanish: { zh: '西班牙语', en: 'Spanish' },
            japanese: { zh: '日语', en: 'Japanese' },
            korean: { zh: '韩语', en: 'Korean' },
            russian: { zh: '俄语', en: 'Russian' },
        };
        const entry = names[language];
        if (!entry) return language;
        const locale = getLocale();
        return locale === 'zh-CN' ? entry.zh : entry.en;
    }

    async onOpen(): Promise<void> {
        injectStyles();

        const { contentEl } = this;
        contentEl.empty();

        const modalEl = contentEl.closest('.modal') as HTMLElement;
        if (modalEl) modalEl.addClass('lme-vocab-test-outer');
        contentEl.addClass('lme-vocab-test-modal');

        const closeBtn = contentEl.parentElement?.querySelector('.modal-close-button') as HTMLElement;
        if (closeBtn) closeBtn.style.display = 'none';

        const language = this.plugin.settings.activeLanguage || 'english';
        const available = await vocabSizeService.ensureTestAvailable(language);

        if (!available) {
            contentEl.createEl('div', {
                cls: 'lme-vocab-test-unavailable',
                text: t('vocabTest.notAvailable', { lang: language }),
            });
            return;
        }

        this.items = await vocabSizeService.generateTest(language);
        this.renderIntro(contentEl);
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }

    private renderIntro(parent: HTMLElement): void {
        this.phase = 'intro';
        parent.empty();

        const language = this.plugin.settings.activeLanguage || 'english';
        const langName = this.getLangDisplayName(language);

        const container = parent.createDiv('lme-vocab-test-intro');
        container.createEl('div', { cls: 'lme-vocab-test-intro-icon', text: '\u{1F4DD}' });
        container.createEl('h2', { text: t('vocabTest.title') });
        container.createEl('p', {
            cls: 'lme-vocab-test-intro-desc',
            text: t('vocabTest.description'),
        });

        const rulesEl = container.createDiv('lme-vocab-test-rules');
        const rules = [
            t('vocabTest.rule1', { lang: langName }),
            t('vocabTest.rule2'),
            t('vocabTest.rule3'),
            t('vocabTest.rule4'),
            t('vocabTest.rule5'),
        ];
        const ruleList = rulesEl.createEl('ul');
        for (const rule of rules) {
            ruleList.createEl('li', { text: rule });
        }

        const infoEl = container.createDiv('lme-vocab-test-info');
        infoEl.createSpan({ text: t('vocabTest.totalQuestions', { count: this.items.length }) });
        infoEl.createSpan({ text: t('vocabTest.duration') });

        const btnContainer = container.createDiv('lme-vocab-test-btn-container');
        const startBtn = btnContainer.createEl('button', {
            cls: 'lme-vocab-test-btn lme-vocab-test-btn-primary',
            text: t('vocabTest.start'),
        });
        startBtn.onclick = () => this.startTest();
    }

    private startTest(): void {
        this.phase = 'testing';
        this.currentIndex = 0;
        this.answers.clear();
        this.renderTestItem();
    }

    private renderTestItem(): void {
        const { contentEl } = this;
        contentEl.empty();

        if (this.currentIndex >= this.items.length) {
            this.showResults();
            return;
        }

        const item = this.items[this.currentIndex];
        const progress = (this.currentIndex / this.items.length) * 100;

        const container = contentEl.createDiv('lme-vocab-test-card');

        const progressContainer = container.createDiv('lme-vocab-test-progress-container');
        const progressTrack = progressContainer.createDiv('lme-vocab-test-progress-track');
        const progressBar = progressTrack.createDiv('lme-vocab-test-progress-bar');
        progressBar.style.width = `${progress}%`;
        progressContainer.createSpan({
            cls: 'lme-vocab-test-progress-text',
            text: `${this.currentIndex + 1} / ${this.items.length}`,
        });

        container.createDiv('lme-vocab-test-word').setText(item.word);

        const btnContainer = container.createDiv('lme-vocab-test-choice-container');

        const yesBtn = btnContainer.createEl('button', { cls: 'lme-vocab-test-btn lme-vocab-test-btn-yes' });
        yesBtn.createSpan({ cls: 'lme-vocab-test-btn-icon', text: '✓' });
        yesBtn.createSpan({ text: t('vocabTest.know') });

        const noBtn = btnContainer.createEl('button', { cls: 'lme-vocab-test-btn lme-vocab-test-btn-no' });
        noBtn.createSpan({ cls: 'lme-vocab-test-btn-icon', text: '✗' });
        noBtn.createSpan({ text: t('vocabTest.dontKnow') });

        container.createDiv('lme-vocab-test-hint').setText(t('vocabTest.uncertainHint'));

        const handleAnswer = (knowsWord: boolean) => {
            if (this.processingAnswer) return;
            this.processingAnswer = true;
            this.answers.set(item.word, knowsWord);
            this.currentIndex++;
            this.processingAnswer = false;
            this.renderTestItem();
        };

        yesBtn.onclick = () => handleAnswer(true);
        noBtn.onclick = () => handleAnswer(false);

        this.scope.register([], 'ArrowRight', () => handleAnswer(true));
        this.scope.register([], 'y', () => handleAnswer(true));
        this.scope.register([], 'ArrowLeft', () => handleAnswer(false));
        this.scope.register([], 'n', () => handleAnswer(false));
    }

    private async showResults(): Promise<void> {
        this.phase = 'results';
        const { contentEl } = this;
        contentEl.empty();

        try {
            this.results = vocabSizeService.calculateResults(this.items, this.answers);
            const language = this.plugin.settings.activeLanguage || 'english';
            await vocabSizeService.saveTestResult(language, this.results);
            this.plugin.settings.vocabTestCompleted = true;
            await this.plugin.saveSettings();
        } catch (error) {
            contentEl.createEl('div', {
                cls: 'lme-vocab-test-error',
                text: t('vocabTest.saveFailed', { error: error.message || t('errors.unknown') }),
            });
            const btn = contentEl.createEl('button', {
                cls: 'lme-vocab-test-btn lme-vocab-test-btn-primary', text: t('common.close'),
            });
            btn.onclick = () => this.close();
            return;
        }

        const container = contentEl.createDiv('lme-vocab-test-results');
        container.createEl('h2', { text: t('vocabTest.complete') });

        // Vocabulary size
        const sizeEl = container.createDiv('lme-vocab-test-results-size');
        sizeEl.createEl('span', { cls: 'lme-vocab-test-results-number', text: this.results.estimatedSize.toLocaleString() });
        sizeEl.createEl('span', { cls: 'lme-vocab-test-results-unit', text: t('vocabTest.wordUnit') });

        // Benchmark + CEFR + Language-specific proficiency
        const benchmark = vocabSizeService.getBenchmarkLabel(this.results.estimatedSize);
        const cefrLevel = vocabSizeService.getCEFRLevel(this.results.estimatedSize);
        const profLabel = vocabSizeService.getProficiencyLabel(language, this.results.estimatedSize);
        const benchmarkEl = container.createDiv('lme-vocab-test-benchmark');
        const badgeEl = benchmarkEl.createDiv('lme-vocab-test-benchmark-badge');
        badgeEl.createSpan({ text: benchmark.label });
        badgeEl.createSpan({ text: ' · ' });
        badgeEl.createSpan({ text: cefrLevel });
        if (profLabel) {
            badgeEl.createSpan({ text: ' · ' });
            badgeEl.createSpan({ text: profLabel });
        }
        benchmarkEl.createDiv('lme-vocab-test-benchmark-desc').setText(benchmark.description);

        // Honesty index
        const honesty = vocabSizeService.getHonestyLabel(this.results.honestyIndex);
        const honestyEl = container.createDiv(`lme-vocab-test-honesty lme-vocab-test-honesty-${honesty.color}`);
        const pct = Math.round(this.results.honestyIndex * 100);
        honestyEl.createDiv('lme-vocab-test-honesty-label').setText(t('vocabTest.honestyLabel', { pct }));
        honestyEl.createDiv({ text: honesty.text });

        // Band decay chart
        const bandsContainer = container.createDiv('lme-vocab-test-bands');
        bandsContainer.createEl('h3', { text: t('vocabTest.bandDecayCurve') });

        const bandRanges = ['1-2K', '2-4K', '4-7K', '7-10K', '10-14K', '14-20K'];

        for (let i = 0; i < this.results.bandResults.length; i++) {
            const br = this.results.bandResults[i];
            const rate = br.correctedRate;
            const pctStr = `${Math.round(rate * 100)}%`;
            const sizeStr = br.estimatedSize.toLocaleString();

            const row = bandsContainer.createDiv('lme-vocab-test-band-row');
            row.createEl('span', { cls: 'lme-vocab-test-band-label', text: br.band });
            row.createEl('span', { cls: 'lme-vocab-test-band-range', text: bandRanges[i] || '' });

            const barBg = row.createDiv('lme-vocab-test-band-bar-bg');
            const barFill = barBg.createDiv('lme-vocab-test-band-bar-fill');
            barFill.style.width = `${Math.round(rate * 100)}%`;

            // Color based on mastery level
            if (rate >= 0.6) {
                barFill.addClass('lme-vocab-test-band-bar-fill-good');
            } else if (rate >= 0.3) {
                barFill.addClass('lme-vocab-test-band-bar-fill-mid');
            } else {
                barFill.addClass('lme-vocab-test-band-bar-fill-low');
            }

            row.createEl('span', { cls: 'lme-vocab-test-band-pct', text: pctStr });
            row.createEl('span', { cls: 'lme-vocab-test-band-size', text: sizeStr });
        }

        // Detect cliff (biggest drop between adjacent bands)
        let cliffBand = '';
        let maxDrop = 0;
        for (let i = 1; i < this.results.bandResults.length; i++) {
            const drop = this.results.bandResults[i - 1].correctedRate - this.results.bandResults[i].correctedRate;
            if (drop > maxDrop) {
                maxDrop = drop;
                cliffBand = this.results.bandResults[i].band;
            }
        }
        if (maxDrop > 0.3 && cliffBand) {
            const cliffNote = bandsContainer.createDiv({
                attr: { style: 'font-size: 11px; color: var(--lme-seal-red); text-align: center; margin-top: 8px; font-weight: 600;' },
            });
            cliffNote.setText(t('vocabTest.bottleneck', { band: cliffBand }));
        }

        // History & Done buttons
        const actionContainer = container.createDiv('lme-vocab-test-action-container');

        const historyBtn = actionContainer.createEl('button', {
            cls: 'lme-vocab-test-btn lme-vocab-test-btn-save',
        });
        historyBtn.createSpan({ cls: 'lme-vocab-test-btn-icon', text: '\u{1F4C8}' });
        historyBtn.createSpan({ text: t('vocabTest.viewHistory') });
        historyBtn.onclick = () => {
            new VocabHistoryModal(this.app, this.plugin).open();
        };

        const doneBtn = actionContainer.createEl('button', {
            cls: 'lme-vocab-test-btn lme-vocab-test-btn-primary',
        });
        doneBtn.createSpan({ cls: 'lme-vocab-test-btn-icon', text: '✅' });
        doneBtn.createSpan({ text: t('common.done') });
        doneBtn.onclick = () => {
            this.close();
            const flashcardLeaf = this.app.workspace.getLeavesOfType('lme-flashcard-view')[0];
            if (flashcardLeaf) {
                const view = flashcardLeaf.view as any;
                if (view.render) view.render();
            }
        };
    }
}

// ============================================================
// Vocabulary Test History Modal
// ============================================================

const HISTORY_STYLE_ID = 'lme-vocab-history-styles';

function injectHistoryStyles(): void {
    if (document.getElementById(HISTORY_STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = HISTORY_STYLE_ID;
    s.textContent = `
.lme-vocab-history-outer {
    max-width: 520px !important; width: 520px !important;
    border-radius: 24px !important;
    background: var(--lme-bg-deep) !important;
    padding: 0 !important;
    box-shadow: 0 24px 64px rgba(0,0,0,0.18) !important;
    overflow: hidden !important;
    border: 1px solid var(--lme-glass-border) !important;
    font-family: var(--lme-font-sans) !important;
}
.lme-vocab-history-modal { padding: 0 !important; background: transparent !important; }

.lme-vocab-history-header {
    display: flex; flex-direction: column; align-items: center;
    gap: 8px; padding: 28px 24px 16px;
}
.lme-vocab-history-header h2 {
    color: var(--lme-text-primary); font-family: var(--lme-font-serif);
    font-size: 1.3em; font-weight: 700; margin: 0;
}
.lme-vocab-history-header-desc {
    font-size: 12px; color: var(--lme-text-muted); text-align: center;
}

.lme-vocab-history-list {
    padding: 0 24px 16px; display: flex; flex-direction: column; gap: 8px;
    max-height: 420px; overflow-y: auto;
}
.lme-vocab-history-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-radius: 12px;
    background: var(--lme-glass-bg); border: 1px solid var(--lme-glass-border);
}
.lme-vocab-history-item-left {
    display: flex; align-items: baseline; gap: 10px;
}
.lme-vocab-history-item-number {
    font-size: 28px; font-weight: 800; color: var(--lme-seal-red);
    font-family: var(--lme-font-serif); line-height: 1; letter-spacing: -0.5px;
}
.lme-vocab-history-item-unit { font-size: 13px; color: var(--lme-text-muted); }
.lme-vocab-history-item-right {
    display: flex; flex-direction: column; align-items: flex-end; gap: 4px;
}
.lme-vocab-history-item-tags {
    display: flex; gap: 5px;
}
.lme-vocab-history-item-tag {
    padding: 2px 8px; border-radius: 8px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.5px;
}
.lme-vocab-history-item-tag-level {
    background: rgba(197, 160, 89, 0.12); color: var(--lme-gold-accent);
    border: 1px solid rgba(197, 160, 89, 0.2);
}
.lme-vocab-history-item-tag-cefr {
    background: rgba(139, 58, 58, 0.15); color: var(--lme-seal-red);
    border: 1px solid rgba(139, 58, 58, 0.2);
}
.lme-vocab-history-item-date {
    font-size: 11px; color: var(--lme-text-muted);
}
.lme-vocab-history-item-latest {
    border-color: rgba(197, 160, 89, 0.3);
    box-shadow: 0 0 12px rgba(197, 160, 89, 0.06);
}
.lme-vocab-history-latest-label {
    font-size: 9px; color: var(--lme-gold-accent); font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase;
}
.lme-vocab-history-empty {
    text-align: center; padding: 40px; color: var(--lme-text-muted); font-size: 14px;
}
.lme-vocab-history-footer {
    display: flex; justify-content: center; padding: 8px 24px 20px;
}
`;
    document.head.appendChild(s);
}

export class VocabHistoryModal extends Modal {
    private plugin: LanguageMadeEasyPlugin;

    constructor(app: App, plugin: LanguageMadeEasyPlugin) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen(): Promise<void> {
        injectHistoryStyles();
        const { contentEl } = this;
        contentEl.empty();

        const modalEl = contentEl.closest('.modal') as HTMLElement;
        if (modalEl) modalEl.addClass('lme-vocab-history-outer');
        contentEl.addClass('lme-vocab-history-modal');

        const closeBtn = contentEl.parentElement?.querySelector('.modal-close-button') as HTMLElement;
        if (closeBtn) closeBtn.style.display = 'none';

        const language = this.plugin.settings.activeLanguage || 'english';
        const history = await db.getVocabSizeHistory(language, 20);

        const header = contentEl.createDiv('lme-vocab-history-header');
        header.createEl('h2', t('vocabTest.testHistory'));
        header.createDiv('lme-vocab-history-header-desc').setText(t('vocabTest.testHistoryCount', { count: history.length }));

        const list = contentEl.createDiv('lme-vocab-history-list');

        if (history.length === 0) {
            list.createDiv('lme-vocab-history-empty').setText(t('vocabTest.noHistory'));
        } else {
            for (let i = 0; i < history.length; i++) {
                const r = history[i];
                const item = list.createDiv('lme-vocab-history-item');
                if (i === 0) item.addClass('lme-vocab-history-item-latest');

                const left = item.createDiv('lme-vocab-history-item-left');
                left.createEl('span', { cls: 'lme-vocab-history-item-number', text: r.estimatedSize.toLocaleString() });
                left.createEl('span', { cls: 'lme-vocab-history-item-unit', text: t('vocabTest.wordUnit') });

                const right = item.createDiv('lme-vocab-history-item-right');

                if (i === 0) {
                    right.createDiv('lme-vocab-history-latest-label').setText(t('vocabTest.latest'));
                }

                const tags = right.createDiv('lme-vocab-history-item-tags');
                const bm = vocabSizeService.getBenchmarkLabel(r.estimatedSize);
                const cefr = vocabSizeService.getCEFRLevel(r.estimatedSize);
                const profLabel = vocabSizeService.getProficiencyLabel(language, r.estimatedSize);
                tags.createDiv('lme-vocab-history-item-tag lme-vocab-history-item-tag-level').setText(bm.label);
                tags.createDiv('lme-vocab-history-item-tag lme-vocab-history-item-tag-cefr').setText(cefr);
                if (profLabel) {
                    tags.createDiv('lme-vocab-history-item-tag lme-vocab-history-item-tag-cefr').setText(profLabel);
                }

                const d = new Date(r.testTime);
                right.createDiv('lme-vocab-history-item-date').setText(
                    d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                );
            }
        }

        const footer = contentEl.createDiv('lme-vocab-history-footer');
        const doneBtn = footer.createEl('button', {
            cls: 'lme-vocab-test-btn lme-vocab-test-btn-primary',
            text: t('common.close'),
        });
        doneBtn.onclick = () => this.close();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
