// @ts-nocheck
// ============================================================
// English Made Easy - Guided Shadowing Practice Module
// ============================================================
// State machine: idle -> playingOriginal -> countdown -> recording -> comparing
// Provides dual-waveform comparison UI and alternate playback.
// ============================================================

import { Notice, setIcon } from 'obsidian';
import { t } from '../i18n';
import type { TimestampBlock, PronunciationScore } from '../../models';

// ── Public Types ──

export type PracticeState =
    | 'idle'
    | 'playingOriginal'
    | 'countdown'
    | 'recording'
    | 'comparing';

export interface PracticeCallbacks {
    seekTo: (seconds: number) => Promise<void>;
    pauseMedia: () => void;
    playMedia: () => void;
    getMediaCurrentTime: () => number;
    getCurrentMedia: () => HTMLVideoElement | HTMLAudioElement | null;
    getYtPlayer: () => any;
    getMediaType: () => 'video' | 'audio' | 'youtube' | null;
    getCurrentMediaSrc: () => string | null;
    startRecordingForPractice: () => Promise<boolean>;
    stopRecording: () => void;
    getRecordedBlob: () => Blob | null;
    extractOriginalAudioBuffer: (startSec: number, endSec: number) => Promise<Float32Array | null>;
    refreshRecorderPanel: () => void;
    scoreRecording: (blob: Blob, originalText: string) => Promise<PronunciationScore | null>;
    startWaveformOnCanvas: (canvas: HTMLCanvasElement) => void;
    stopWaveform: () => void;
}

// ── Internal: Alternate playback phase ──
type AlternatePhase = 'idle' | 'playingUser' | 'gap' | 'playingOriginal';

// ── Main Class ──

export class ShadowingPractice {
    private state: PracticeState = 'idle';
    private practiceBlock: TimestampBlock | null = null;
    private callbacks: PracticeCallbacks;

    // Countdown
    private countdownValue = 3;
    private countdownTimer: number | null = null;

    // Auto-stop recording
    private autoStopTimer: number | null = null;

    // Polling for original segment end detection
    private originalPollTimer: number | null = null;

    // Recording duration tracking
    private recordingStartTime = 0;
    private recordingMaxDuration = 0;

    // Cached waveform data
    private originalWaveformData: Float32Array | null = null;
    private recordedWaveformData: Float32Array | null = null;

    // Dual waveform canvases
    private originalCanvas: HTMLCanvasElement | null = null;
    private userCanvas: HTMLCanvasElement | null = null;

    // Playback state
    private alternatePhase: AlternatePhase = 'idle';
    private isPlayingOriginal = false;
    private isPlayingUser = false;
    private userPlaybackAudio: HTMLAudioElement | null = null;
    private userPlaybackUrl: string | null = null;

    // Generation counter to cancel stale rAF loops and async flows
    private generation = 0;

    // Cached decoded audio buffer (avoids re-decoding the entire media file)
    private cachedAudioBuffer: AudioBuffer | null = null;
    private cachedAudioBufferSrc: string | null = null;

    // Scoring state
    private scoringState: 'idle' | 'loading' | 'done' | 'error' = 'idle';
    private scoringResult: PronunciationScore | null = null;
    private scoringError: string = '';

    // Waveform canvas for recording state
    private recordingWaveformCanvas: HTMLCanvasElement | null = null;

    constructor(callbacks: PracticeCallbacks) {
        this.callbacks = callbacks;
    }

    // ── Public API ──

    getState(): PracticeState {
        return this.state;
    }

    isActive(): boolean {
        return this.state !== 'idle';
    }

    getBlock(): TimestampBlock | null {
        return this.practiceBlock;
    }

    startPractice(block: TimestampBlock): void {
        this.cleanup();
        this.practiceBlock = block;
        this.enterPlayingOriginal();
    }

