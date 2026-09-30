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
            contentEl.createDiv({
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
        container.createDiv({ cls: 'lme-vocab-test-intro-icon', text: '\u{1F4DD}' });
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
            contentEl.createDiv({
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
        sizeEl.createSpan({ cls: 'lme-vocab-test-results-number', text: this.results.estimatedSize.toLocaleString() });
        sizeEl.createSpan({ cls: 'lme-vocab-test-results-unit', text: t('vocabTest.wordUnit') });

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
            row.createSpan({ cls: 'lme-vocab-test-band-label', text: br.band });
            row.createSpan({ cls: 'lme-vocab-test-band-range', text: bandRanges[i] || '' });

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

            row.createSpan({ cls: 'lme-vocab-test-band-pct', text: pctStr });
            row.createSpan({ cls: 'lme-vocab-test-band-size', text: sizeStr });
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
                const view = flashcardLeaf.view as unknown;
                if (view.render) view.render();
            }
        };
    }
}

// ============================================================
// Vocabulary Test History Modal
// ============================================================
export class VocabHistoryModal extends Modal {
    private plugin: LanguageMadeEasyPlugin;

    constructor(app: App, plugin: LanguageMadeEasyPlugin) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen(): Promise<void> {
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
                left.createSpan({ cls: 'lme-vocab-history-item-number', text: r.estimatedSize.toLocaleString() });
                left.createSpan({ cls: 'lme-vocab-history-item-unit', text: t('vocabTest.wordUnit') });

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
