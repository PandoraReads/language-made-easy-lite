// @ts-nocheck
// ============================================================
// English Made Easy - Flashcard Review View (FSRS)
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// ============================================================

import { ItemView, WorkspaceLeaf, setIcon, Modal, Notice, Setting } from 'obsidian';
import { fsrs, generatorParameters, Rating, type Card } from 'ts-fsrs';
import type LanguageMadeEasyPlugin from '../main-unified-full';
import type { VocabularyEntry } from '../../models';
import { db } from '../core/Database';
import { AIService } from '../core/AIService';
import { playAudio } from '../services/UnifiedDictionaryService';
import { randomUUID } from '../mocks/crypto';
import { vocabSizeService } from '../core/VocabSizeService';
import { petService, type PetSnapshot } from '../core/PetService';
import { t } from '../i18n';
import { VocabTestModal } from './VocabTestModal';
import { flipMode } from './flashcard-modes/flip-mode';
import { UpgradeModal } from '../ui/upgrade-modal';
import { assertFlashcardQuota } from '../core/free-quota';
import type { StudyMode, ModeContext } from './flashcard-modes/types';

export const FLASHCARD_VIEW_TYPE = 'lme-flashcard-view';

// Shared heatmap rendering for the flashcard "growth footprint" heatmap.
export function formatDayKeyUTC(date: Date): string {
    return date.toISOString().split('T')[0];
}

export interface HeatmapOptions {
    activityLabelKey?: string;  // default 'flashcard.activity'
    rateLabelKey?: string;      // default 'flashcard.checkInRate'
    countLabelKey?: string;     // default 'flashcard.reviewCount'
}

export function renderHeatmap(parent: HTMLElement, data: Map<string, number>, opts: HeatmapOptions = {}): void {
    const activityKey = opts.activityLabelKey ?? 'flashcard.activity';
    const rateKey = opts.rateLabelKey ?? 'flashcard.checkInRate';
    const countKey = opts.countLabelKey ?? 'flashcard.reviewCount';

    const container = parent.createDiv('lme-heatmap-wrapper');
    const titleArea = container.createDiv('lme-heatmap-title-area');

    const info = titleArea.createDiv('lme-heatmap-info');
    info.createSpan({ text: t(activityKey) });

    const now = new Date();
    const year = now.getFullYear();
    const startOfYear = new Date(year, 0, 1);

    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const totalDaysInYear = isLeapYear ? 366 : 365;

    const checkInRate = info.createSpan({ cls: 'lme-heatmap-rate' });
    const daysWithActivity = data.size;
    const rate = (daysWithActivity / totalDaysInYear) * 100;
    checkInRate.setText(t(rateKey, { rate: rate.toFixed(1) }));

    const grid = container.createDiv('lme-heatmap-grid');
    const todayKey = formatDayKeyUTC(now);

    // Render full year (53 weeks)
    for (let i = 0; i < 53 * 7; i++) {
        const date = new Date(startOfYear);
        date.setDate(date.getDate() + i);
        if (date.getFullYear() > now.getFullYear()) break;

        const dayKey = formatDayKeyUTC(date);
        const count = data.get(dayKey) || 0;

        const cell = grid.createDiv('lme-heatmap-cell');
        if (count > 0) cell.addClass('active');
        if (dayKey === todayKey) cell.addClass('is-today');
        if (date > now) cell.addClass('future');
        cell.setAttr('title', t(countKey, { date: dayKey, count }));
    }
}

type ReviewPhase = 'front' | 'back' | 'done';

// Page turn sound effect using Web Audio API
function playPageTurnSound(): void {
    try {
        const audioContext = new (window.AudioContext || (window as unknown).webkitAudioContext)();
        const duration = 0.9; // 900ms - slower and more relaxed

        // Create softer, more gentle paper rustle
        const createNoiseLayer = (frequency: number, Q: number, volume: number, delay: number) => {
            const bufferSize = audioContext.sampleRate * duration;
            const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
            const data = buffer.getChannelData(0);

            // Smoother noise with gentler envelope
            for (let i = 0; i < bufferSize; i++) {
                const time = i / audioContext.sampleRate;
                // Very smooth attack and gentle decay
                const envelope = Math.min(time / 0.08, 1) * Math.exp(-time / 0.3);
                // Gentle variation, less aggressive
                data[i] = (Math.random() * 2 - 1) * envelope * 0.5;
            }

            const noise = audioContext.createBufferSource();
            noise.buffer = buffer;

            // Softer filter settings
            const filter = audioContext.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = frequency;
            filter.Q.value = Q;

            // Much gentler gain envelope
            const gainNode = audioContext.createGain();
            const now = audioContext.currentTime + delay;
            gainNode.gain.setValueAtTime(0, now);
            // Very gradual attack
            gainNode.gain.linearRampToValueAtTime(volume * 0.08, now + 0.06); // Slower attack
            gainNode.gain.linearRampToValueAtTime(volume * 0.06, now + 0.12); // Slight dip
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration); // Smooth fade out

            noise.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(audioContext.destination);

            noise.start(now);
            return { noise, gainNode };
        };

        // Softer, lower frequency layers - less harsh
        // Layer 1: Gentle high-frequency rustle
        createNoiseLayer(1500, 0.8, 1.0, 0);

        // Layer 2: Warm mid-range
        createNoiseLayer(900, 0.6, 0.6, 0.02);

        // Layer 3: Soft low-end warmth
        createNoiseLayer(500, 0.4, 0.4, 0.04);

    } catch (e) {
        console.error('[EME] Failed to play page turn sound:', e);
    }
}