    onRecordingComplete(): void {
        if (this.state !== 'recording') return;
        this.stopAutoStopTimer();
        this.callbacks.stopWaveform();

        // Extract waveform from user's recording
        const blob = this.callbacks.getRecordedBlob();
        if (blob) {
            this.extractWaveformFromBlob(blob).then(data => {
                this.recordedWaveformData = data;
                if (this.state === 'comparing') {
                    this.renderUserWaveform();
                }
            });
        }

        this.state = 'comparing';
        this.callbacks.refreshRecorderPanel();

        // Also try to extract original waveform if not yet done
        if (!this.originalWaveformData && this.practiceBlock) {
            this.callbacks.extractOriginalAudioBuffer(
                this.practiceBlock.startSec,
                this.practiceBlock.endSec
            ).then(data => {
                if (data) {
                    this.originalWaveformData = data;
                    // Re-render to show the waveform if still in comparing state
                    if (this.state === 'comparing') {
                        this.callbacks.refreshRecorderPanel();
                    }
                }
            }).catch((err) => {
                console.warn('[EME] Original waveform extraction failed:', err);
            });
        }
    }

    onTimeUpdate(currentTime: number): void {
        if (this.state === 'playingOriginal' && this.practiceBlock) {
            if (currentTime >= this.practiceBlock.endSec) {
                this.callbacks.pauseMedia();
                // Also try to pause YouTube
                const ytPlayer = this.callbacks.getYtPlayer();
                if (ytPlayer && ytPlayer.pauseVideo) {
                    ytPlayer.pauseVideo();
                }
                this.stopOriginalPoll();
                this.enterCountdown();
            }
        }
    }

    cleanup(): void {
        this.generation++; // Cancel all stale rAF loops and async flows
        this.stopOriginalPoll();
        this.stopCountdownTimer();
        this.stopAutoStopTimer();
        this.stopAllPlayback();
        this.state = 'idle';
        this.practiceBlock = null;
        this.originalWaveformData = null;
        this.recordedWaveformData = null;
        this.originalCanvas = null;
        this.userCanvas = null;
        this.alternatePhase = 'idle';
        this.scoringState = 'idle';
        this.scoringResult = null;
        this.scoringError = '';
    }

    // ── UI Rendering ──

    renderPanel(): HTMLElement {
        const panel = document.createElement('div');
        panel.className = 'lme-recorder-panel';

        switch (this.state) {
            case 'playingOriginal':
                panel.addClass('is-comparing');
                this.renderPlayingOriginalUI(panel);
                break;
            case 'countdown':
                panel.addClass('is-comparing');
                this.renderCountdownUI(panel);
                break;
            case 'recording':
                panel.addClass('is-comparing');
                this.renderRecordingUI(panel);
                break;
            case 'comparing':
                panel.addClass('is-comparing');
                this.renderComparingUI(panel);
                break;
            default:
                break;
        }

        return panel;
    }

    // ── State: playingOriginal ──

    private renderPlayingOriginalUI(panel: HTMLElement): void {
        // Header row: LED + close button
        const header = panel.createDiv('lme-practice-header');
        const led = header.createDiv('lme-recorder-led');
        led.style.marginBottom = '0';
        const dot = led.createSpan({ cls: 'lme-recorder-dot is-recording' });
        const status = led.createSpan({
            text: t('shadowing.practicePlayingOriginal'),
            cls: 'lme-recorder-status-text'
        });

        const actions = header.createDiv('lme-practice-header-actions');
        const closeBtn = actions.createEl('button', {
            cls: 'lme-practice-header-btn',
            attr: { 'aria-label': t('shadowing.practiceClose') }
        });
        setIcon(closeBtn, 'x');
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this.resetToIdle();
        };

        // Subtitle text preview
        if (this.practiceBlock) {
            const preview = panel.createDiv({
                cls: 'lme-practice-countdown-hint'
            });
            preview.style.textAlign = 'center';
            preview.style.marginTop = '8px';
            preview.style.color = 'rgba(255,255,255,0.7)';
            preview.style.fontSize = '13px';
            preview.style.lineHeight = '1.4';
            const rawText = this.practiceBlock.text.replace(/\[\d{1,2}:\d{2}\]/, '').trim();
            preview.textContent = rawText.length > 80 ? rawText.slice(0, 80) + '...' : rawText;
        }

        // Progress bar
        const progress = panel.createDiv('lme-practice-progress');
        const bar = progress.createDiv('lme-practice-progress-bar');
        bar.style.width = '0%';
        this.startProgressTracking(bar);
    }

    private enterPlayingOriginal(): void {
        this.state = 'playingOriginal';
        this.callbacks.refreshRecorderPanel();

        const block = this.practiceBlock;
        if (!block) return;

        // Seek to start and play
        this.callbacks.seekTo(block.startSec).then(() => {
            this.startOriginalPoll();
        });
    }

    private startOriginalPoll(): void {
        this.stopOriginalPoll();
        this.originalPollTimer = window.setInterval(() => {
            const currentTime = this.callbacks.getMediaCurrentTime();
            this.onTimeUpdate(currentTime);
        }, 100);
    }

    private stopOriginalPoll(): void {
        if (this.originalPollTimer) {
            clearInterval(this.originalPollTimer);
            this.originalPollTimer = null;
        }
    }

    private startProgressTracking(bar: HTMLElement): void {
        const block = this.practiceBlock;
        if (!block) return;
        const duration = block.endSec - block.startSec;
        if (duration <= 0) return;

        const gen = this.generation;
        const tick = () => {
            if (this.state !== 'playingOriginal' || this.generation !== gen) return;
            const current = this.callbacks.getMediaCurrentTime();
            const elapsed = current - block.startSec;
            const pct = Math.min(100, Math.max(0, (elapsed / duration) * 100));
            bar.style.width = `${pct}%`;
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    // ── State: countdown ──

    private renderCountdownUI(panel: HTMLElement): void {
        // Header row: LED + close button
        const header = panel.createDiv('lme-practice-header');
        const led = header.createDiv('lme-recorder-led');
        led.style.marginBottom = '0';
        const dot = led.createSpan({ cls: 'lme-recorder-dot is-recording' });
        const status = led.createSpan({
            text: t('shadowing.practiceCountdown', { count: String(this.countdownValue) }),
            cls: 'lme-recorder-status-text'
        });

        const actions = header.createDiv('lme-practice-header-actions');
        const closeBtn = actions.createEl('button', {
            cls: 'lme-practice-header-btn',
            attr: { 'aria-label': t('shadowing.practiceClose') }
        });
        setIcon(closeBtn, 'x');
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this.resetToIdle();
        };

        // Large countdown number overlay
        const overlay = panel.createDiv('lme-practice-countdown');
        const num = overlay.createSpan({
            text: String(this.countdownValue),
            cls: 'lme-practice-countdown-number'
        });
        const hint = overlay.createSpan({
            text: t('shadowing.practiceCountdown', { count: '' }).replace('...', '').trim(),
            cls: 'lme-practice-countdown-hint'
        });
    }

    private enterCountdown(): void {
        this.state = 'countdown';
        this.countdownValue = 3;
        this.callbacks.refreshRecorderPanel();

        // Start pre-fetching original waveform while countdown runs
        if (this.practiceBlock && !this.originalWaveformData) {
            this.callbacks.extractOriginalAudioBuffer(
                this.practiceBlock.startSec,
                this.practiceBlock.endSec
            ).then(data => {
                this.originalWaveformData = data;
            }).catch(() => {
                // Silently ignore extraction failures
            });
        }

        this.countdownTimer = window.setInterval(() => {
            this.countdownValue--;
            if (this.countdownValue <= 0) {
                this.stopCountdownTimer();
                this.enterRecording();
            } else {
                // Update the countdown display
                this.callbacks.refreshRecorderPanel();
            }
        }, 1000);
    }

    private stopCountdownTimer(): void {
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
    }

    // ── State: recording ──

    private renderRecordingUI(panel: HTMLElement): void {
        // LED header
        const led = panel.createDiv('lme-recorder-led');
        const dot = led.createSpan({ cls: 'lme-recorder-dot is-recording' });
        const status = led.createSpan({
            text: t('shadowing.practiceRecording'),
            cls: 'lme-recorder-status-text'
        });
        const timer = led.createSpan({ text: '00:00', cls: 'lme-recorder-timer' });

        // Real-time waveform canvas
        const canvas = panel.createEl('canvas', {
            cls: 'lme-recorder-waveform'
        });
        this.recordingWaveformCanvas = canvas;

        // Progress bar
        const progress = panel.createDiv('lme-practice-progress');
        const bar = progress.createDiv('lme-practice-progress-bar');
        bar.style.width = '0%';
        this.startRecordingProgress(bar, timer);

        // Stop button
        const btnRow = panel.createDiv('lme-practice-playback-row');
        const stopBtn = btnRow.createEl('button', {
            cls: 'lme-practice-playback-btn',
            attr: { 'aria-label': t('shadowing.recorderStop') }
        });
        setIcon(stopBtn, 'square');
        stopBtn.createSpan({ text: t('shadowing.recorderStop'), cls: 'lme-recorder-btn-label' });
        stopBtn.onclick = (e) => {
            e.stopPropagation();
            this.callbacks.stopRecording();
        };
    }

    private enterRecording(): void {
        this.state = 'recording';
        this.callbacks.refreshRecorderPanel();

        this.recordingStartTime = Date.now();
        const block = this.practiceBlock;
        this.recordingMaxDuration = block
            ? (block.endSec - block.startSec) * 1.5
            : 15;

        this.callbacks.startRecordingForPractice().then((started) => {
            if (!started) {
                // Mic access was denied — abort back to idle
                this.stopAutoStopTimer();
                this.state = 'idle';
                this.callbacks.refreshRecorderPanel();
                return;
            }

            // Start real-time waveform visualization on the canvas
            if (this.recordingWaveformCanvas) {
                this.callbacks.startWaveformOnCanvas(this.recordingWaveformCanvas);
            }

            // Auto-stop after maxDuration
            this.autoStopTimer = window.setTimeout(() => {
                if (this.state === 'recording') {
                    this.callbacks.stopRecording();
                }
            }, this.recordingMaxDuration * 1000);
        });
    }

    private stopAutoStopTimer(): void {
        if (this.autoStopTimer) {
            clearTimeout(this.autoStopTimer);
            this.autoStopTimer = null;
        }
    }

    private startRecordingProgress(bar: HTMLElement, timerEl: HTMLElement): void {
        const maxDur = this.recordingMaxDuration;
        if (maxDur <= 0) return;

        const gen = this.generation;
        const tick = () => {
            if (this.state !== 'recording' || this.generation !== gen) return;
            const elapsed = (Date.now() - this.recordingStartTime) / 1000;
            const pct = Math.min(100, (elapsed / maxDur) * 100);
            bar.style.width = `${pct}%`;

            const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const s = String(Math.floor(elapsed % 60)).padStart(2, '0');
            timerEl.textContent = `${m}:${s}`;

            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    // ── State: comparing ──

    private renderComparingUI(panel: HTMLElement): void {
        // Header row: LED + action buttons
        const header = panel.createDiv('lme-practice-header');

        const led = header.createDiv('lme-recorder-led');
        led.style.marginBottom = '0';
        const dot = led.createSpan({ cls: 'lme-recorder-dot is-recorded' });
        const status = led.createSpan({
            text: t('shadowing.practiceComparing'),
            cls: 'lme-recorder-status-text'
        });

        const actions = header.createDiv('lme-practice-header-actions');

        const againBtn = actions.createEl('button', {
            cls: 'lme-practice-header-btn',
            attr: { 'aria-label': t('shadowing.practiceAgain') }
        });
        setIcon(againBtn, 'rotate-ccw');
        againBtn.createSpan({ text: t('shadowing.practiceAgain') });
        againBtn.onclick = (e) => {
            e.stopPropagation();
            this.practiceAgain();
        };

        const closeBtn = actions.createEl('button', {
            cls: 'lme-practice-header-btn',
            attr: { 'aria-label': t('shadowing.practiceClose') }
        });
        setIcon(closeBtn, 'x');
        closeBtn.createSpan({ text: t('shadowing.practiceClose') });
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this.resetToIdle();
        };

        // Original waveform track
        const origTrack = panel.createDiv('lme-practice-track');
        origTrack.createSpan({
            text: t('shadowing.practiceOriginalLabel'),
            cls: 'lme-practice-track-label is-original'
        });
        if (this.originalWaveformData) {
            const canvas = origTrack.createEl('canvas', { cls: 'lme-practice-waveform' });
            this.originalCanvas = canvas;
            // Defer render to next frame so canvas has dimensions
            requestAnimationFrame(() => this.renderOriginalWaveform());
        } else {
            const placeholder = origTrack.createDiv({
                text: t('shadowing.practiceNoAudio'),
                cls: 'lme-practice-no-waveform'
            });
        }

        // User waveform track
        const userTrack = panel.createDiv('lme-practice-track');
        userTrack.createSpan({
            text: t('shadowing.practiceUserLabel'),
            cls: 'lme-practice-track-label is-user'
        });
        const userCanvas = userTrack.createEl('canvas', { cls: 'lme-practice-waveform' });
        this.userCanvas = userCanvas;
        requestAnimationFrame(() => this.renderUserWaveform());

        // Playback buttons
        const btnRow = panel.createDiv('lme-practice-playback-row');

        const origBtn = btnRow.createEl('button', {
            cls: 'lme-practice-playback-btn',
            attr: { 'aria-label': t('shadowing.practicePlayOriginal') }
        });
        setIcon(origBtn, 'volume-2');
        origBtn.createSpan({ text: t('shadowing.practicePlayOriginal') });
        origBtn.onclick = (e) => {
            e.stopPropagation();
            this.playOriginalSegment();
        };

        const mineBtn = btnRow.createEl('button', {
            cls: 'lme-practice-playback-btn',
            attr: { 'aria-label': t('shadowing.practicePlayMine') }
        });
        setIcon(mineBtn, 'mic');
        mineBtn.createSpan({ text: t('shadowing.practicePlayMine') });
        mineBtn.onclick = (e) => {
            e.stopPropagation();
            this.playUserRecording();
        };

        const altBtn = btnRow.createEl('button', {
            cls: 'lme-practice-playback-btn',
            attr: { 'aria-label': t('shadowing.practiceAlternate') }
        });
        setIcon(altBtn, 'repeat');
        altBtn.createSpan({ text: t('shadowing.practiceAlternate') });
        altBtn.onclick = (e) => {
            e.stopPropagation();
            this.alternatePlayback();
        };

        // ── AI Score button ──
        const scoreBtn = btnRow.createEl('button', {
            cls: 'lme-practice-playback-btn',
            attr: { 'aria-label': t('shadowing.practiceScore') }
        });
        setIcon(scoreBtn, 'star');
        scoreBtn.createSpan({ text: t('shadowing.practiceScore') });
        scoreBtn.onclick = (e) => {
            e.stopPropagation();
            this.triggerScoring();
        };

        // ── Scoring result card ──
        if (this.scoringState === 'loading') {
            this.renderScoringLoading(panel);
        } else if (this.scoringState === 'done' && this.scoringResult) {
            this.renderScoringCard(panel, this.scoringResult);
        } else if (this.scoringState === 'error') {
            this.renderScoringError(panel);
        }
    }

    // ── Waveform Rendering ──

    private renderOriginalWaveform(): void {
        if (!this.originalWaveformData || !this.originalCanvas) return;
        this.renderStaticWaveform(this.originalCanvas, this.originalWaveformData, 'rgba(100, 165, 255, 0.8)');
    }

    private renderUserWaveform(): void {
        if (!this.recordedWaveformData || !this.userCanvas) return;
        this.renderStaticWaveform(this.userCanvas, this.recordedWaveformData, 'rgba(255, 130, 180, 0.8)');
    }

    private renderStaticWaveform(canvas: HTMLCanvasElement, data: Float32Array, color: string): void {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        if (data.length === 0) return;

        // Downsample to bar count
        const barCount = 60;
        const step = Math.floor(data.length / barCount);
        const gap = Math.max(2, w * 0.005);
        const barWidth = (w - (barCount - 1) * gap) / barCount;

        for (let i = 0; i < barCount; i++) {
            // RMS of segment
            let sum = 0;
            const start = i * step;
            const end = Math.min(start + step, data.length);
            for (let j = start; j < end; j++) {
                sum += data[j] * data[j];
            }
            const rms = Math.sqrt(sum / (end - start || 1));
            const val = Math.min(1, rms * 4); // amplify for visibility
            const barH = Math.max(3, val * h * 0.85);
            const x = i * (barWidth + gap);
            const y = (h - barH) / 2;

            ctx.fillStyle = color;
            ctx.beginPath();
            const r = Math.min(barWidth / 2, 2);
            ctx.roundRect(x, y, barWidth, barH, r);
            ctx.fill();
        }
    }

    private async extractWaveformFromBlob(blob: Blob): Promise<Float32Array | null> {
        try {
            const arrayBuffer = await blob.arrayBuffer();
            const audioContext = new AudioContext();
            try {
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                const channelData = audioBuffer.getChannelData(0);
                return new Float32Array(channelData);
            } finally {
                audioContext.close();
            }
        } catch (err) {
            console.warn('[EME] Failed to extract waveform from recording:', err);
            return null;
        }
    }

    // ── AI Scoring ──

    private async triggerScoring(): Promise<void> {
        const blob = this.callbacks.getRecordedBlob();
        if (!blob) {
            new Notice(t('shadowing.noRecording'));
            return;
        }

        const block = this.practiceBlock;
        if (!block) return;

        const originalText = block.text.replace(/\[\d{1,2}:\d{2}\]/, '').trim();
        if (!originalText) return;

        this.scoringState = 'loading';
        this.scoringResult = null;
        this.scoringError = '';
        this.callbacks.refreshRecorderPanel();

        const gen = this.generation;
        try {
            const result = await this.callbacks.scoreRecording(blob, originalText);
            if (this.generation !== gen) return; // cancelled

            if (result) {
                this.scoringResult = result;
                this.scoringState = 'done';
            } else {
                this.scoringState = 'error';
                this.scoringError = t('shadowing.practiceScoreConfigure');
            }
        } catch (err: any) {
            if (this.generation !== gen) return;
            this.scoringState = 'error';
            this.scoringError = err.message || t('shadowing.practiceScoreError');
        }

        if (this.generation === gen) {
            this.callbacks.refreshRecorderPanel();
        }
    }

    private renderScoringLoading(panel: HTMLElement): void {
        const card = panel.createDiv('lme-practice-score-card');
        const loading = card.createDiv('lme-practice-score-loading');
        loading.createSpan({ cls: 'lme-practice-score-spinner' });
        loading.createSpan({ text: t('shadowing.practiceScoring') });
    }

    private renderScoringError(panel: HTMLElement): void {
        const card = panel.createDiv('lme-practice-score-card');
        const error = card.createDiv('lme-practice-score-error');
        error.textContent = this.scoringError || t('shadowing.practiceScoreError');
    }

    private renderScoringCard(panel: HTMLElement, score: PronunciationScore): void {
        const card = panel.createDiv('lme-practice-score-card');

        // ── Score header: large number + label ──
        const header = card.createDiv('lme-practice-score-header');
        const numEl = header.createSpan({
            text: `${score.overall}`,
            cls: 'lme-practice-score-number'
        });
        if (score.overall >= 80) numEl.addClass('is-high');
        else if (score.overall >= 50) numEl.addClass('is-mid');
        else numEl.addClass('is-low');

        header.createSpan({
            text: t('shadowing.practiceScore'),
            cls: 'lme-practice-score-label'
        });

        // ── Summary: one-line coach comment ──
        if (score.summary) {
            header.createDiv({
                text: score.summary,
                cls: 'lme-practice-score-summary'
            });
        }

        // ── Three metric badges ──
        const metrics = card.createDiv('lme-practice-score-metrics');
        const metricData = [
            { value: score.accuracy, label: t('shadowing.practiceScoreAccuracy') },
            { value: score.fluency, label: t('shadowing.practiceScoreFluency') },
            { value: score.completeness, label: t('shadowing.practiceScoreCompleteness') },
        ];
        metricData.forEach(m => {
            const badge = metrics.createDiv('lme-practice-score-metric');
            badge.createSpan({ text: String(m.value), cls: 'lme-practice-score-metric-value' });
            badge.createDiv({ text: m.label, cls: 'lme-practice-score-metric-label' });
        });

        // ── Word comparison ──
        if (score.wordComparison.length > 0) {
            const comp = card.createDiv('lme-practice-score-comparison');
            comp.createDiv({
                text: t('shadowing.practiceScoreRecognized'),
                cls: 'lme-practice-score-comparison-label'
            });
            score.wordComparison.forEach(w => {
                const span = comp.createSpan({
                    text: w.word,
                    cls: `lme-practice-score-word is-${w.status}`
                });
                comp.createSpan({ text: ' ' }); // space between words
            });
        }

        // ── Tips ──
        if (score.tips.length > 0) {
            const tips = card.createDiv('lme-practice-score-tips');
            tips.createDiv({
                text: t('shadowing.practiceScoreTips'),
                cls: 'lme-practice-score-tips-label'
            });
            score.tips.forEach(tip => {
                tips.createDiv({
                    text: tip,
                    cls: 'lme-practice-score-tip'
                });
            });
        }
    }

    // ── Playback Controls ──

    playOriginalSegment(): void {
        if (this.isPlayingOriginal) return;
        this.stopAllPlayback();

        const block = this.practiceBlock;
        if (!block) return;

        this.isPlayingOriginal = true;
        this.callbacks.seekTo(block.startSec);

        // Auto-pause at endSec via rAF check
        const gen = this.generation;
        const check = () => {
            if (!this.isPlayingOriginal || this.generation !== gen) return;
            const current = this.callbacks.getMediaCurrentTime();
            if (current >= block.endSec) {
                this.callbacks.pauseMedia();
                const ytPlayer = this.callbacks.getYtPlayer();
                if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
                this.isPlayingOriginal = false;
                return;
            }
            requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
    }

    playUserRecording(): void {
        if (this.isPlayingUser) return;
        this.stopAllPlayback();

        const blob = this.callbacks.getRecordedBlob();
        if (!blob) {
            new Notice(t('shadowing.noRecording'));
            return;
        }

        this.stopUserPlaybackAudio();
        this.userPlaybackUrl = URL.createObjectURL(blob);
        this.userPlaybackAudio = new Audio(this.userPlaybackUrl);
        this.isPlayingUser = true;

        this.userPlaybackAudio.onended = () => {
            this.isPlayingUser = false;
            this.stopUserPlaybackAudio();
        };
        this.userPlaybackAudio.play().catch(() => {
            this.isPlayingUser = false;
            this.stopUserPlaybackAudio();
            new Notice(t('shadowing.playbackFailed'));
        });
    }

    async alternatePlayback(): Promise<void> {
        if (this.alternatePhase !== 'idle') return;
        this.stopAllPlayback();

        const blob = this.callbacks.getRecordedBlob();
        if (!blob) {
            new Notice(t('shadowing.noRecording'));
            return;
        }

        const gen = ++this.generation;

        // Phase 1: Play user recording
        this.alternatePhase = 'playingUser';
        const url = URL.createObjectURL(blob);
        const userAudio = new Audio(url);

        await new Promise<void>((resolve) => {
            userAudio.onended = () => {
                URL.revokeObjectURL(url);
                resolve();
            };
            userAudio.onerror = () => {
                URL.revokeObjectURL(url);
                resolve();
            };
            userAudio.play().catch(() => {
                URL.revokeObjectURL(url);
                resolve();
            });
        });

        // Guard: cancelled or state changed
        if (this.state !== 'comparing' || this.generation !== gen) {
            this.alternatePhase = 'idle';
            return;
        }

        // Phase 2: Brief gap
        this.alternatePhase = 'gap';
        await new Promise<void>(r => setTimeout(r, 500));

        if (this.state !== 'comparing' || this.generation !== gen) {
            this.alternatePhase = 'idle';
            return;
        }

        // Phase 3: Play original
        this.alternatePhase = 'playingOriginal';
        this.playOriginalSegment();

        // Reset phase when original playback finishes
        const waitGen = this.generation;
        const waitForOriginal = () => {
            if (this.generation !== waitGen) {
                this.alternatePhase = 'idle';
                return;
            }
            if (this.isPlayingOriginal) {
                requestAnimationFrame(waitForOriginal);
            } else {
                this.alternatePhase = 'idle';
            }
        };
        requestAnimationFrame(waitForOriginal);
    }

    private stopUserPlaybackAudio(): void {
        if (this.userPlaybackAudio) {
            this.userPlaybackAudio.onended = null;
            this.userPlaybackAudio.pause();
            this.userPlaybackAudio = null;
        }
        if (this.userPlaybackUrl) {
            URL.revokeObjectURL(this.userPlaybackUrl);
            this.userPlaybackUrl = null;
        }
    }

    private stopAllPlayback(): void {
        this.generation++; // Cancel all rAF loops and async flows
        this.isPlayingOriginal = false;
        this.isPlayingUser = false;
        this.alternatePhase = 'idle';
        this.stopUserPlaybackAudio();
        // Pause media if it's playing
        this.callbacks.pauseMedia();
        const ytPlayer = this.callbacks.getYtPlayer();
        if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
    }

    // ── Transitions ──

    private practiceAgain(): void {
        this.stopAllPlayback();
        this.originalWaveformData = null;
        this.recordedWaveformData = null;
        this.originalCanvas = null;
        this.userCanvas = null;
        // Keep cached audio buffer for reuse on same media file
        const block = this.practiceBlock;
        this.cleanup();
        if (block) {
            this.startPractice(block);
        }
    }

    private resetToIdle(): void {
        this.cleanup();
        this.callbacks.refreshRecorderPanel();
    }
}