const QUOTES = [
    { text: "The beautiful thing about learning is nobody can take it away from you.", author: "B.B. King" },
    { text: "Education is not the filling of a pot but the lighting of a fire.", author: "W.B. Yeats" },
    { text: "Live as if you were to die tomorrow. Learn as if you were to live forever.", author: "Mahatma Gandhi" },
    { text: "Learning never exhausts the mind.", author: "Leonardo da Vinci" },
    { text: "Develop a passion for learning. If you do, you will never cease to grow.", author: "Anthony J. D'Angelo" },
    { text: "It's what you learn after you know it all that counts.", author: "Harry S. Truman" },
    { text: "I am still learning.", author: "Michelangelo" },
    { text: "Tell me and I forget. Teach me and I remember. Involve me and I learn.", author: "Benjamin Franklin" },
    { text: "The great end of learning is not knowledge but action.", author: "Aristotle" },
    { text: "You don't learn to walk by following rules. You learn by doing, and by falling over.", author: "Richard Branson" },
    { text: "Education is the passport to the future, for tomorrow belongs to those who prepare for it today.", author: "Malcolm X" },
    { text: "The noblest pleasure is the joy of understanding.", author: "Leonardo da Vinci" },
    { text: "You never change your life until you step out of your comfort zone; change begins at the end of your comfort zone.", author: "Roy T. Bennett" },
    { text: "The two most important days in your life are the day you are born... and the day you find out why.", author: "Mark Twain" },
    { text: "In the end, it's not the years in your life that count. It's the life in your years.", author: "Abraham Lincoln" },
    { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
    { text: "Wherever you are, be all there.", author: "Jim Elliot" },
    { text: "Life is not a problem to be solved, but a reality to be experienced.", author: "Soren Kierkegaard" },
    { text: "The purpose of our lives is to be happy.", author: "Dalai Lama" },
    { text: "Do the best you can until you know better. Then when you know better, do better.", author: "Maya Angelou" },
    { text: "Turn your wounds into wisdom.", author: "Oprah Winfrey" },
    { text: "Be not afraid of growing slowly; be afraid only of standing still.", author: "Chinese Proverb" },
    { text: "Life is what you make it.", author: "Goodreads" },
    { text: "Make each day your masterpiece.", author: "John Wooden" },
    { text: "Love the life you live. Live the life you love.", author: "Bob Marley" },
    { text: "My life is my message.", author: "Mahatma Gandhi" },
    { text: "Happiness is not determined by what's happening around you, but rather what's happening inside you.", author: "johnspence.com" },
    { text: "The best and most beautiful things in the world cannot be seen or even touched - they must be felt with the heart.", author: "Helen Keller" },
    { text: "Try to be a rainbow in someone else's cloud.", author: "Maya Angelou" }
];

// PandoraReads — 闪卡复习
export class FlashcardView extends ItemView {
    private plugin: LanguageMadeEasyPlugin;
    private queue: VocabularyEntry[] = [];
    private current: VocabularyEntry | null = null;
    private phase: ReviewPhase = 'front';
    private todayReviewedCount = 0;
    private todayCorrectCount = 0;
    private petSnapshot: PetSnapshot | null = null;
    private totalVocabCount = 0;
    private todayDueCount = 0;
    // 关闭 ts-fsrs 默认的 Anki 学习步进 [1m,10m]：本项目每卡每日仅复习一次，
    // 而步进所依赖的 learning_steps 计数器未持久化(见 FSRSData)，会导致评 Good 只把
    // due 推 10 分钟、卡片永远卡在 Learning，第二天必然再次到期。置空步进后 New 卡
    // 评 Good 直接毕业到 Review 走正常间隔(Good≈2天 / Again≈1天)，历史卡下次复习即自愈。
    private f = fsrs(generatorParameters({ learning_steps: [], relearning_steps: [] }));
    private randomQuote: { text: string; author: string } = (QUOTES[Math.floor(Math.random() * QUOTES.length)] || QUOTES[0]);
    private heatmapData: Map<string, number> = new Map();
    private currentVocabSize: number = 0;
    private vocabSizeCefrLevel: string = '';
    private vocabSizeCefrDesc: string = '';
    private hasVocabTest: boolean = false;
    private vocabHistory: { testTime: number; estimatedSize: number }[] = [];

    constructor(leaf: WorkspaceLeaf, plugin: LanguageMadeEasyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return FLASHCARD_VIEW_TYPE; }
    getDisplayText(): string { return t('flashcard.viewTitle'); }
    getIcon(): string { return 'brain'; }

    async onOpen(): Promise<void> {
        await this.loadData();
        this.buildUI();
    }

    async onClose(): Promise<void> { }
// Insert after onOpen method
    async render() {
        await this.loadData();
        this.buildUI();
    }

    /**
     * Append a newly added card to the review queue without disrupting
     * the current review session. If the user has finished all cards
     * (current is null), trigger a full render to show the new card.
     */
    async enqueueNewCard(entry: VocabularyEntry): Promise<void> {
        if (this.current) {
            // User is reviewing — append to queue, update stats only
            this.queue.push(entry);
            this.totalVocabCount += 1;
            this.todayDueCount += 1;
            this.updateStatsDisplay();
        } else {
            // No card in progress — full refresh to show the new card
            await this.loadData();
            this.buildUI();
        }
    }

    private updateStatsDisplay(): void {
        const statsEl = this.contentEl.querySelector('.lme-stats-dashboard-borderless');
        if (!statsEl) return;
        const values = statsEl.querySelectorAll('.lme-stat-value-simple');
        const newData = [
            this.todayDueCount.toString(),
            this.todayReviewedCount.toString(),
            this.totalVocabCount.toString(),
        ];
        values.forEach((el, i) => {
            if (newData[i] !== undefined) el.textContent = newData[i];
        });
    }

    private getSessionDueCount(): number {
        return this.queue.length + (this.current ? 1 : 0);
    }

    private getReviewSessionDayKey(date: Date = new Date()): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    private getReviewSessionStorageKey(language: string): string {
        const vaultName = this.app.vault.getName() || 'default';
        return `lme.flashcardReviewSession:${vaultName}:${language}:${this.getReviewSessionDayKey()}`;
    }

    private loadLocalReviewedIds(language: string): Set<string> {
        try {
            const raw = window.localStorage.getItem(this.getReviewSessionStorageKey(language));
            const ids = raw ? JSON.parse(raw) : [];
            return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
        } catch {
            return new Set();
        }
    }

    private saveLocalReviewedId(language: string, vocabId: string): void {
        try {
            const ids = this.loadLocalReviewedIds(language);
            ids.add(vocabId);
            window.localStorage.setItem(this.getReviewSessionStorageKey(language), JSON.stringify([...ids]));
        } catch {
            // Local backup only. IndexedDB review logs remain the source of truth.
        }
    }

    private async loadExtraCards(count: number): Promise<void> {
        const currentLanguage = this.plugin.settings.activeLanguage || 'english';
        const localReviewedIds = this.loadLocalReviewedIds(currentLanguage);
        this.queue = await db.getDailySessionVocabulary(currentLanguage, count, localReviewedIds);
        this.todayDueCount = this.queue.length;
        this.current = this.queue.shift() ?? null;
        if (!this.current) {
            new Notice(t('flashcard.noMoreDueCards'));
        }
        this.buildUI();
    }

    private async loadData(): Promise<void> {
        const currentLanguage = this.plugin.settings.activeLanguage || 'english';
        const dailyLimit = this.plugin.settings.dailyReviewLimit || 9999;

        this.totalVocabCount = await db.getVocabularyCount(currentLanguage); // 统计当前语言的生词数
        const localReviewedIds = this.loadLocalReviewedIds(currentLanguage);
        const dbReviewedIds = await db.getTodayReviewedVocabIds(currentLanguage);
        const reviewedIds = new Set([...dbReviewedIds, ...localReviewedIds]);
        this.todayReviewedCount = Math.max(await db.getTodayReviewCount(currentLanguage), reviewedIds.size);
        const remainingLimit = Math.max(0, dailyLimit - this.todayReviewedCount);
        this.queue = remainingLimit > 0
            ? await db.getDailySessionVocabulary(currentLanguage, remainingLimit, reviewedIds)
            : [];
        this.todayDueCount = this.queue.length;
        this.current = this.queue.shift() ?? null;

        // Load Heatmap Data (from current year, filtered by language)
        const logs = await db.getReviewLogsByLanguage(currentLanguage);
        const currentYear = new Date().getFullYear();
        const startOfTodayMs = new Date().setHours(0, 0, 0, 0);
        this.heatmapData.clear();
        this.todayCorrectCount = 0;
        logs.forEach(log => {
            const d = new Date(log.reviewTime);
            if (d.getFullYear() === currentYear) {
                const dayKey = this.formatDate(d);
                this.heatmapData.set(dayKey, (this.heatmapData.get(dayKey) || 0) + 1);
            }
            if (log.reviewTime >= startOfTodayMs && (log.rating ?? 0) >= 3) {
                this.todayCorrectCount++;
            }
        });

        // Pet snapshot for the embedded panel (updated on each grade)
        this.petSnapshot = await petService.getSnapshot(currentLanguage, { count: this.todayReviewedCount, correct: this.todayCorrectCount });

        // Load vocab size data
        this.hasVocabTest = await vocabSizeService.hasCompletedTest(currentLanguage);
        if (this.hasVocabTest) {
            this.currentVocabSize = await vocabSizeService.getCurrentSize(currentLanguage);
            this.vocabSizeCefrLevel = vocabSizeService.getCEFRLevel(this.currentVocabSize);
            this.vocabSizeCefrDesc = vocabSizeService.getCEFRDescription(this.vocabSizeCefrLevel);
        }

        // Load vocab history for trend chart
        const history = await db.getVocabSizeHistory(currentLanguage, 10);
        this.vocabHistory = history.map(h => ({ testTime: h.testTime, estimatedSize: h.estimatedSize }));

        // Show first-time reminder
        if (!this.plugin.settings.vocabTestReminderShown && !this.hasVocabTest) {
            this.plugin.settings.vocabTestReminderShown = true;
            await this.plugin.saveSettings();
            const available = await vocabSizeService.ensureTestAvailable(currentLanguage);
            if (available) {
                new Notice(t('flashcard.testVocabPrompt'), 8000);
            }
        }
    }

    private formatDate(date: Date): string {
        return date.toISOString().split('T')[0];
    }

    private buildUI(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lme-flashcard-view');

        const bg = contentEl.createDiv('lme-aurora-bg');
        for (let i = 0; i < 3; i++) bg.createDiv(`lme-aurora-blob lme-aurora-blob-${i + 1}`);

        this.renderVocabSizeCard(contentEl);
        this.renderBanner(contentEl);
        this.renderStats(contentEl);

        const cardArea = contentEl.createDiv('lme-card-area');

        if (!this.current) {
            this.renderFinished(cardArea);
        } else {
            this.renderCard(cardArea);
            this.renderModeSwitcher(cardArea);
        }

        // Add "Add Flashcard" button below card area
        this.renderAddFlashcardButton(contentEl);

        this.renderPet(contentEl);
    }

    /** Compact embedded pet panel (sits under the card area). */
    private renderPet(parent: HTMLElement): void {
        const panel = parent.createDiv('lme-pet-embedded');

        if (this.plugin.settings.petEnabled && this.petSnapshot) {
            const s = this.petSnapshot;

            const stage = panel.createDiv('lme-pet-stage');
            const emoji = stage.createDiv({ cls: 'lme-pet-emoji', text: s.formEmoji });
            if (s.isSleeping) emoji.addClass('is-sleeping');
            else if (s.metDailyGoal) emoji.addClass('met-goal');
            else emoji.addClass('idle');

            const nameLine = panel.createDiv('lme-pet-form-name');
            nameLine.createSpan({ text: t(s.formNameKey) });
            nameLine.createSpan({ cls: 'lme-pet-level', text: ' · ' + t('pet.levelLabel', { level: s.level }) });

            panel.createDiv({ cls: 'lme-pet-status-line', text: t(s.energyLabelKey) + ' · ' + s.moodEmoji + ' ' + t(s.moodLabelKey) });

            const expBar = panel.createDiv('lme-pet-exp-bar');
            const expLabel = expBar.createDiv('lme-pet-exp-label');
            expLabel.createSpan({ text: t('pet.expBarLabel') });
            expLabel.createSpan({ cls: 'lme-pet-exp-num', text: `${s.expIntoLevel}/${s.expForNext}` });
            const track = expBar.createDiv('lme-pet-exp-track');
            track.createDiv('lme-pet-exp-fill').style.width = `${s.progressPct}%`;

            const row = panel.createDiv('lme-pet-stats-row');
            this.petStatCell(row, 'flame', t('pet.streakLabel', { n: s.currentStreak }));
            this.petStatCell(row, 'calendar-check', t('pet.todayReviews', { n: s.todayReviewed }));
            this.petStatCell(row, 'target', t('pet.totalReviews', { n: s.totalReviews }));
        }

        const footprint = panel.createDiv('lme-pet-footprint');
        footprint.createEl('h4', { text: t('pet.footprintTitle') });
        renderHeatmap(footprint, this.heatmapData, { activityLabelKey: 'pet.footprintTitle' });
    }

    private petStatCell(row: HTMLElement, icon: string, text: string): void {
        const cell = row.createDiv('lme-pet-stat');
        setIcon(cell.createDiv('lme-pet-stat-icon'), icon);
        cell.createSpan({ cls: 'lme-pet-stat-text', text });
    }

    /** One-shot egg-hatch flourish on the embedded pet. */
    private playHatch(formNameKey: string): void {
        const stage = this.contentEl.querySelector('.lme-pet-stage') as HTMLElement | null;
        if (stage) {
            stage.addClass('is-evolving');
            window.setTimeout(() => stage.removeClass('is-evolving'), 1200);
        }
        const name = formNameKey ? t(formNameKey) : '';
        new Notice(t('pet.hatchNotice', { name }));
    }

    private renderAddFlashcardButton(parent: HTMLElement): void {
        const btnContainer = parent.createDiv('lme-add-flashcard-wrapper');

        // 方案：优雅的图标+文字按钮，低调不显眼
        const addBtn = btnContainer.createEl('button', {
            cls: 'lme-add-flashcard-subtle'
        });

        // 添加加号图标
        const iconSpan = addBtn.createSpan('lme-add-flashcard-icon');
        setIcon(iconSpan, 'plus');

        // 添加文字
        const textSpan = addBtn.createSpan('lme-add-flashcard-text');
        textSpan.setText(t('flashcard.addCard'));

        addBtn.onclick = () => {
            new AddFlashcardModal(this.app, this.plugin).open();
        };
    }

    private renderBanner(parent: HTMLElement): void {
        const banner = parent.createDiv('lme-quote-banner');
        banner.createEl('p', { cls: 'lme-quote-text', text: `"${this.randomQuote.text}"` });
        banner.createSpan({ cls: 'lme-quote-author', text: `— ${this.randomQuote.author}` });
    }

    private renderStats(parent: HTMLElement): void {
        const dash = parent.createDiv('lme-stats-dashboard-borderless');
        const stats = [
            { label: t('flashcard.dueToday'), value: this.todayDueCount.toString() },
            { label: t('flashcard.reviewedToday'), value: this.todayReviewedCount.toString() },
            { label: t('flashcard.totalWords'), value: this.totalVocabCount.toString() },
        ];
        stats.forEach(s => {
            const item = dash.createDiv('lme-stat-item-simple');
            item.createDiv({ cls: 'lme-stat-value-simple', text: s.value });
            item.createDiv({ cls: 'lme-stat-label-simple', text: s.label });
        });
    }

    private renderCard(parent: HTMLElement): void {
        parent.empty();
        const entry = this.current!;
        const ctx: ModeContext = {
            entry,
            language: this.plugin.settings.activeLanguage || 'english',
            component: this,
            onGrade: (r) => { this.grade(r); },
            onFlip: () => playPageTurnSound(),
        };
        flipMode.render(parent, ctx);
    }

    private getStudyMode(): StudyMode {
        // 社区免费版:仅翻卡模式;旧 settings 存有 audio/write 时回退 flip。
        return 'flip';
    }

    /** 顶部学习模式切换条:翻卡保留;听力/填空为完整版功能,点击弹付费引导。 */
    private renderModeSwitcher(parent: HTMLElement): void {
        const bar = parent.createDiv('lme-mode-switcher');
        const current = this.getStudyMode();
        const modes: Array<{ key: StudyMode | 'audio' | 'write'; icon: string; labelKey: string }> = [
            { key: 'flip', icon: 'repeat', labelKey: 'flashcard.studyMode.flip' },
            { key: 'audio', icon: 'headphones', labelKey: 'flashcard.studyMode.audio' },
            { key: 'write', icon: 'pencil', labelKey: 'flashcard.studyMode.write' },
        ];
        modes.forEach(({ key, icon, labelKey }) => {
            const btn = bar.createEl('button', {
                cls: `lme-mode-tab${key === current ? ' is-active' : ''}`,
                attr: { 'data-mode': key, 'aria-label': t(labelKey) },
            });
            setIcon(btn.createSpan('lme-mode-tab-icon'), icon);
            btn.createSpan({ cls: 'lme-mode-tab-label', text: t(labelKey) });
            btn.onclick = () => {
                if (key === 'flip') { void this.setStudyMode('flip'); return; }
                // 社区免费版:听力/填空模式弹付费引导
                new UpgradeModal(this.app, t(labelKey)).open();
            };
        });
    }

    private async setStudyMode(mode: StudyMode): Promise<void> {
        this.plugin.settings.flashcardStudyMode = mode;
        await this.plugin.saveSettings();
        this.buildUI();
    }

    private renderFinished(parent: HTMLElement): void {
        parent.empty();
        const msg = parent.createDiv('lme-done-message');
        msg.createDiv({ cls: 'lme-done-emoji', text: '🎉' });
        msg.createEl('h2', { text: t('flashcard.dailyDone') });
        msg.createEl('p', { text: t('flashcard.dailyDoneDesc', { count: this.todayReviewedCount }) });
        const refillBtn = msg.createEl('button', {
            cls: 'lme-refill-review-btn',
            text: t('flashcard.reviewMore10'),
        });
        refillBtn.onclick = async () => {
            refillBtn.disabled = true;
            await this.loadExtraCards(10);
        };
    }

    private renderVocabSizeCard(parent: HTMLElement): void {
        const card = parent.createDiv('lme-vocab-marquee');

        if (!this.hasVocabTest) {
            card.addClass('lme-vocab-marquee-untested');
            const marqueeInner = card.createDiv('lme-vocab-marquee-inner');
            marqueeInner.createSpan({ cls: 'lme-vocab-marquee-prompt-icon', text: '\u{1F4CA}' });
            marqueeInner.createSpan({ cls: 'lme-vocab-marquee-prompt-text', text: '\u{1F50D} ' + t('flashcard.clickToTest') });
            const testBtn = marqueeInner.createEl('button', {
                cls: 'lme-vocab-marquee-test-btn',
                text: t('flashcard.testVocab'),
            });
            testBtn.onclick = () => {
                new VocabTestModal(this.app, this.plugin).open();
            };
            return;
        }

        card.addClass('lme-vocab-marquee-tested');
        const marqueeInner = card.createDiv('lme-vocab-marquee-inner');

        // Level tags (stacked, left side)
        const tagArea = marqueeInner.createDiv('lme-vocab-marquee-tags');
        const benchmark = vocabSizeService.getBenchmarkLabel(this.currentVocabSize);
        tagArea.createDiv('lme-vocab-marquee-tag-level').setText(benchmark.label);
        tagArea.createDiv(`lme-vocab-marquee-tag-cefr lme-vocab-marquee-tag-cefr-${this.vocabSizeCefrLevel.toLowerCase()}`).setText(t('flashcard.cefrLevel', { level: this.vocabSizeCefrLevel }));

        // Number section: label on top-left + big number
        const numberArea = marqueeInner.createDiv('lme-vocab-marquee-number-area');
        numberArea.createDiv('lme-vocab-marquee-number-label').setText(t('flashcard.yourVocab'));
        numberArea.createDiv('lme-vocab-marquee-number').setText(this.currentVocabSize.toLocaleString());

        // Test button
        const testBtn = marqueeInner.createEl('button', { cls: 'lme-vocab-marquee-test-btn' });
        testBtn.setText(t('flashcard.testVocab'));
        testBtn.onclick = () => {
            new VocabTestModal(this.app, this.plugin).open();
        };
    }

    /**
     * 对一张卡执行 FSRS 调度更新（repeat → 写 fsrsData/reviewLog → 掌握度检测 + 当日去重）。
     * 纯数据层，无 UI/计数/宠物副作用。grade() 与 Match 的 matchMarkReviewed 共用。
     */
    private async gradeCardFsrs(entry: VocabularyEntry, rating: Rating, now: Date): Promise<void> {
        const card: unknown = {
            due: new Date(entry.fsrsData.due),
            stability: entry.fsrsData.stability,
            difficulty: entry.fsrsData.difficulty,
            elapsed_days: entry.fsrsData.elapsed_days,
            scheduled_days: entry.fsrsData.scheduled_days,
            reps: entry.fsrsData.reps,
            lapses: entry.fsrsData.lapses,
            state: entry.fsrsData.state,
            last_review: entry.fsrsData.last_review ? new Date(entry.fsrsData.last_review) : undefined,
        };

        const recordLog: unknown = this.f.repeat(card as Card, now);
        const nextCard = recordLog[rating].card;

        await db.updateVocabulary(entry.id, {
            fsrsData: {
                due: nextCard.due.getTime(),
                stability: nextCard.stability,
                difficulty: nextCard.difficulty,
                elapsed_days: nextCard.elapsed_days,
                scheduled_days: nextCard.scheduled_days,
                reps: nextCard.reps,
                lapses: nextCard.lapses,
                state: nextCard.state as number,
                last_review: now.getTime(),
            },
        });

        await db.addReviewLog({
            logId: randomUUID(),
            vocabId: entry.id,
            reviewTime: now.getTime(),
            rating: rating as 1 | 2 | 3 | 4,
            scheduledDays: recordLog[rating].log.scheduled_days,
            stateBefore: card.state as number,
            language: this.plugin.settings.activeLanguage || 'english',
        });

        // Sync mastered status + 当日去重
        const lang = this.plugin.settings.activeLanguage || 'english';
        this.saveLocalReviewedId(lang, entry.id);
        const isNowMastered = await db.isMastered(entry.id, lang);
        if (isNowMastered) {
            await db.markAsMastered(entry.id);
        } else {
            await db.updateVocabulary(entry.id, { masteredAt: undefined });
        }
    }

    private async grade(rating: Rating): Promise<void> {
        const entry = this.current!;
        const now = new Date();
        await this.gradeCardFsrs(entry, rating, now);

        this.todayReviewedCount++;
        if (rating >= Rating.Good) this.todayCorrectCount++;
        this.phase = 'front';
        this.current = this.queue.shift() ?? null;
        this.todayDueCount = this.getSessionDueCount();

        // Refresh Heatmap Data
        const dayKey = this.formatDate(now);
        this.heatmapData.set(dayKey, (this.heatmapData.get(dayKey) || 0) + 1);

        // Update vocab size only when rating is Easy (mastered)
        let vocabSizeIncreased = false;
        if (this.hasVocabTest && rating === Rating.Easy) {
            const lang = this.plugin.settings.activeLanguage || 'english';
            const newSize = await vocabSizeService.recordLearnedWord(lang, entry.id, rating);
            if (newSize !== this.currentVocabSize) {
                vocabSizeIncreased = true;
            }
            this.currentVocabSize = newSize;
            this.vocabSizeCefrLevel = vocabSizeService.getCEFRLevel(newSize);
            this.vocabSizeCefrDesc = vocabSizeService.getCEFRDescription(this.vocabSizeCefrLevel);
        }

        // Pet: reward this review BEFORE re-render so the embedded panel reflects it
        let petFx: unknown = null;
        try {
            const lang = this.plugin.settings.activeLanguage || 'english';
            const petResult = await petService.gainExp(rating, lang, {
                count: this.todayReviewedCount,
                correct: this.todayCorrectCount,
            });
            this.petSnapshot = petResult.snapshot;
            petFx = petResult;
        } catch (e) {
            console.error('[LME] pet gainExp failed:', e);
        }

        this.buildUI();

        if (vocabSizeIncreased) {
            this.showFloatPlusOne();
        }

        if (petFx) {
            if (petFx.hatched) {
                this.playHatch(petFx.snapshot.formNameKey);
            } else if (petFx.leveledUp) {
                new Notice(t('pet.levelUpNotice', { level: petFx.newLevel }));
            }
            if (petFx.milestoneHit != null) {
                new Notice(t('pet.milestoneTitle', { days: petFx.milestoneHit, exp: petFx.bonusExp }));
            }
        }
    }

    private showFloatPlusOne(): void {
        const numberEl = this.containerEl.querySelector('.lme-vocab-marquee-number');
        if (!numberEl) return;
        const floater = numberEl.createSpan({ cls: 'lme-float-plus-one', text: '+1' });
        floater.addEventListener('animationend', () => floater.detach());
    }
}

// ============================================================
// Add Flashcard Modal
// ============================================================

export class AddFlashcardModal extends Modal {
    private plugin: LanguageMadeEasyPlugin;
    private wordInput: HTMLInputElement;
    private phoneticInput: HTMLInputElement;
    private definitionInput: HTMLTextAreaElement;
    private contextInput: HTMLTextAreaElement;

    constructor(app: App, plugin: LanguageMadeEasyPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lme-add-flashcard-modal');

        contentEl.createEl('h2', { text: t('flashcard.addTitle') });

        // Word input
        new Setting(contentEl)
            .setName(t('flashcard.wordLabel'))
            .setDesc(t('flashcard.wordRequired'))
            .addText(text => {
                this.wordInput = text.inputEl;
                text.setPlaceholder(t('flashcard.wordPlaceholder'));
                text.inputEl.style.width = '100%';
            });

        // AI auto-fill button
        const aiBtnContainer = contentEl.createDiv();
        aiBtnContainer.style.cssText = 'display:flex;align-items:center;gap:10px;margin:-8px 0 8px 0;padding:0 0 0 0;';
        const aiFillBtn = aiBtnContainer.createEl('button', {
            cls: 'lme-ai-autofill-btn',
            text: t('flashcard.aiFill')
        });
        aiFillBtn.style.cssText = 'padding:6px 16px;border-radius:20px;font-size:0.85em;cursor:pointer;transition:all 0.25s ease;border:1px solid rgba(255,255,255,0.18);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);';
        const aiHint = aiBtnContainer.createSpan({ text: t('flashcard.aiFillHint') });
        aiHint.style.cssText = 'font-size:0.8em;color:var(--text-muted);';
        const aiSpinner = aiBtnContainer.createSpan({ text: '' });
        aiSpinner.style.cssText = 'display:none;font-size:0.85em;color:var(--text-muted);';

        aiFillBtn.onclick = () => this.aiAutoFill(aiFillBtn, aiSpinner);

        // Phonetic input
        new Setting(contentEl)
            .setName(t('flashcard.phoneticLabel'))
            .setDesc(t('flashcard.phoneticOptional'))
            .addText(text => {
                this.phoneticInput = text.inputEl;
                text.setPlaceholder(t('flashcard.phoneticPlaceholder'));
                text.inputEl.style.width = '100%';
            });

        // Definition input
        new Setting(contentEl)
            .setName(t('flashcard.definitionLabel'))
            .setDesc(t('flashcard.definitionRequired'))
            .addTextArea(text => {
                this.definitionInput = text.inputEl;
                text.setPlaceholder(t('flashcard.definitionPlaceholder'));
                text.inputEl.style.width = '100%';
                text.inputEl.rows = 4;
            });

        // Context input
        new Setting(contentEl)
            .setName(t('flashcard.exampleLabel'))
            .setDesc(t('flashcard.exampleOptional'))
            .addTextArea(text => {
                this.contextInput = text.inputEl;
                text.setPlaceholder(t('flashcard.examplePlaceholder'));
                text.inputEl.style.width = '100%';
                text.inputEl.rows = 3;
            });

        // Audio preview button
        const audioContainer = contentEl.createDiv('lme-audio-preview');
        const playAudioBtn = audioContainer.createEl('button', {
            cls: 'lme-play-audio-btn',
            text: t('flashcard.playAudioBtn')
        });
        playAudioBtn.onclick = () => {
            const word = this.wordInput.value.trim();
            if (word) {
                const currentLanguage = this.plugin.settings.activeLanguage || 'english';
                playAudio(word, currentLanguage).catch(e => console.error('[EME] Audio preview failed:', e));
            } else {
                new Notice(t('flashcard.enterWord'));
            }
        };

        // Buttons
        const buttonContainer = contentEl.createDiv('lme-modal-buttons');
        buttonContainer.style.marginTop = '20px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.justifyContent = 'flex-end';

        const cancelBtn = buttonContainer.createEl('button', {
            text: t('common.cancel')
        });
        cancelBtn.onclick = () => this.close();

        const saveBtn = buttonContainer.createEl('button', {
            cls: 'mod-cta',
            text: t('common.save')
        });
        saveBtn.onclick = () => this.saveFlashcard();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }

    private async aiAutoFill(btn: HTMLButtonElement, spinner: HTMLSpanElement): Promise<void> {
        const word = this.wordInput.value.trim();
        if (!word) {
            new Notice(t('flashcard.enterWordShort'));
            return;
        }

        const settings = this.plugin.settings;
        const ai = AIService.resolveProvider(settings, 'flashcardFill');

        if (!ai.apiKey) {
            new Notice(t('flashcard.noApiKey'));
            return;
        }

        btn.disabled = true;
        btn.setText(t('flashcard.aiQuerying'));
        spinner.style.display = 'inline';
        spinner.setText(' ...');

        try {
            const language = settings.activeLanguage || 'english';
            const result = await AIService.lookupWord(
                word,
                language,
                ai.provider,
                ai.apiKey,
                ai.model,
                settings.aiProviders
            );

            if (result.phonetic) {
                this.phoneticInput.value = result.phonetic;
            }
            if (result.definition) {
                this.definitionInput.value = result.definition;
            }
            if (result.example) {
                this.contextInput.value = result.example;
            }

            new Notice(t('flashcard.aiDone'));
        } catch (err: unknown) {
            console.error('[EME] AI auto-fill failed:', err);
            new Notice(t('flashcard.aiFailed', { error: err.message || t('common.unknownError') }));
        } finally {
            btn.disabled = false;
            btn.setText(t('flashcard.aiFill'));
            spinner.style.display = 'none';
        }
    }

    private async saveFlashcard(): Promise<void> {
        const word = this.wordInput.value.trim();
        const phonetic = this.phoneticInput.value.trim();
        const definition = this.definitionInput.value.trim();
        const context = this.contextInput.value.trim();

        // Validation
        if (!word) {
            new Notice(t('flashcard.enterWord'));
            return;
        }

        if (!definition) {
            new Notice(t('flashcard.enterDefinition'));
            return;
        }

        try {
            const currentLanguage = this.plugin.settings.activeLanguage || 'english';
            const normalizedWord = word.toLowerCase();
            const now = Date.now();

            // Check if word already exists in this language
            const existing = await db.getVocabularyByWord(normalizedWord, currentLanguage);

            if (existing) {
                // Update existing entry, preserve FSRS progress
                await db.updateVocabulary(existing.id, {
                    phonetic: phonetic || undefined,
                    definition: definition,
                    contextSnippet: context || '',
                });
                new Notice(t('flashcard.cardUpdated', { word }));
            } else {
                // 社区免费版:新建卡前校验闪卡总配额(触顶弹引导)
                if (!(await assertFlashcardQuota(this.app))) return;
                // Create new entry
                const newEntry: VocabularyEntry = {
                    id: randomUUID(),
                    word: normalizedWord,
                    phonetic: phonetic || undefined,
                    definition: definition,
                    partOfSpeech: undefined,
                    contextSnippet: context || '',
                    sourceNotePath: 'custom-flashcard',
                    addedTime: now,
                    fsrsData: {
                        due: now,
                        stability: 0,
                        difficulty: 0,
                        elapsed_days: 0,
                        scheduled_days: 0,
                        reps: 0,
                        lapses: 0,
                        state: 0,
                        last_review: undefined
                    }
                };
                await db.addVocabulary(newEntry, currentLanguage);
                new Notice(t('flashcard.cardAdded', { word }));
            }

            // Sync to Markdown vocabulary notebook (same logic as dict-view addToVocab)
            try {
                const vocabFolderKey = currentLanguage + 'VocabNoteFolder' as keyof typeof this.plugin.settings;
                const vocabFileNameKey = currentLanguage + 'VocabNoteFileName' as keyof typeof this.plugin.settings;
                const folder = (this.plugin.settings[vocabFolderKey] as string) || '';
                const fileName = (this.plugin.settings[vocabFileNameKey] as string) || (currentLanguage + ' Vocabulary');
                const path = fileName + '.md';
                const fullPath = folder ? folder + '/' + path : path;
                const file = this.app.vault.getAbstractFileByPath(fullPath);

                const dateStr = new Date().toLocaleDateString('zh-CN');
                const cardContent = '> [!lme-vocab]+ **' + normalizedWord + '** ' + (phonetic ? '*[' + phonetic + ']* ' : '') + '<span class="lme-tag-new">' + t('common.newTag') + '</span>\n'
                    + '> \n'
                    + '> ' + t('vocabNote.definition') + ': ' + definition.replace(/\n/g, ' ') + '\n'
                    + '> ' + t('vocabNote.example') + ': ' + (context || t('vocabNote.noExample')) + '\n'
                    + '> ' + t('vocabNote.source') + ': custom-flashcard | ' + t('vocabNote.date') + ': ' + dateStr + '\n\n';

                if (file) {
                    const content = await this.app.vault.read(file as unknown);
                    await this.app.vault.modify(file as unknown, content + (content.endsWith('\n') ? '' : '\n') + cardContent);
                } else {
                    const header = t('vocabNote.header');
                    await this.app.vault.create(fullPath, header + cardContent);
                }
            } catch (syncErr) {
                // Markdown sync failure should not block the main save flow
                console.error('[EME] Vocab notebook sync failed:', syncErr);
            }

            this.close();

            // Refresh the flashcard view if it's open
            const flashcardLeaf = this.app.workspace.getLeavesOfType('lme-flashcard-view')[0];
            if (flashcardLeaf) {
                const view = flashcardLeaf.view as unknown;
                if (existing) {
                    await view.render();
                } else {
                    await view.enqueueNewCard(newEntry);
                }
            }
        } catch (error) {
            console.error('[EME] Failed to save flashcard:', error);
            new Notice(t('flashcard.saveFailed', { error: error.message || t('common.unknownError') }));
        }
    }
}
