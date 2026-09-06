// @ts-nocheck
// ============================================================
// English Made Easy - Video Shadowing View
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// ============================================================

import { App, ItemView, WorkspaceLeaf, MarkdownView, Notice, MarkdownRenderer, setIcon, TFile, Platform, requestUrl, Modal, FuzzySuggestModal } from 'obsidian';
import type LanguageMadeEasyPlugin from '../main-unified-full';
import type { TimestampBlock, PronunciationScore } from '../../models';
import { AIService } from '../core/AIService';
import { AI_ANALYSIS_VIEW_TYPE } from './ai-analysis-view';
import { ShadowingPractice } from './shadowing-practice';
import type { PracticeCallbacks } from './shadowing-practice';
import { BUILTIN_PROMPTS } from '../models';
import type { PromptTemplate } from '../models';
import { UpgradeModal } from '../ui/upgrade-modal';
import { checkSubtitleWeeklyQuota, recordSubtitleDownload } from '../core/free-quota';
import { t } from '../i18n';
import { buildSubtitleNoteFrontmatter, parseSrt, type SubtitleNoteMetadata } from '../utils/srt';

export const SHADOWING_VIEW_TYPE = 'lme-shadowing-view';

declare global {
    interface Window {
        onYouTubeIframeAPIReady: () => void;
        YT: any;
    }
}

/**
 * Fetch with automatic retry on 429 (Too Many Requests).
 * Uses exponential backoff: 3s, 6s, 12s (max 3 retries).
 */
async function fetchWithRetry(fn: () => Promise<any>, retries = 3, baseDelay = 3000): Promise<any> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (e: any) {
            const is429 = e?.status === 429 || (e?.message && e.message.includes('429'));
            if (!is429 || attempt === retries) throw e;
            const delay = baseDelay * Math.pow(2, attempt);
            console.log(`[EME] 429 rate limited, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${retries})`);
            new Notice(t('shadowing.rateLimitedRetry', { seconds: delay / 1000 }));
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// PandoraReads — 视频跟读
export class ShadowingView extends ItemView {
    private plugin: LanguageMadeEasyPlugin;
    private videoEl: HTMLVideoElement | null = null;
    private audioEl: HTMLAudioElement | null = null;
    private ytPlayer: any = null;
    private ytMobileHandler: ((event: MessageEvent) => void) | null = null;
    private ytMobileTime: number = 0;
    private ytMobileState: number = -1;
    private blocks: TimestampBlock[] = [];
    private shadowingMode = false;
    private activeBlock: TimestampBlock | null = null;
    private ytTimer: number | null = null;
    /** 视图已关闭/清理 —— 阻止异步回调(YouTube initPlayer 轮询、onReady)在 close 后挂载。 */
    private destroyed = false;
    private editorListener: any = null;
    private blocksContainer: HTMLElement | null = null;
    private dictationResults: Map<number, string> = new Map(); // lineIndex -> user typed text
    private dictationSubmittedResults: Map<number, string> = new Map(); // lineIndex -> last submitted text
    private submittedLines: Set<number> = new Set(); // lineIndex -> submitted status
    private dictationScores: Map<number, number> = new Map(); // lineIndex -> last submitted score
    private dictationRevealedAnswers: Set<number> = new Set(); // lineIndex -> original answer revealed
    private showDictationSummary: boolean = false;
    private learningMode: 'shadowing' | 'dictation' = 'shadowing';
    private file: TFile | null = null;
    private currentMediaSrc: string | null = null;
    private mediaType: 'video' | 'audio' | 'youtube' | null = null;
    private detectedMediaFileName: string | null = null;
    private detectedMediaFile: TFile | null = null;
    // Track which block already triggered an auto-pause in dictation mode
    private dictationPausedBlock: TimestampBlock | null = null;
    // 教学点浮层：本轮(lineIndex)已弹集合 + 当前浮层实例 + 上次时间(回跳检测清空)
    // 社区免费版:讲解卡浮层已随完整版移除,保留已弹集合用于播放到讲解点时去重弹付费引导
    private teachingShown: Set<number> = new Set();
    private lastTeachingUpdateTime: number = 0;
    private playerOuterEl: HTMLElement | null = null;
    private playerContainerEl: HTMLElement | null = null;
    private bilibiliBlobUrl: string | null = null;
    private loopSingleBlock: boolean = false;
    private loopPauseGuard: TimestampBlock | null = null;
    private focusMode: boolean = false;
    private resizeCleanup: (() => void) | null = null;
    private focusKeyHandler: ((evt: KeyboardEvent) => void) | null = null;
    private dictationKeyHandler: ((evt: KeyboardEvent) => void) | null = null;
    private dictationPlayBtn: HTMLButtonElement | null = null;
    private dictationPlayMedia: HTMLMediaElement | null = null;
    private dictationPlaySync: (() => void) | null = null;
    private focusLeftSplitWasCollapsed: boolean | null = null;
    private focusRightSplitWasCollapsed: boolean | null = null;
    private focusPreviousBaseTheme: string | null = null;
    private focusChangedBaseTheme: boolean = false;
    private focusExitButtonEl: HTMLElement | null = null;
    private focusPreviousInlineBackground: string | null = null;
    private focusPreviousInlineBackgroundColor: string | null = null;

    // ── Bookmark Panel ──
    private bookmarkKeyHandler: ((e: KeyboardEvent) => void) | null = null;

    // ── Playback Shortcuts (Space / ← / → / R) ──
    private playbackKeyHandler: ((e: KeyboardEvent) => void) | null = null;

    // ── Voice Recorder ──
    private recorderPanelEl: HTMLElement | null = null;
    private recorderCollapsedBtn: HTMLElement | null = null;
    private recorderExpandedEl: HTMLElement | null = null;
    private mediaRecorder: MediaRecorder | null = null;
    private recordedBlob: Blob | null = null;
    private recordedAudioEl: HTMLAudioElement | null = null;
    private recorderState: 'idle' | 'recording' | 'recorded' = 'idle';
    private recorderTimer: number | null = null;
    private recorderSeconds = 0;
    private mediaStream: MediaStream | null = null;
    private playbackRecordingUrl: string | null = null;
    private waveformCanvas: HTMLCanvasElement | null = null;
    private waveformAnimFrame: number | null = null;
    private audioContext: AudioContext | null = null;
    private analyserNode: AnalyserNode | null = null;

    // ── Guided Practice ──
    private practice: ShadowingPractice | null = null;
    private decodedAudioBuffer: AudioBuffer | null = null;
    private decodedAudioBufferSrc: string | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: LanguageMadeEasyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return SHADOWING_VIEW_TYPE; }
    getDisplayText(): string { return t('shadowing.viewTitle'); }
    getIcon(): string { return 'play-circle'; }

    async onOpen(): Promise<void> {
        console.log('[EME] ShadowingView.onOpen() triggered');
        this.renderInitial();
        this.loadYouTubeIframeAPI();
        // Delay detection slightly to ensure Workspace is ready and avoid initial jitter
        window.setTimeout(() => this.autoDetectVideo(), 100);


        // Register bookmark keyboard shortcut
        this.registerBookmarkShortcut();
        this.registerDictationShortcut();
        this.registerPlaybackShortcuts();
        // Use Obsidian's registerEvent for automatic cleanup
        let debounceTimer: number | null = null;
        this.registerEvent(
            this.app.workspace.on('editor-change', () => {
                if (debounceTimer) window.clearTimeout(debounceTimer);
                debounceTimer = window.setTimeout(() => {
                    this.parseActiveNoteTimestamps();
                }, 500);
            })
        );
    }

    async onClose(): Promise<void> {
        this.cleanup();
    }

    private cleanup(): void {
        this.destroyed = true;
        this.unregisterDictationShortcut();
        this.unregisterPlaybackShortcuts();
        this.detachDictationPlaySync();
        this.teachingShown.clear();
        this.unregisterBookmarkShortcut();
        if (this.ytTimer) clearInterval(this.ytTimer);
        if (this.ytMobileHandler) {
            window.removeEventListener('message', this.ytMobileHandler);
            this.ytMobileHandler = null;
        }
        if (this.practice) {
            this.practice.cleanup();
            this.practice = null;
        }
        this.cleanupRecorder();
        if (this.videoEl) {
            this.videoEl.onerror = null;
            this.videoEl.onpause = null;
            this.videoEl.onplay = null;
        }
        if (this.audioEl) {
            this.audioEl.onerror = null;
            this.audioEl.onpause = null;
            this.audioEl.onplay = null;
        }
        this.ytPlayer = null;
        this.videoEl = null;
        this.audioEl = null;
        this.playerContainerEl = null;
        this.currentMediaSrc = null;
        this.mediaType = null;
        this.blocksContainer = null;
        if (this.bilibiliBlobUrl) {
            URL.revokeObjectURL(this.bilibiliBlobUrl);
            this.bilibiliBlobUrl = null;
        }
        if (this.resizeCleanup) {
            this.resizeCleanup();
            this.resizeCleanup = null;
        }
        this.exitFocusMode();
        this.decodedAudioBuffer = null;
        this.decodedAudioBufferSrc = null;
        this.detectedMediaFile = null;
    }

    private renderInitial(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lme-shadowing-view');

        const empty = contentEl.createDiv('lme-shadowing-empty');
        empty.createDiv({ cls: 'lme-shadowing-icon', text: '🎭' });
        empty.createEl('h2', { text: t('shadowing.workshopTitle'), cls: 'lme-workshop-title' });
        empty.createEl('p', { text: t('shadowing.workshopDesc') });

        const quickParse = empty.createDiv({ cls: 'lme-shadowing-url-quickparse' });
        const input = quickParse.createEl('input', {
            type: 'text',
            attr: {
                placeholder: t('shadowing.videoUrlPlaceholder'),
                'aria-label': t('shadowing.videoUrlPlaceholder'),
            }
        });
        const parseBtn = quickParse.createEl('button', { text: t('shadowing.parseUrl'), cls: 'mod-cta' });
        const submit = async () => {
            const url = input.value.trim();
            if (!url) {
                new Notice(t('shadowing.enterVideoUrl'));
                return;
            }
            parseBtn.disabled = true;
            try {
                await this.createVideoNoteAndParse(url);
            } finally {
                parseBtn.disabled = false;
            }
        };
        parseBtn.onclick = () => { void submit(); };
        input.onkeydown = (evt) => {
            if (evt.key === 'Enter') {
                evt.preventDefault();
                void submit();
            }
        };

        const hints = empty.createDiv({ cls: 'lme-shadowing-help' });
        hints.createEl('p', { text: t('shadowing.howToStart') });
        const list = hints.createEl('ul');
        list.createEl('li', { text: t('shadowing.embedVideo') });
        list.createEl('li', { text: t('shadowing.embedAudio') });
        list.createEl('li', { text: t('shadowing.addTimestamps') });
        list.createEl('li', { text: t('shadowing.clickScan') });

        const toolbarHints = empty.createDiv({ cls: 'lme-shadowing-help' });
        toolbarHints.createEl('p', { text: t('shadowing.toolbar') });
        const toolbarList = toolbarHints.createEl('ul');
        toolbarList.createEl('li', { text: t('shadowing.downloadSub') });
        toolbarList.createEl('li', { text: t('shadowing.aiAnalysis') });
        toolbarList.createEl('li', { text: t('shadowing.shadowMode') });
        toolbarList.createEl('li', { text: t('shadowing.dictationMode') });

        const btn = empty.createEl('button', { text: t('shadowing.scanNote'), cls: 'mod-cta' });
        btn.onclick = () => this.autoDetectVideo();
    }

    public async createVideoNoteAndParse(url: string, downloadSubtitles: boolean = false, options?: { openNote?: boolean }): Promise<TFile | null> {
        const openNote = options?.openNote !== false;
        const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
        const metadata = await this.fetchVideoMetadata(normalizedUrl);
        const title = (metadata.title || this.buildVideoNoteTitle(normalizedUrl)).replace(/[\\\/:*?"<>|]/g, '_').trim() || this.buildVideoNoteTitle(normalizedUrl);
        const folder = (this.plugin.settings.videoNoteFolder || '').trim();
        const path = await this.getAvailableVideoNotePath(folder, title);
        const content = `${buildSubtitleNoteFrontmatter({ ...metadata, title: metadata.title || '', link: metadata.link || normalizedUrl })}\n\n# ${title}\n\n${normalizedUrl}\n\n## Subtitles\n\n`;
        const file = await this.app.vault.create(path, content);
        this.file = file;
        if (openNote) {
            // 批量模式(openNote:false)跳过:不开 tab、不加载播放器(字幕插入只依赖 this.file)
            const leaf = this.app.workspace.getLeaf('tab');
            await leaf.openFile(file);
            await this.autoDetectVideo();
        }
        if (downloadSubtitles) {
            await this.fetchAndInsertSubtitles();
        }
        return file;
    }

    private async fetchVideoMetadata(url: string): Promise<SubtitleNoteMetadata> {
        const result: SubtitleNoteMetadata = { link: url };
        const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
        if (!match) return result;
        result.cover = `https://i.ytimg.com/vi/${match[1]}/maxresdefault.jpg`;
        try {
            const response = await requestUrl({ url: `https://www.youtube.com/watch?v=${match[1]}`, method: 'GET', headers: { Accept: 'text/html,application/xhtml+xml' } });
            const html = response.text || '';
            const read = (regex: RegExp): string => html.match(regex)?.[1]?.replace(/\\u0026/g, '&').replace(/\\u003d/g, '=').trim() || '';
            result.title = read(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)/i) || read(/<meta[^>]+itemprop=["']name["'][^>]+content=["']([^"']*)/i);
            result.channel = read(/"ownerChannelName":"([^"\\]*(?:\\.[^"\\]*)*)"/i) || read(/<link[^>]+itemprop=["']name["'][^>]+content=["']([^"']*)/i);
            const seconds = read(/"lengthSeconds":"(\d+)"/i);
            if (seconds) result.duration = this.formatMetadataDuration(Number(seconds));
            result.language = this.getActiveLanguageName();
        } catch {
            // Metadata is optional; the note is still created with blank fields.
        }
        return result;
    }

    private getActiveLanguageName(): string {
        const names: Record<string, string> = { english: '英语' };
        return names[this.plugin.settings.activeLanguage] || '';
    }

    private formatMetadataDuration(totalSeconds: number): string {
        if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '';
        const seconds = Math.floor(totalSeconds);
        const minutes = Math.floor(seconds / 60);
        const remainder = seconds % 60;
        if (minutes >= 60) return `${Math.floor(minutes / 60)}小时${minutes % 60}分${remainder}秒`;
        return `${minutes}分${remainder}秒`;
    }

    private buildVideoNoteTitle(url: string): string {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
        const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i)?.[1];
        const bili = url.match(/(?:bilibili\.com\/video\/|b23\.tv\/)((?:BV[a-zA-Z0-9]{10})|(?:av[0-9]+)|[a-zA-Z0-9]+)/i)?.[1];
        return `${t('shadowing.videoNoteTitle')}-${yt || bili || stamp}`.replace(/[\\\/:*?"<>|]/g, '_');
    }

    private async getAvailableVideoNotePath(folder: string, baseName: string): Promise<string> {
        let index = 0;
        while (true) {
            const suffix = index === 0 ? '' : `-${index + 1}`;
            const fileName = `${baseName}${suffix}.md`;
            const path = folder ? `${folder}/${fileName}` : fileName;
            if (!this.app.vault.getAbstractFileByPath(path)) return path;
            index++;
        }
    }

    public async autoDetectVideo() {
        console.log('[EME] autoDetectVideo() scanning...');
        this.detectedMediaFileName = null;

        let view = this.app.workspace.getActiveViewOfType(MarkdownView);
        let file = view ? view.file : this.app.workspace.getActiveFile();

        // If still no file, try getting the most recent markdown file
        if (!file) {
            const lastFiles = this.app.workspace.getLastOpenFiles();
            if (lastFiles && lastFiles.length > 0) {
                const recentPath = lastFiles[0];
                file = this.app.vault.getAbstractFileByPath(recentPath) as TFile;
            }
        }

        if (!file || file.extension !== 'md') {
            console.log('[EME] No active Markdown file for video detection');
            return;
        }

        this.file = file;
        const content = await this.app.vault.read(file);
        console.log(`[EME] Scanning file: ${file.path}`);

        // 1. Bilibili Regex (check first for Chinese users)
        const bilibiliRegex = /(?:https?:\/\/)?(?:www\.)?bilibili\.com\/video\/((?:BV[a-zA-Z0-9]{10})|(?:av[0-9]+))/i;
        const biliShortRegex = /(?:https?:\/\/)?b23\.tv\/([a-zA-Z0-9]+)/i;

        let bvidMatch = content.match(bilibiliRegex);
        if (bvidMatch) {
            const bvid = bvidMatch[1];
            console.log(`[EME] Detected Bilibili video: ${bvid}`);
            const bilibiliKey = `bilibili:${bvid}`;
            if (bilibiliKey !== this.currentMediaSrc) {
                // Extract full URL for multi-page parsing (?p=N)
                const fullUrlMatch = content.match(/(?:https?:\/\/)?(?:www\.)?bilibili\.com\/video\/((?:BV[a-zA-Z0-9]{10})|(?:av[0-9]+))[^\s]*/i);
                this.fetchBilibiliVideo(bvid, fullUrlMatch ? fullUrlMatch[0] : undefined);
            }
            return;
        }

        // Check for b23.tv short links — resolve to full URL automatically
        const shortMatch = content.match(biliShortRegex);
        if (shortMatch) {
            const shortCode = shortMatch[1];
            // Use the full matched text from note as the URL to replace
            // Handles both "https://b23.tv/xxx" and bare "b23.tv/xxx"
            const originalText = shortMatch[0];
            const shortUrl = originalText.startsWith('http') ? originalText : `https://${originalText}`;

            console.log(`[EME] Detected b23.tv short link: ${shortUrl}, resolving...`);
            new Notice(t('shadowing.parsingBilibili'));

            const resolved = await this.resolveBilibiliShortLink(shortCode);
            if (resolved) {
                const bvidExtracted = resolved.match(/\/video\/(BV[a-zA-Z0-9]{10})/i);
                const avidExtracted = resolved.match(/\/video\/(av[0-9]+)/i);
                const id = bvidExtracted ? bvidExtracted[1] : avidExtracted ? avidExtracted[1] : null;

                if (id) {
                    // Replace original text (preserving protocol or lack thereof) in note
                    await this.replaceShortLinkInNote(file, originalText, resolved);
                    new Notice(t('shadowing.shortLinkParsed', { id }));
                    // Continue with normal Bilibili flow
                    const bilibiliKey = `bilibili:${id}`;
                    if (bilibiliKey !== this.currentMediaSrc) {
                        this.fetchBilibiliVideo(id, resolved);
                    }
                    return;
                }
            }
            new Notice(t('shadowing.shortLinkFailed'));
            console.log('[EME] Failed to resolve b23.tv short link');
        }

        // 2. YouTube Regex
        const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i;
        const ytMatch = content.match(ytRegex);
        if (ytMatch) {
            const videoId = ytMatch[1];
            console.log(`[EME] Detected YouTube video: ${videoId}`);
            const src = `https://www.youtube.com/embed/${videoId}`;
            if (src !== this.currentMediaSrc) {
                this.loadMedia(src, 'youtube', true);
            }
            return;
        }

        // 2. Obsidian Embed Syntax ![[video.mp4]] or ![[audio.mp3]]
        const internalEmbedMatch = content.match(/!\[\[(.*?\.(?:mp4|webm|ogv|mov|avi|mkv|flv|wmv|ts|m4v|mp3|wav|m4a|ogg|flac|aac))\]\]/i);
        if (internalEmbedMatch && internalEmbedMatch[1]) {
            const fileName = internalEmbedMatch[1];
            const mediaFile = this.app.metadataCache.getFirstLinkpathDest(fileName, file.path);
            if (mediaFile) {
                this.detectedMediaFileName = mediaFile.basename;
                this.detectedMediaFile = mediaFile as TFile;
                const src = this.app.vault.getResourcePath(mediaFile);
                const isAudio = /\.(?:mp3|wav|m4a|ogg|flac|aac)$/i.test(fileName);
                console.log(`[EME] Detected Internal media: ${fileName}, resourcePath: ${src}, isAudio: ${isAudio}`);
                if (src !== this.currentMediaSrc) {
                    this.loadMedia(src, isAudio ? 'audio' : 'video', false);
                }
                return;
            }
        }

        // 3. Local/HTML5 Video/Audio Tags or direct link syntax ![caption](url)
        const rawMediaMatch = content.match(/<(?:video|audio)[^>]+src=["']([^"']+)["']/i) || content.match(/!\[.*?\]\((.*?)\)/i);
        if (rawMediaMatch && rawMediaMatch[1]) {
            let src = rawMediaMatch[1];
            const ytIdMatch = src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i);
            if (ytIdMatch) {
                const videoId = ytIdMatch[1];
                const ytSrc = `https://www.youtube.com/embed/${videoId}`;
                if (ytSrc !== this.currentMediaSrc) {
                    this.loadMedia(ytSrc, 'youtube', true);
                }
                return;
            }

            // Check if it's an audio file
            const isAudio = /\.(?:mp3|wav|m4a|ogg|flac|aac)$/i.test(src);
            const isVideo = /\.(?:mp4|webm|ogv|mov|avi|mkv|flv|wmv|ts|m4v)$/i.test(src);

            if ((isAudio || isVideo) && !src.startsWith('http')) {
                const mediaFile = this.app.metadataCache.getFirstLinkpathDest(src, file.path);
                if (mediaFile) {
                    this.detectedMediaFileName = mediaFile.basename;
                    this.detectedMediaFile = mediaFile as TFile;
                    src = this.app.vault.getResourcePath(mediaFile);
                    console.log(`[EME] Resolved ![](...) to local resource: ${src}, type: ${isAudio ? 'audio' : 'video'}`);
                }
            }

            if (isAudio || isVideo) {
                console.log(`[EME] Detected HTML5/Link media: ${src}, type: ${isAudio ? 'audio' : 'video'}`);
                if (src !== this.currentMediaSrc) {
                    this.loadMedia(src, isAudio ? 'audio' : 'video', false);
                }
                return;
            }
        }

        console.log('[EME] No media source found in current note');
        new Notice(t('shadowing.noMediaSource') + t('errors.contactAuthor'));
    }

    /**
     * Resolve a b23.tv short link to a full bilibili.com/video/ URL.
     * Fast path: if the short code itself contains a BV/av ID, skip network request.
     * Network path: fetch with redirect:'manual', fallback to requestUrl + HTML parsing.
     */
    private async resolveBilibiliShortLink(shortCode: string): Promise<string | null> {
        if (!/^[a-zA-Z0-9]+$/.test(shortCode)) {
            return null;
        }

        // Fast path: short code is already a BV or av ID
        const bvMatch = shortCode.match(/^(BV[a-zA-Z0-9]{10})$/i);
        if (bvMatch) {
            return `https://www.bilibili.com/video/${bvMatch[1]}`;
        }
        const avMatch = shortCode.match(/^(av[0-9]+)$/i);
        if (avMatch) {
            return `https://www.bilibili.com/video/${avMatch[1]}`;
        }

        const targetUrl = `https://b23.tv/${shortCode}`;
        const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

        // Attempt 1: Node.js https — read redirect Location header directly (desktop)
        if (Platform.isDesktop) {
            try {
                const https = require('https');
                const redirectUrl = await new Promise<string | null>((resolve) => {
                    const req = https.get(targetUrl, { headers: { 'User-Agent': ua } }, (res: any) => {
                        const location = res.headers.location as string | undefined;
                        res.destroy();
                        if (location && [301, 302, 303, 307, 308].includes(res.statusCode)) {
                            resolve(location);
                        } else {
                            resolve(null);
                        }
                    });
                    req.on('error', () => resolve(null));
                    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
                });
                if (redirectUrl) {
                    const id = this.extractBilibiliVideoId(redirectUrl);
                    if (id) {
                        console.log(`[EME] Node https resolved: ${redirectUrl}`);
                        return `https://www.bilibili.com/video/${id}`;
                    }
                }
            } catch (e) {
                console.error('[EME] Node https attempt failed:', e);
            }
        }

        // Attempt 2: requestUrl — follows redirects, parse HTML for BV/av ID
        try {
            const resp = await requestUrl({
                url: targetUrl,
                method: 'GET',
                headers: { 'User-Agent': ua, 'Accept': 'text/html' },
            });
            const body = resp.text || '';
            const id = this.extractBilibiliVideoId(body);
            if (id) {
                console.log(`[EME] requestUrl resolved: ${id}`);
                return `https://www.bilibili.com/video/${id}`;
            }
        } catch (e) {
            console.error('[EME] requestUrl attempt failed:', e);
        }

        // Attempt 3: fetch with redirect:'manual' to read Location header
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            try {
                const resp = await fetch(targetUrl, {
                    method: 'GET',
                    redirect: 'manual',
                    signal: controller.signal,
                });
                if (resp.status === 301 || resp.status === 302) {
                    const location = resp.headers.get('location');
                    if (location) {
                        const id = this.extractBilibiliVideoId(location);
                        if (id) return `https://www.bilibili.com/video/${id}`;
                    }
                }
                if (resp.url && resp.url !== targetUrl) {
                    const id = this.extractBilibiliVideoId(resp.url);
                    if (id) return `https://www.bilibili.com/video/${id}`;
                }
            } finally {
                clearTimeout(timeoutId);
            }
        } catch (e) {
            console.error('[EME] fetch redirect attempt failed:', e);
        }

        return null;
    }

    /**
     * Extract BV or av video ID from text (URL, HTML, JSON, etc.)
     */
    private extractBilibiliVideoId(text: string): string | null {
        // Standard bilibili.com/video/ path
        const pathMatch = text.match(/bilibili\.com\/video\/((?:BV[a-zA-Z0-9]{10})|(?:av[0-9]+))/i);
        if (pathMatch) return pathMatch[1];
        // JSON-encoded bvid field
        const bvidMatch = text.match(/"bvid"\s*:\s*"(BV[a-zA-Z0-9]{10})"/i);
        if (bvidMatch) return bvidMatch[1];
        // Bare BV ID (10 chars after BV)
        const bareMatch = text.match(/(BV[a-zA-Z0-9]{10})/i);
        if (bareMatch) return bareMatch[1];
        return null;
    }

    /**
     * Replace a b23.tv short link in the note with the resolved long URL.
     * Re-reads file before writing to avoid overwriting concurrent user edits.
     */
    private async replaceShortLinkInNote(
        file: TFile,
        originalText: string,
        longUrl: string,
    ): Promise<void> {
        const currentContent = await this.app.vault.read(file);
        const escaped = originalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const newContent = currentContent.replace(new RegExp(escaped, 'g'), longUrl);
        if (newContent !== currentContent) {
            await this.app.vault.modify(file, newContent);
            console.log(`[EME] Replaced short link in note: ${originalText} → ${longUrl}`);
        }
    }

    public async loadMedia(src: string, type: 'video' | 'audio' | 'youtube' = 'video', isYouTube = false): Promise<void> {
        console.log(`[EME] loadMedia triggered with src: ${src}, type: ${type}`);
        this.currentMediaSrc = src;
        this.mediaType = type;
        this.exitFocusMode();
        // Invalidate cached audio buffer when media source changes
        if (this.decodedAudioBufferSrc !== src) {
            this.decodedAudioBuffer = null;
            this.decodedAudioBufferSrc = null;
        }
        const { contentEl } = this;
        contentEl.empty();

        // Clear previous media elements
        this.videoEl = null;
        this.audioEl = null;

        this.playerOuterEl = contentEl.createDiv('lme-player-outer');
        const playerContainer = this.playerOuterEl.createDiv('lme-player-container');
        this.playerContainerEl = playerContainer;
        this.applySavedPlayerHeight(playerContainer);

        if (type === 'youtube' || isYouTube) {
            await this.renderYouTube(playerContainer, src);
        } else if (type === 'audio') {
            this.renderLocalAudioPlayer(this.playerOuterEl, playerContainer, src);
        } else {
            this.renderLocalVideo(playerContainer, src);
        }

        this.attachPlayerResizeHandle(playerContainer);
        this.applyPlayerHeightForLearningMode();
        this.renderPlaybackBar();
        this.renderLearningToggles(contentEl);
        this.blocksContainer = contentEl.createDiv('lme-shadowing-list');
        this.renderRecorderPanel(contentEl);
        this.updateRecorderVisibilityForLearningMode();
        await this.parseActiveNoteTimestamps();
    }

    private renderLocalVideo(parent: HTMLElement, src: string): void {
        this.videoEl = parent.createEl('video', {
            attr: {
                src: src,
                controls: 'true',
                playsinline: 'true',
                preload: 'metadata'
            },
            cls: 'lme-video-el'
        });

        this.videoEl.style.width = '100%';
        this.videoEl.style.height = '100%';
        this.videoEl.style.display = 'block';

        if (this.videoEl) {
            this.videoEl.playbackRate = this.plugin.settings.defaultPlaybackRate;
            this.videoEl.onloadedmetadata = () => console.log('[EME] Local video metadata loaded');
            this.videoEl.onerror = () => {
                console.error('[EME] Local video playback error:', this.videoEl?.error);
                new Notice(t('shadowing.localVideoFailed') + t('errors.contactAuthor'));
            };

            let lastCall = 0;
            this.videoEl.addEventListener('timeupdate', () => {
                const now = Date.now();
                if (now - lastCall >= 250) {
                    lastCall = now;
                    this.onTimeUpdate(this.videoEl!.currentTime);
                }
            });
        }
    }

    private renderLocalAudioPlayer(outer: HTMLElement, container: HTMLElement, src: string): void {
        // Hide the 16:9 video container for audio mode
        container.addClass('is-hidden');

        this.audioEl = document.createElement('audio');
        this.audioEl.src = src;
        this.audioEl.preload = 'metadata';
        this.audioEl.playbackRate = this.plugin.settings.defaultPlaybackRate;

        const audioPlayer = outer.createDiv('lme-audio-player');
        audioPlayer.createEl('div', { cls: 'lme-audio-player-icon' });

        const infoRow = audioPlayer.createDiv('lme-audio-player-info');
        const titleEl = infoRow.createDiv({ cls: 'lme-audio-player-title', text: this.detectedMediaFileName || 'Audio' });
        const timeEl = infoRow.createDiv({ cls: 'lme-audio-player-time', text: '0:00' });

        const controlsRow = audioPlayer.createDiv('lme-audio-player-controls');

        const playBtn = controlsRow.createEl('button', { cls: 'lme-audio-play-btn' });
        setIcon(playBtn, 'play');

        const progressWrap = controlsRow.createDiv('lme-audio-progress-wrap');
        const progressFill = progressWrap.createDiv('lme-audio-progress-fill');
        const progressThumb = progressWrap.createDiv('lme-audio-progress-thumb');

        // Click/drag to seek
        progressWrap.onclick = (e) => {
            if (!this.audioEl || !this.audioEl.duration) return;
            const rect = progressWrap.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            this.audioEl.currentTime = ratio * this.audioEl.duration;
        };

        const formatTime = (sec: number): string => {
            const m = Math.floor(sec / 60);
            const s = Math.floor(sec % 60);
            return `${m}:${String(s).padStart(2, '0')}`;
        };

        const updateProgress = () => {
            if (!this.audioEl || !this.audioEl.duration) return;
            const pct = (this.audioEl.currentTime / this.audioEl.duration) * 100;
            progressFill.style.width = `${pct}%`;
            progressThumb.style.left = `${pct}%`;
            timeEl.textContent = `${formatTime(this.audioEl.currentTime)} / ${formatTime(this.audioEl.duration)}`;
        };

        playBtn.onclick = (e) => {
            e.stopPropagation();
            if (!this.audioEl) return;
            if (this.audioEl.paused) {
                this.audioEl.play();
                setIcon(playBtn, 'pause');
            } else {
                this.audioEl.pause();
                setIcon(playBtn, 'play');
            }
        };

        this.audioEl.onloadedmetadata = () => {
            updateProgress();
        };

        this.audioEl.ontimeupdate = () => {
            updateProgress();
            this.onTimeUpdate(this.audioEl!.currentTime);
        };

        this.audioEl.onplay = () => setIcon(playBtn, 'pause');
        this.audioEl.onpause = () => setIcon(playBtn, 'play');
        this.audioEl.onended = () => setIcon(playBtn, 'play');

        this.audioEl.onerror = () => {
            console.error('[EME] Local audio playback error:', this.audioEl?.error);
            new Notice(t('shadowing.localAudioFailed'));
        };
    }

    // Helper methods to work with both video and audio
    private getCurrentMedia(): HTMLVideoElement | HTMLAudioElement | null {
        return this.videoEl || this.audioEl;
    }

    private getMediaDuration(): number {
        const media = this.getCurrentMedia();
        return media ? media.duration : 0;
    }

    private getMediaCurrentTime(): number {
        if (this.ytPlayer && this.ytPlayer.getCurrentTime) {
            return this.ytPlayer.getCurrentTime();
        }
        const media = this.getCurrentMedia();
        return media ? media.currentTime : 0;
    }

    private setMediaCurrentTime(time: number): void {
        const media = this.getCurrentMedia();
        if (media) media.currentTime = time;
    }

    private playMedia(): void {
        const media = this.getCurrentMedia();
        if (media) media.play();
    }

    private pauseMedia(): void {
        const media = this.getCurrentMedia();
        if (media) media.pause();
    }

    private isMediaPaused(): boolean {
        const media = this.getCurrentMedia();
        return media ? media.paused : true;
    }

    private setMediaPlaybackRate(rate: number): void {
        const media = this.getCurrentMedia();
        if (media) media.playbackRate = rate;
    }

    private loadYouTubeIframeAPI(): void {
        if (window.YT && window.YT.Player) return;
        if (!window.onYouTubeIframeAPIReady) {
            window.onYouTubeIframeAPIReady = () => console.log('[EME] YouTube Iframe API Ready');
        }
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
    }

    private async renderYouTube(parent: HTMLElement, url: string): Promise<void> {
        let videoId = '';
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length == 11) videoId = match[2];

        const ytId = 'lme-yt-player-' + Date.now();

        if (Platform.isMobile) {
            await this.renderYouTubeMobile(parent, videoId, ytId);
        } else {
            this.renderYouTubeDesktop(parent, videoId, ytId);
        }
    }

    private renderYouTubeDesktop(parent: HTMLElement, videoId: string, ytId: string): void {
        this.loadYouTubeIframeAPI();
        const iframe = parent.createEl('iframe', {
            attr: {
                id: ytId,
                src: `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0&rel=0`,
                frameborder: '0',
                allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
                allowfullscreen: 'true',
                referrerpolicy: 'strict-origin-when-cross-origin'
            },
            cls: 'lme-video-iframe'
        });
        iframe.style.width = '100%';
        iframe.style.height = '100%';

        const initPlayer = () => {
            if (this.destroyed) return;
            if (!window.YT || !window.YT.Player) {
                setTimeout(initPlayer, 500);
                return;
            }
            try {
                this.ytPlayer = new window.YT.Player(ytId, {
                    events: {
                        'onReady': () => {
                            if (this.destroyed) return;
                            console.log('[EME] YouTube Player API Connected');
                            this.ytPlayer.setPlaybackRate(this.plugin.settings.defaultPlaybackRate);
                            this.startYouTubeTick();
                        },
                        'onError': (e: any) => console.error('[EME] YouTube API Error:', e.data)
                    }
                });
            } catch (err) {
                console.error('[EME] YT API Hooking failed:', err);
            }
        };
        initPlayer();
    }

    private async renderYouTubeMobile(parent: HTMLElement, videoId: string, ytId: string): Promise<void> {
        if (this.ytMobileHandler) {
            window.removeEventListener('message', this.ytMobileHandler);
            this.ytMobileHandler = null;
        }

        // Mobile strategy: extract direct video stream URL from InnerTube API
        // and play with HTML5 <video> for full playback control (seek, speed, auto-pause).
        // Fallback: Obsidian proxy iframe (playback only, no API control).
        try {
            const streamUrl = await this.fetchYouTubeStreamUrl(videoId);

            if (streamUrl) {
                console.log('[EME] Mobile YouTube: got stream URL, using HTML5 video');
                this.mediaType = 'video';
                this.detectedMediaFileName = `YouTube_${videoId}`;
                this.renderLocalVideo(parent, streamUrl);
                return;
            }
        } catch (e) {
            console.warn('[EME] Mobile YouTube stream URL extraction failed:', e);
        }

        // Fallback: Obsidian proxy (video plays but no learning feature control)
        console.log('[EME] Mobile YouTube: falling back to Obsidian proxy');
        this.ytMobileTime = 0;
        this.ytMobileState = -1;

        const embedUrl = `https://releases.obsidian.md/youtube?v=${videoId}`;
        const iframe = parent.createEl('iframe', {
            attr: {
                id: ytId,
                src: embedUrl,
                sandbox: 'allow-forms allow-presentation allow-same-origin allow-popups-to-escape-sandbox allow-scripts allow-modals allow-popups',
                allow: 'fullscreen',
                frameborder: '0',
                referrerpolicy: 'strict-origin-when-cross-origin',
                allowfullscreen: 'true'
            },
            cls: 'lme-video-iframe'
        });
        iframe.style.width = '100%';
        iframe.style.height = '100%';

        this.ytPlayer = {
            getCurrentTime: () => this.ytMobileTime,
            getPlayerState: () => this.ytMobileState,
            playVideo: () => {},
            pauseVideo: () => {},
            seekTo: () => {},
            setPlaybackRate: () => {},
            getDuration: () => 0
        };
    }

    private async fetchYouTubeStreamUrl(videoId: string): Promise<string | null> {
        let pageResp;
        try {
            pageResp = await fetchWithRetry(() => requestUrl({
                url: `https://www.youtube.com/watch?v=${videoId}`,
                method: 'GET',
                headers: { 'Accept': 'text/html,application/xhtml+xml' },
            }));
        } catch {
            return null;
        }

        const apiKeyMatch = pageResp.text.match(/"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/);
        if (!apiKeyMatch) return null;

        let playerResp;
        try {
            playerResp = await fetchWithRetry(() => requestUrl({
                url: `https://www.youtube.com/youtubei/v1/player?key=${apiKeyMatch[1]}`,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context: {
                        client: {
                            clientName: 'ANDROID',
                            clientVersion: '20.10.38',
                        },
                    },
                    videoId,
                }),
            }));
        } catch {
            return null;
        }

        const playerData = JSON.parse(playerResp.text);
        const formats = playerData?.streamingData?.formats;
        if (!formats || !Array.isArray(formats)) return null;

        // Prefer itag 18 (360p MP4 with audio) — ideal for mobile
        const itag18 = formats.find((f: any) => f.itag === 18 && f.url);
        if (itag18) return itag18.url;

        // Fallback: any MP4 format with direct URL
        const mp4 = formats.find((f: any) => f.url && f.mimeType?.startsWith('video/mp4'));
        if (mp4) return mp4.url;

        return null;
    }

    /**
     * Fetch Bilibili video via API and load as native HTML5 video.
     * Supports local caching to avoid re-downloading on repeat visits.
     */
    private async fetchBilibiliVideo(bvid: string, fullUrl?: string): Promise<void> {
        const bilibiliKey = `bilibili:${bvid}`;
        this.currentMediaSrc = bilibiliKey;
        this.mediaType = 'video';

        // Show loading state
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lme-shadowing-view');

        const loadingEl = contentEl.createDiv('lme-bilibili-loading');
        loadingEl.style.textAlign = 'center';
        loadingEl.style.padding = '40px 20px';
        loadingEl.createEl('h3', { text: t('shadowing.loadingBilibili') });
        const statusText = loadingEl.createEl('p', { text: t('shadowing.checkingCache'), cls: 'lme-bilibili-status' });

        // Progress bar
        const progressWrap = loadingEl.createDiv('lme-progress-wrap');
        progressWrap.style.cssText = 'max-width:320px;margin:16px auto 0;height:8px;background:var(--background-modifier-border);border-radius:4px;overflow:hidden;';
        const progressBar = progressWrap.createDiv('lme-progress-bar');
        progressBar.style.cssText = 'width:0%;height:100%;border-radius:4px;transition:width 0.4s ease;';
        progressBar.style.background = 'linear-gradient(90deg, #6c5ce7, #a29bfe, #fd79a8)';
        progressBar.style.backgroundSize = '200% 100%';
        progressBar.style.animation = 'lme-progress-shimmer 2s linear infinite';

        // Step label
        const stepLabel = loadingEl.createEl('p', { text: '', cls: 'lme-bilibili-step' });
        stepLabel.style.cssText = 'margin-top:10px;font-size:0.8em;color:var(--text-muted);';

        const updateProgress = (percent: number, status: string, step: string) => {
            progressBar.style.width = percent + '%';
            statusText.setText(status);
            stepLabel.setText(step);
        };

        try {
            // Parse page number from URL (?p=2) for multi-part videos
            let pageNum = 1;
            if (fullUrl) {
                const pMatch = fullUrl.match(/[?&]p=(\d+)/i);
                if (pMatch) pageNum = parseInt(pMatch[1]);
            }
            const cacheKey = pageNum > 1 ? `${bvid}_p${pageNum}` : bvid;

            // --- Try loading from local cache ---
            updateProgress(5, t('shadowing.checkingCache'), t('shadowing.step1Cache'));
            const cached = await this.readBilibiliCache(cacheKey);
            if (cached) {
                const sizeMB = (cached.byteLength / 1024 / 1024).toFixed(1);
                console.log(`[EME] Loaded Bilibili video from cache: ${cacheKey} (${sizeMB}MB)`);

                const blob = new Blob([cached], { type: 'video/mp4' });
                const blobUrl = URL.createObjectURL(blob);
                if (this.bilibiliBlobUrl) URL.revokeObjectURL(this.bilibiliBlobUrl);
                this.bilibiliBlobUrl = blobUrl;

                this.loadMedia(blobUrl, 'video', false);
                new Notice(t('shadowing.loadedFromCache', { size: sizeMB }));
                return;
            }

            // --- Cache miss: download from Bilibili ---

            // Step 1: Get video info (cid, title, pages)
            const infoResp = await requestUrl({
                url: `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
                method: 'GET',
                headers: {
                    'Referer': 'https://www.bilibili.com',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const infoData = infoResp.json;
            if (infoData.code !== 0) {
                throw new Error(infoData.message || t('shadowing.bilibiliApiError'));
            }

            // Get correct cid for the requested page
            let cid = infoData.data.cid;
            const title = infoData.data.title;
            const pages = infoData.data.pages || [];
            if (pageNum > 1 && pages.length >= pageNum) {
                cid = pages[pageNum - 1].cid;
                console.log(`[EME] Multi-part video: using page ${pageNum}, cid=${cid}`);
            }

            // Step 2: Get video stream URL (low quality MP4 for fast loading)
            updateProgress(15, t('shadowing.gettingVideoUrl', { title }), t('shadowing.step2Url'));
            const playResp = await requestUrl({
                url: `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=32&fnval=1&fourk=0`,
                method: 'GET',
                headers: {
                    'Referer': 'https://www.bilibili.com',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const playData = playResp.json;
            if (playData.code !== 0) {
                throw new Error(playData.message || t('shadowing.noPlaybackUrl'));
            }

            const durls = playData.data?.durl;
            if (!durls || durls.length === 0) {
                throw new Error(t('shadowing.noStreamUrl'));
            }

            const totalSize = durls.reduce((sum: number, d: any) => sum + (d.size || 0), 0);
            console.log(`[EME] Bilibili video: ${durls.length} segment(s), total ~${(totalSize / 1024 / 1024).toFixed(1)}MB`);

            // Step 3: Download all video segments
            const buffers: ArrayBuffer[] = [];
            let downloadedSize = 0;

            for (let i = 0; i < durls.length; i++) {
                const seg = durls[i];
                const segUrl = seg.url || seg.backup_url?.[0];
                if (!segUrl) continue;

                updateProgress(
                    15 + Math.round(((i + 1) / durls.length) * 65),
                    t('shadowing.downloadingSegment', { current: i + 1, total: durls.length, downloaded: (downloadedSize / 1024 / 1024).toFixed(1), size: (totalSize / 1024 / 1024).toFixed(1) }),
                    t('shadowing.step3Download')
                );

                try {
                    const segResp = await requestUrl({
                        url: segUrl,
                        method: 'GET',
                        headers: {
                            'Referer': 'https://www.bilibili.com',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                    buffers.push(segResp.arrayBuffer);
                    downloadedSize += segResp.arrayBuffer.byteLength;
                } catch {
                    if (seg.backup_url && seg.backup_url.length > 0) {
                        for (const backupUrl of seg.backup_url) {
                            try {
                                const backupResp = await requestUrl({
                                    url: backupUrl,
                                    method: 'GET',
                                    headers: {
                                        'Referer': 'https://www.bilibili.com',
                                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                                    }
                                });
                                buffers.push(backupResp.arrayBuffer);
                                downloadedSize += backupResp.arrayBuffer.byteLength;
                                break;
                            } catch {
                                continue;
                            }
                        }
                    }
                }
            }

            if (buffers.length === 0) {
                throw new Error(t('shadowing.videoDownloadFailed'));
            }

            // Step 4: Combine segments
            const totalBytes = buffers.reduce((sum, b) => sum + b.byteLength, 0);
            const combined = new Uint8Array(totalBytes);
            let offset = 0;
            for (const buf of buffers) {
                combined.set(new Uint8Array(buf), offset);
                offset += buf.byteLength;
            }

            // Step 5: Save to local cache (await to ensure file exists)
            updateProgress(85, t('shadowing.savingCache'), t('shadowing.step4Cache'));
            await this.writeBilibiliCache(cacheKey, combined);

            // Step 6: Create blob and load
            updateProgress(95, t('shadowing.loadingVideo'), t('shadowing.step5Play'));
            const blob = new Blob([combined], { type: 'video/mp4' });
            const blobUrl = URL.createObjectURL(blob);
            if (this.bilibiliBlobUrl) URL.revokeObjectURL(this.bilibiliBlobUrl);
            this.bilibiliBlobUrl = blobUrl;

            console.log(`[EME] Bilibili video loaded: ${(blob.size / 1024 / 1024).toFixed(1)}MB`);
            this.loadMedia(blobUrl, 'video', false);
            new Notice(t('shadowing.downloaded', { title }));

        } catch (error) {
            console.error('[EME] Bilibili fetch failed:', error);
            loadingEl.empty();
            loadingEl.style.padding = '40px 20px';
            loadingEl.style.textAlign = 'center';

            loadingEl.createEl('h3', { text: t('shadowing.bilibiliFailed') });
            loadingEl.createEl('p', {
                text: error instanceof Error ? error.message : t('shadowing.unknownError'),
                cls: 'lme-bilibili-error'
            });
            loadingEl.createEl('p', { text: t('shadowing.checkLink'), cls: 'lme-bilibili-hint' });
	            loadingEl.createEl('p', { text: t('errors.contactAuthor').trim(), cls: 'lme-bilibili-hint' });

            const retryBtn = loadingEl.createEl('button', { text: t('common.retry'), cls: 'mod-cta' });
            retryBtn.style.marginTop = '12px';
            retryBtn.onclick = () => this.fetchBilibiliVideo(bvid, fullUrl);
        }
    }

    // ============================================================
    // Bilibili Video Cache — saved alongside the note
    // ============================================================

    private getBilibiliCachePath(cacheKey: string): string | null {
        const file = this.file;
        if (!file) return null;
        const customFolder = this.plugin.settings.videoDownloadFolder;
        if (customFolder) {
            return `${customFolder}/${cacheKey}.mp4`;
        }
        const dir = file.parent?.path;
        return dir ? `${dir}/${cacheKey}.mp4` : `${cacheKey}.mp4`;
    }

    private async readBilibiliCache(cacheKey: string): Promise<ArrayBuffer | null> {
        const cachePath = this.getBilibiliCachePath(cacheKey);
        if (!cachePath) return null;
        try {
            const exists = await this.app.vault.adapter.exists(cachePath);
            if (!exists) return null;
            const buffer = await this.app.vault.adapter.readBinary(cachePath);
            if (buffer.byteLength === 0) return null;
            return buffer;
        } catch (e) {
            console.warn('[EME] Cache read failed:', e);
            return null;
        }
    }

    private async writeBilibiliCache(cacheKey: string, data: Uint8Array): Promise<void> {
        const cachePath = this.getBilibiliCachePath(cacheKey);
        if (!cachePath) return;
        try {
            const dir = cachePath.substring(0, cachePath.lastIndexOf('/'));
            if (dir) {
                const exists = await this.app.vault.adapter.exists(dir);
                if (!exists) {
                    await this.app.vault.adapter.mkdir(dir);
                }
            }
            await this.app.vault.adapter.writeBinary(cachePath, data.buffer as ArrayBuffer);
            console.log(`[EME] Cached: ${cachePath} (${(data.length / 1024 / 1024).toFixed(1)}MB)`);
        } catch (e) {
            console.warn('[EME] Cache write failed:', e);
        }
    }

    /**
     * Replace Bilibili URL in the note with local ![[path.mp4]] embed
     * so next load uses the local file directly.
     */
    private async replaceBilibiliUrlWithLocal(bvid: string, cacheKey: string, fullUrl?: string): void {
        const file = this.file;
        if (!file) return;

        const localPath = this.getBilibiliCachePath(cacheKey);
        if (!localPath) return;

        try {
            const content = await this.app.vault.read(file);

            // Build regex to match the full Bilibili URL line (may include ?p=N)
            // Match patterns like:
            //   ![](https://www.bilibili.com/video/BV...?p=2)
            //   https://www.bilibili.com/video/BV...?p=2
            //   ![any caption](https://www.bilibili.com/video/BV...)
            const escapedBvid = bvid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const urlPattern = new RegExp(
                `!\\[.*?\\]\\((?:https?://)?(?:www\\.)?bilibili\\.com/video/${escapedBvid}[^)]*\\)` +
                `|(?<![\\[/(])(?:https?://)?(?:www\\.)?bilibili\\.com/video/${escapedBvid}[^\\s)]*`,
                'i'
            );

            const match = content.match(urlPattern);
            if (!match) return;

            const localEmbed = `![[${localPath}]]`;
            const newContent = content.replace(urlPattern, localEmbed);

            if (newContent !== content) {
                await this.app.vault.modify(file, newContent);
                console.log(`[EME] Replaced Bilibili URL with local: ${localPath}`);
                new Notice(t('shadowing.replacedLocal', { path: localPath }));
            }
        } catch (e) {
            console.warn('[EME] Failed to replace Bilibili URL:', e);
        }
    }

    // ============================================================
    // SRT Subtitle Auto-Loading
    // ============================================================

    private async tryLoadSrtSubtitles(noteFile: TFile): Promise<{ startSec: number; lineIndex: number; text: string }[]> {
        // Candidate names: video filename first, then note filename as fallback
        const candidates: string[] = [];
        if (this.detectedMediaFileName) {
            candidates.push(this.detectedMediaFileName);
        }
        if (noteFile.basename && !candidates.includes(noteFile.basename)) {
            candidates.push(noteFile.basename);
        }
        if (candidates.length === 0) return [];

        for (const name of candidates) {
            const srtFile = await this.findSrtFile(name, noteFile);
            if (!srtFile) continue;

            try {
                const srtContent = await this.app.vault.read(srtFile);
                const blocks = this.parseSrtContent(srtContent);
                if (blocks.length > 0) {
                    new Notice(t('shadowing.loadedSrt', { name: srtFile.name, count: blocks.length }));
                    return blocks;
                }
            } catch (e) {
                console.warn('[EME] Failed to read SRT file:', e);
            }
        }
        return [];
    }

    private async findSrtFile(mediaBaseName: string, noteFile: TFile): Promise<TFile | null> {
        // 1. Same directory as the note
        const noteDir = noteFile.parent?.path;
        const sameDirPath = noteDir ? `${noteDir}/${mediaBaseName}.srt` : `${mediaBaseName}.srt`;
        const sameDirFile = this.app.vault.getAbstractFileByPath(sameDirPath);
        if (sameDirFile && sameDirFile instanceof TFile) return sameDirFile;

        // 2. Same directory as the video file (if detected from ![[path/video.mp4]])
        const videoFolder = this.plugin.settings.videoDownloadFolder;
        if (videoFolder) {
            const videoDirPath = `${videoFolder}/${mediaBaseName}.srt`;
            const videoDirFile = this.app.vault.getAbstractFileByPath(videoDirPath);
            if (videoDirFile && videoDirFile instanceof TFile) return videoDirFile;
        }

        // 3. Search entire vault
        const allFiles = this.app.vault.getFiles();
        const srtFile = allFiles.find(f =>
            f.extension === 'srt' && f.basename === mediaBaseName
        );
        return srtFile || null;
    }

    private parseSrtContent(content: string): { startSec: number; lineIndex: number; text: string }[] {
        // Delegate to the shared SRT parser (src/utils/srt.ts) so there is a
        // single source of truth for SRT parsing across the plugin.
        return parseSrt(content).map((seg, i) => ({
            startSec: seg.startSec,
            lineIndex: i,
            text: seg.text,
        }));
    }

    private startYouTubeTick(): void {
        if (this.destroyed) return;
        if (this.ytTimer) clearInterval(this.ytTimer);
        this.ytTimer = window.setInterval(() => {
            if (this.ytPlayer && this.ytPlayer.getCurrentTime) {
                this.onTimeUpdate(this.ytPlayer.getCurrentTime());
            }
        }, 500);
    }

    private renderLearningToggles(parent: HTMLElement): void {
        parent.querySelectorAll('.lme-learning-toggles-wrapper, .lme-floating-sidebar').forEach(el => el.remove());
        const sidebar = parent.createDiv('lme-floating-sidebar');
        const modeGroup = sidebar.createDiv('lme-sidebar-group lme-mode-group');

        // --- Subtitle download button (above mode toggles) ---
        const subtitleBtn = modeGroup.createEl('button', {
            cls: 'lme-sidebar-btn is-subtitle'
        });
        setIcon(subtitleBtn, 'download');
        subtitleBtn.createSpan({ text: t('shadowing.btnDownloadSub'), cls: 'label' });
        subtitleBtn.onclick = (e) => {
            e.stopPropagation();
            subtitleBtn.addClass('is-pressed');
            this.fetchAndInsertSubtitles();
            setTimeout(() => subtitleBtn.removeClass('is-pressed'), 300);
        };
        const subtitleSetPressed = () => subtitleBtn.addClass('is-pressed');
        const subtitleClearPressed = () => {
            setTimeout(() => {
                if (!subtitleBtn.hasClass('is-animating')) {
                    subtitleBtn.removeClass('is-pressed');
                }
            }, 150);
        };
        subtitleBtn.addEventListener('touchstart', subtitleSetPressed, { passive: true });
        subtitleBtn.addEventListener('touchend', subtitleClearPressed, { passive: true });
        subtitleBtn.addEventListener('mousedown', subtitleSetPressed);
        subtitleBtn.addEventListener('mouseup', subtitleClearPressed);
        subtitleBtn.addEventListener('mouseleave', subtitleClearPressed);

        // --- AI Analysis button ---
        const aiBtn = modeGroup.createEl('button', {
            cls: 'lme-sidebar-btn is-ai'
        });
        setIcon(aiBtn, 'lightbulb');
        aiBtn.createSpan({ text: t('shadowing.btnAiAnalysis'), cls: 'label' });
        aiBtn.onclick = (e) => {
            e.stopPropagation();
            aiBtn.addClass('is-pressed');
            this.runAIAnalysis();
            setTimeout(() => aiBtn.removeClass('is-pressed'), 300);
        };
        const aiSetPressed = () => aiBtn.addClass('is-pressed');
        const aiClearPressed = () => {
            setTimeout(() => {
                if (!aiBtn.hasClass('is-animating')) aiBtn.removeClass('is-pressed');
            }, 150);
        };
        aiBtn.addEventListener('touchstart', aiSetPressed, { passive: true });
        aiBtn.addEventListener('touchend', aiClearPressed, { passive: true });
        aiBtn.addEventListener('mousedown', aiSetPressed);
        aiBtn.addEventListener('mouseup', aiClearPressed);
        aiBtn.addEventListener('mouseleave', aiClearPressed);

        // --- Graded vocabulary annotation button ---
        // 社区免费版:分级词汇标注为完整版功能,按钮保留,点击弹付费引导。
        const gvBtn = modeGroup.createEl('button', {
            cls: 'lme-sidebar-btn is-vocab'
        });
        setIcon(gvBtn, 'tags');
        gvBtn.createSpan({ text: t('shadowing.btnGradedVocab'), cls: 'label' });
        gvBtn.onclick = (e) => {
            e.stopPropagation();
            new UpgradeModal(this.app, t('shadowing.btnGradedVocab')).open();
        };

        // --- Mode toggles (shadowing / dictation) ---
        const modes: { id: 'shadowing' | 'dictation', icon: string, label: string }[] = [
            { id: 'shadowing', icon: 'headphones', label: t('shadowing.btnShadowMode') },
            { id: 'dictation', icon: 'pen-tool', label: t('shadowing.btnDictationMode') }
        ];

        modes.forEach(m => {
            const btn = modeGroup.createEl('button', {
                cls: `lme-sidebar-btn is-${m.id} ${this.learningMode === m.id ? 'is-active' : ''}`
            });
            setIcon(btn, m.icon);
            btn.createSpan({ text: m.label, cls: 'label' });
            btn.onclick = (e) => {
                e.stopPropagation();

                // --- Step 1: Stretch & Hold ---
                this.learningMode = m.id;
                this.applyPlayerHeightForLearningMode();
                this.updateRecorderVisibilityForLearningMode();
                this.renderBlocks();
                this.renderPlaybackBar();

                // Force expanded state even if finger/mouse is released
                btn.addClass('is-animating');

                // --- Step 2: Graceful Retraction ---
                setTimeout(() => {
                    btn.removeClass('is-animating');
                    btn.removeClass('is-pressed');

                    // --- Step 3: Final State Sync ---
                    // Sync the new DOM nodes only after the retraction is nearly done (0.5s transition)
                    setTimeout(() => {
                        this.renderLearningToggles(parent);
                    }, 400);
                }, 600);
            };

            // Enhanced Touch/Click Feedback (Gap Bridging for Mobile)
            const setPressed = () => btn.addClass('is-pressed');
            const clearPressed = () => {
                // Add 150ms buffer to bridge the gap between touchend and click
                setTimeout(() => {
                    // Only remove if we're not in the middle of the "Elegant Flow" animation
                    if (!btn.hasClass('is-animating')) {
                        btn.removeClass('is-pressed');
                    }
                }, 150);
            };

            btn.addEventListener('touchstart', setPressed, { passive: true });
            btn.addEventListener('touchend', clearPressed, { passive: true });
            btn.addEventListener('mousedown', setPressed);
            btn.addEventListener('mouseup', clearPressed);
            btn.addEventListener('mouseleave', clearPressed);
        });

        // --- Batch Flashcard button ---
        const batchBtn = modeGroup.createEl('button', {
            cls: 'lme-sidebar-btn is-batch'
        });
        setIcon(batchBtn, 'layers');
        batchBtn.createSpan({ text: t('shadowing.btnBatchFlashcard'), cls: 'label' });
        batchBtn.onclick = (e) => {
            e.stopPropagation();
            batchBtn.addClass('is-pressed');
            // 社区免费版:批量闪卡为完整版功能,弹付费引导。
            new UpgradeModal(this.app, t('shadowing.btnBatchFlashcard')).open();
            setTimeout(() => batchBtn.removeClass('is-pressed'), 300);
        };
        const batchSetPressed = () => batchBtn.addClass('is-pressed');
        const batchClearPressed = () => {
            setTimeout(() => {
                if (!batchBtn.hasClass('is-animating')) batchBtn.removeClass('is-pressed');
            }, 150);
        };
        batchBtn.addEventListener('touchstart', batchSetPressed, { passive: true });
        batchBtn.addEventListener('touchend', batchClearPressed, { passive: true });
        batchBtn.addEventListener('mousedown', batchSetPressed);
        batchBtn.addEventListener('mouseup', batchClearPressed);
        batchBtn.addEventListener('mouseleave', batchClearPressed);

        if (!Platform.isMobile) {
            const focusBtn = modeGroup.createEl('button', {
                cls: `lme-sidebar-btn is-focus ${this.focusMode ? 'is-active' : ''}`
            });
            setIcon(focusBtn, 'moon');
            focusBtn.createSpan({ text: this.focusMode ? t('shadowing.btnExitFocusMode') : t('shadowing.btnFocusMode'), cls: 'label' });
            focusBtn.onclick = (e) => {
                e.stopPropagation();
                focusBtn.addClass('is-pressed');
                this.toggleFocusMode();
                setTimeout(() => focusBtn.removeClass('is-pressed'), 300);
            };
        }
    }

    private isPhoneLayout(): boolean {
        return Platform.isMobile && !document.body.classList.contains('is-tablet');
    }

    private applySavedPlayerHeight(playerContainer: HTMLElement): void {
        if (this.isPhoneLayout()) return;
        const saved = Number((this.plugin.settings as any).shadowingPlayerHeight || 0);
        if (!Number.isFinite(saved) || saved <= 0) return;
        const height = this.clampPlayerHeight(saved);
        playerContainer.style.height = `${height}px`;
        playerContainer.style.aspectRatio = 'auto';
        this.syncPlayerWidthForHeight(height);
    }

    private applyPlayerHeightForLearningMode(): void {
        if (!this.playerContainerEl || this.mediaType === 'audio') return;

        if (this.isPhoneLayout()) {
            this.applyPhonePlayerHeightForLearningMode();
            return;
        }

        if (this.learningMode === 'dictation') {
            const height = this.getMinPlayerHeight();
            this.playerContainerEl.style.height = `${height}px`;
            this.playerContainerEl.style.aspectRatio = 'auto';
            this.syncPlayerWidthForHeight(height);
            return;
        }

        const saved = Number((this.plugin.settings as any).shadowingPlayerHeight || 0);
        if (Number.isFinite(saved) && saved > 0) {
            this.applySavedPlayerHeight(this.playerContainerEl);
        } else {
            this.playerContainerEl.style.height = '';
            this.playerContainerEl.style.aspectRatio = '';
            if (this.playerOuterEl) this.playerOuterEl.style.maxWidth = '';
        }
    }

    private applyPhonePlayerHeightForLearningMode(): void {
        if (!this.playerContainerEl) return;

        if (this.learningMode !== 'dictation') {
            this.playerContainerEl.style.removeProperty('height');
            this.playerContainerEl.style.removeProperty('max-height');
            this.playerContainerEl.style.removeProperty('max-width');
            this.playerContainerEl.style.removeProperty('aspect-ratio');
            if (this.playerOuterEl) {
                this.playerOuterEl.style.removeProperty('max-width');
            }
            return;
        }

        const height = this.getPhoneDictationPlayerHeight();
        const width = Math.round(height * 16 / 9);
        this.playerContainerEl.style.setProperty('height', `${height}px`, 'important');
        this.playerContainerEl.style.setProperty('max-height', `${height}px`, 'important');
        this.playerContainerEl.style.setProperty('max-width', `${width}px`, 'important');
        this.playerContainerEl.style.setProperty('aspect-ratio', 'auto', 'important');
        if (this.playerOuterEl) {
            this.playerOuterEl.style.setProperty('max-width', `${width}px`, 'important');
        }
    }

    private attachPlayerResizeHandle(playerContainer: HTMLElement): void {
        if (this.isPhoneLayout() || this.mediaType === 'audio') return;
        if (this.resizeCleanup) {
            this.resizeCleanup();
            this.resizeCleanup = null;
        }

        const handle = this.playerOuterEl?.createDiv('lme-player-resize-handle');
        if (!handle) return;

        let startY = 0;
        let startHeight = 0;
        let dragging = false;

        const onMove = (evt: PointerEvent) => {
            if (!dragging) return;
            evt.preventDefault();
            const next = this.clampPlayerHeight(startHeight + evt.clientY - startY);
            playerContainer.style.height = `${next}px`;
            playerContainer.style.aspectRatio = 'auto';
            this.syncPlayerWidthForHeight(next);
        };

        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            document.body.removeClass('lme-player-resizing');
            const finalHeight = Math.round(playerContainer.getBoundingClientRect().height);
            (this.plugin.settings as any).shadowingPlayerHeight = this.clampPlayerHeight(finalHeight);
            this.plugin.saveSettings();
        };

        handle.onpointerdown = (evt: PointerEvent) => {
            if (this.focusMode) return;
            evt.preventDefault();
            dragging = true;
            startY = evt.clientY;
            startHeight = playerContainer.getBoundingClientRect().height;
            document.body.addClass('lme-player-resizing');
            handle.setPointerCapture?.(evt.pointerId);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);

        this.resizeCleanup = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            document.body.removeClass('lme-player-resizing');
            handle.remove();
        };
    }

    private clampPlayerHeight(height: number): number {
        const max = Math.max(320, Math.floor(window.innerHeight * 0.8));
        return Math.min(Math.max(height, this.getMinPlayerHeight()), max);
    }

    private getMinPlayerHeight(): number {
        return 260;
    }

    private getPhoneDictationPlayerHeight(): number {
        const viewportHeight = window.innerHeight || 720;
        return Math.round(Math.min(Math.max(viewportHeight * 0.22, 128), 180));
    }

    private syncPlayerWidthForHeight(height: number): void {
        if (this.isPhoneLayout() || !this.playerOuterEl) return;
        const targetWidth = Math.round(height * 16 / 9);
        const maxWidth = Math.min(Math.max(targetWidth, 920), 1320);
        this.playerOuterEl.style.maxWidth = `${maxWidth}px`;
        this.playerOuterEl.style.marginLeft = 'auto';
        this.playerOuterEl.style.marginRight = 'auto';
    }

    private toggleFocusMode(): void {
        if (this.focusMode) this.exitFocusMode();
        else this.enterFocusMode();
        this.renderLearningToggles(this.contentEl);
    }

    private enterFocusMode(): void {
        if (Platform.isMobile || this.focusMode) return;
        this.focusMode = true;
        this.forceFocusBackground();
        this.contentEl.addClass('is-focus-mode');
        document.body.addClass('lme-shadowing-focus-active');
        this.renderFocusExitButton();
        this.switchObsidianToDarkForFocus();
        this.collapseWorkspaceSidebarsForFocus();
        this.focusKeyHandler = (evt: KeyboardEvent) => {
            if (evt.key === 'Escape') {
                evt.preventDefault();
                this.exitFocusMode();
                this.renderLearningToggles(this.contentEl);
            }
        };
        window.addEventListener('keydown', this.focusKeyHandler);
    }

    private exitFocusMode(): void {
        if (!this.focusMode) return;
        this.focusMode = false;
        this.contentEl.removeClass('is-focus-mode');
        this.restoreFocusBackground();
        document.body.removeClass('lme-shadowing-focus-active');
        this.removeFocusExitButton();
        this.restoreWorkspaceSidebarsAfterFocus();
        this.restoreObsidianThemeAfterFocus();
        if (this.focusKeyHandler) {
            window.removeEventListener('keydown', this.focusKeyHandler);
            this.focusKeyHandler = null;
        }
    }

    private collapseWorkspaceSidebarsForFocus(): void {
        const workspace = this.app.workspace as any;
        const leftSplit = workspace.leftSplit;
        const rightSplit = workspace.rightSplit;
        this.focusLeftSplitWasCollapsed = !!leftSplit?.collapsed;
        this.focusRightSplitWasCollapsed = !!rightSplit?.collapsed;
        if (leftSplit && !leftSplit.collapsed && typeof leftSplit.collapse === 'function') {
            leftSplit.collapse();
        }
        if (rightSplit && !rightSplit.collapsed && typeof rightSplit.collapse === 'function') {
            rightSplit.collapse();
        }
    }

    private restoreWorkspaceSidebarsAfterFocus(): void {
        const workspace = this.app.workspace as any;
        const leftSplit = workspace.leftSplit;
        const rightSplit = workspace.rightSplit;
        if (this.focusLeftSplitWasCollapsed === false && leftSplit && typeof leftSplit.expand === 'function') {
            leftSplit.expand();
        }
        if (this.focusRightSplitWasCollapsed === false && rightSplit && typeof rightSplit.expand === 'function') {
            rightSplit.expand();
        }
        this.focusLeftSplitWasCollapsed = null;
        this.focusRightSplitWasCollapsed = null;
    }

    private switchObsidianToDarkForFocus(): void {
        const obsidianApp = this.app as any;
        const vaultConfig = obsidianApp.vault?.config;
        const current = vaultConfig?.theme || vaultConfig?.baseTheme || (document.body.hasClass('theme-dark') ? 'dark' : 'light');
        this.focusPreviousBaseTheme = current || null;
        this.focusChangedBaseTheme = false;
        if (current === 'dark') return;

        try {
            if (typeof obsidianApp.setConfig === 'function') {
                obsidianApp.setConfig('baseTheme', 'dark');
                this.focusChangedBaseTheme = true;
            } else if (vaultConfig) {
                if ('baseTheme' in vaultConfig) vaultConfig.baseTheme = 'dark';
                else vaultConfig.theme = 'dark';
                this.focusChangedBaseTheme = true;
            }
        } catch (error) {
            console.warn('[LME] Failed to switch Obsidian theme for focus mode:', error);
        }
    }

    private restoreObsidianThemeAfterFocus(): void {
        if (!this.focusChangedBaseTheme || !this.focusPreviousBaseTheme) {
            this.focusPreviousBaseTheme = null;
            this.focusChangedBaseTheme = false;
            return;
        }

        const obsidianApp = this.app as any;
        const vaultConfig = obsidianApp.vault?.config;
        try {
            if (typeof obsidianApp.setConfig === 'function') {
                obsidianApp.setConfig('baseTheme', this.focusPreviousBaseTheme);
            } else if (vaultConfig) {
                if ('baseTheme' in vaultConfig) vaultConfig.baseTheme = this.focusPreviousBaseTheme;
                else vaultConfig.theme = this.focusPreviousBaseTheme;
            }
        } catch (error) {
            console.warn('[LME] Failed to restore Obsidian theme after focus mode:', error);
        } finally {
            this.focusPreviousBaseTheme = null;
            this.focusChangedBaseTheme = false;
        }
    }

    private renderFocusExitButton(): void {
        this.removeFocusExitButton();
        const button = this.contentEl.createEl('button', {
            cls: 'lme-focus-exit-btn',
            attr: {
                'aria-label': t('shadowing.btnExitFocusMode'),
                title: t('shadowing.btnExitFocusMode')
            }
        });
        setIcon(button, 'minimize-2');
        button.createSpan({ text: t('shadowing.btnExitFocusMode') });
        button.onclick = (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            this.exitFocusMode();
            this.renderLearningToggles(this.contentEl);
        };
        this.focusExitButtonEl = button;
    }

    private removeFocusExitButton(): void {
        this.focusExitButtonEl?.remove();
        this.focusExitButtonEl = null;
    }

    private forceFocusBackground(): void {
        this.focusPreviousInlineBackground = this.contentEl.style.background;
        this.focusPreviousInlineBackgroundColor = this.contentEl.style.backgroundColor;
        this.contentEl.style.setProperty('background', '#000', 'important');
        this.contentEl.style.setProperty('background-color', '#000', 'important');
    }

    private restoreFocusBackground(): void {
        this.contentEl.style.background = this.focusPreviousInlineBackground || '';
        this.contentEl.style.backgroundColor = this.focusPreviousInlineBackgroundColor || '';
        this.focusPreviousInlineBackground = null;
        this.focusPreviousInlineBackgroundColor = null;
    }

    private renderPlaybackBar(): void {
        const parent = this.playerOuterEl;
        if (!parent) return;

        parent.querySelectorAll('.lme-playback-bar').forEach(el => el.remove());
        const bar = parent.createDiv('lme-playback-bar');
        let controls: { id: string, icon: string, label: string, action: () => void, toggle?: boolean }[] = [
            { id: 'sp080', icon: 'gauge', label: '0.8x', action: () => this.setSpeed(0.8) },
            { id: 'sp100', icon: 'play-circle', label: '1.0x', action: () => this.setSpeed(1.0) },
            { id: 'sp125', icon: 'zap', label: '1.25x', action: () => this.setSpeed(1.25) },
            { id: 'play', icon: 'play', label: t('shadowing.btnPlayPause'), action: () => this.togglePlayback() },
            { id: 'loop', icon: 'repeat', label: t('shadowing.btnLoop'), action: () => this.toggleLoopSingle(), toggle: true },
            // 社区免费版:视频标注为完整版功能,弹付费引导
            { id: 'bookmark', icon: 'bookmark', label: t('shadowing.btnBookmark'), action: () => new UpgradeModal(this.app, t('shadowing.btnBookmark')).open() }
        ];

        // On mobile (phones), hide 1.2x to fit 5 buttons in a single row
        if (Platform.isMobile) {
            controls = controls.filter(c => c.id !== 'sp125');
        }

        controls.forEach(c => {
            const btn = bar.createEl('button', {
                cls: `lme-playback-btn${c.toggle && c.id === 'loop' && this.loopSingleBlock ? ' is-active' : ''}`,
                attr: { 'aria-label': c.label }
            });
            setIcon(btn, c.icon);
            btn.createSpan({ text: c.label, cls: 'btn-text' });
            btn.onclick = (e) => {
                e.stopPropagation();
                c.action();
            };
        });
    }

    private togglePlayback() {
        const media = this.getCurrentMedia();
        if (media) {
            if (this.isMediaPaused()) this.playMedia();
            else this.pauseMedia();
        } else if (this.ytPlayer) {
            const state = this.ytPlayer.getPlayerState();
            if (state === 1) this.ytPlayer.pauseVideo();
            else this.ytPlayer.playVideo();
        }
    }

    private replayCurrentBlock() {
        const block = this.activeBlock;
        if (block) {
            const shouldRefresh = this.loopSingleBlock;
            this.loopSingleBlock = false;
            if (shouldRefresh && this.learningMode === 'dictation') {
                this.renderBlocks();
            }
            this.seekTo(block.startSec);
        }
    }

    // 通用跳句:delta=-1 上一句,+1 下一句。按 learningMode 分发
    private jumpToBlock(delta: number): void {
        if (this.blocks.length === 0) return;

        let currentIndex = this.activeBlock ? this.blocks.indexOf(this.activeBlock) : -1;
        if (currentIndex === -1) {
            // 未选中块:按当前播放时间兜底定位
            const blockAtTime = this.findActiveBlockAtTime(this.getMediaCurrentTime());
            currentIndex = blockAtTime ? this.blocks.indexOf(blockAtTime) : -1;
        }
        const nextIndex = currentIndex + delta;

        if (this.learningMode === 'dictation') {
            // 越界/末句 summary 交给 selectDictationBlock 处理
            this.selectDictationBlock(nextIndex, true);
            return;
        }

        // shadowing 模式:clamp 边界后手动切换
        const clamped = Math.max(0, Math.min(this.blocks.length - 1, nextIndex));
        const block = this.blocks[clamped];
        if (!block) return;
        this.activeBlock = block;
        this.dictationPausedBlock = null;
        this.highlightNoteLine(block.lineIndex);
        this.updateActiveBlockUI();
        this.seekTo(block.startSec);
    }

    // 播放快捷键:Space 播放/暂停(shadowing)、← 上一句、→ 下一句、R 重听当前句
    private registerPlaybackShortcuts(): void {
        this.unregisterPlaybackShortcuts();
        this.playbackKeyHandler = (evt: KeyboardEvent) => {
            if (evt.defaultPrevented) return;
            if (evt.repeat) return;
            const target = evt.target as HTMLElement | null;
            // 放行输入框与原生媒体控件:打字/移动光标正常,video/audio 聚焦时方向键保留原生 ±5s seek
            if (target?.closest('textarea, input, [contenteditable="true"], video, audio')) return;
            // 仅在视图范围内生效,避免误触 Obsidian 其他面板
            if (target && !this.contentEl.contains(target) && target !== document.body) return;

            if (evt.key === ' ' || evt.key === 'Spacebar') {
                // 仅 shadowing 接管空格;dictation 沿用既有 handler,避免双触发
                if (this.learningMode !== 'shadowing') return;
                evt.preventDefault();
                this.togglePlayback();
            } else if (evt.key === 'ArrowLeft') {
                evt.preventDefault();
                this.jumpToBlock(-1);
            } else if (evt.key === 'ArrowRight') {
                evt.preventDefault();
                this.jumpToBlock(1);
            } else if (evt.key === 'r' || evt.key === 'R') {
                // 不拦截带修饰键的组合(如 Mod+R)
                if (evt.ctrlKey || evt.metaKey || evt.altKey) return;
                evt.preventDefault();
                this.replayCurrentBlock();
            }
        };
        // capture 阶段先于元素级 handler,确保稳定拦截
        document.addEventListener('keydown', this.playbackKeyHandler, true);
    }

    private unregisterPlaybackShortcuts(): void {
        if (!this.playbackKeyHandler) return;
        document.removeEventListener('keydown', this.playbackKeyHandler, true);
        this.playbackKeyHandler = null;
    }

    private registerDictationShortcut(): void {
        this.unregisterDictationShortcut();
        this.dictationKeyHandler = (evt: KeyboardEvent) => {
            if (this.learningMode !== 'dictation' || evt.key !== ' ' || evt.defaultPrevented || evt.repeat) return;

            const target = evt.target as HTMLElement | null;
            if (target?.closest('textarea, input, [contenteditable="true"]')) return;
            if (target && !this.contentEl.contains(target) && target !== document.body) return;

            evt.preventDefault();
            this.togglePlayback();
        };
        document.addEventListener('keydown', this.dictationKeyHandler);
    }

    private unregisterDictationShortcut(): void {
        if (!this.dictationKeyHandler) return;
        document.removeEventListener('keydown', this.dictationKeyHandler);
        this.dictationKeyHandler = null;
    }

    private syncDictationPlayIcon(): void {
        if (!this.dictationPlayBtn) return;
        setIcon(this.dictationPlayBtn, this.isMediaPaused() ? 'play' : 'pause');
    }

    private attachDictationPlaySync(): void {
        this.detachDictationPlaySync();
        const media = this.getCurrentMedia() as HTMLMediaElement | null;
        if (!media) return;
        this.dictationPlayMedia = media;
        this.dictationPlaySync = () => this.syncDictationPlayIcon();
        media.addEventListener('play', this.dictationPlaySync);
        media.addEventListener('pause', this.dictationPlaySync);
        media.addEventListener('ended', this.dictationPlaySync);
        this.syncDictationPlayIcon();
    }

    private detachDictationPlaySync(): void {
        if (this.dictationPlaySync && this.dictationPlayMedia) {
            this.dictationPlayMedia.removeEventListener('play', this.dictationPlaySync);
            this.dictationPlayMedia.removeEventListener('pause', this.dictationPlaySync);
            this.dictationPlayMedia.removeEventListener('ended', this.dictationPlaySync);
        }
        this.dictationPlaySync = null;
        this.dictationPlayMedia = null;
        this.dictationPlayBtn = null;
    }

    private toggleLoopSingle() {
        this.loopSingleBlock = !this.loopSingleBlock;

        if (this.loopSingleBlock) {
            // Ensure activeBlock matches current playback position
            const currentTime = this.getMediaCurrentTime();
            if (currentTime > 0) {
                const block = this.blocks.find(b => currentTime >= b.startSec && currentTime < (b.endSec + 0.5));
                if (block) {
                    this.activeBlock = block;
                    this.dictationPausedBlock = null;
                    this.highlightNoteLine(block.lineIndex);
                    this.updateActiveBlockUI();
                }
            }
        }

        new Notice(this.loopSingleBlock ? t('shadowing.loopOn') : t('shadowing.loopOff'));
        this.renderPlaybackBar();
    }

    // ═══════════════════════════════════════════════════════════
    // Voice Recorder Panel
    // ═══════════════════════════════════════════════════════════

    private renderRecorderPanel(parent: HTMLElement): void {
        parent.querySelectorAll('.lme-recorder-wrap').forEach(el => el.remove());

        // When practice is active, skip cleanupRecorder() to preserve
        // recordedBlob and mediaRecorder state that practice depends on.
        const isPracticeActive = this.practice && this.practice.isActive();

        if (isPracticeActive) {
            const wrap = parent.createDiv('lme-recorder-wrap');
            wrap.appendChild(this.practice.renderPanel());
            this.recorderPanelEl = wrap;
            return;
        }

        this.cleanupRecorder();

        const wrap = parent.createDiv('lme-recorder-wrap');

        // ── Collapsed: single mic button ──
        const collapsedBtn = wrap.createEl('button', {
            cls: 'lme-recorder-toggle',
            attr: { 'aria-label': t('shadowing.recorderLabel') }
        });
        setIcon(collapsedBtn, 'mic');
        collapsedBtn.createSpan({ text: t('shadowing.recorderToggle'), cls: 'lme-recorder-toggle-label' });
        collapsedBtn.onclick = () => this.expandRecorder();
        this.recorderCollapsedBtn = collapsedBtn;

        // ── Expanded panel (hidden initially) ──
        const expanded = wrap.createDiv('lme-recorder-panel');
        expanded.style.display = 'none';
        this.recorderExpandedEl = expanded;

        // LED display screen
        const ledScreen = expanded.createDiv('lme-recorder-led');
        const ledDot = ledScreen.createSpan({ cls: 'lme-recorder-dot' });
        const ledStatus = ledScreen.createSpan({ text: t('shadowing.recorderReady'), cls: 'lme-recorder-status-text' });
        const ledTimer = ledScreen.createSpan({ text: '00:00', cls: 'lme-recorder-timer' });

        // Waveform canvas
        const canvas = expanded.createEl('canvas', {
            cls: 'lme-recorder-waveform'
        });
        this.waveformCanvas = canvas;

        // Button row — physical circular buttons
        const btnRow = expanded.createDiv('lme-recorder-btn-row');

        // Record / Stop button (large, round)
        const recordBtn = btnRow.createEl('button', {
            cls: 'lme-recorder-btn lme-recorder-btn-record',
            attr: { 'aria-label': t('shadowing.recorderRecord') }
        });
        setIcon(recordBtn, 'mic');
        recordBtn.createSpan({ text: t('shadowing.recorderRecord'), cls: 'lme-recorder-btn-label' });
        recordBtn.onclick = () => this.toggleRecording();

        // Playback recording (medium, round)
        const playbackBtn = btnRow.createEl('button', {
            cls: 'lme-recorder-btn lme-recorder-btn-playback',
            attr: { 'aria-label': t('shadowing.recorderPlayback') }
        });
        setIcon(playbackBtn, 'volume-2');
        playbackBtn.createSpan({ text: t('shadowing.recorderPlayback'), cls: 'lme-recorder-btn-label' });
        playbackBtn.onclick = () => this.playbackRecording();

        // Re-record
        const redoBtn = btnRow.createEl('button', {
            cls: 'lme-recorder-btn lme-recorder-btn-redo',
            attr: { 'aria-label': t('shadowing.recorderRedo') }
        });
        setIcon(redoBtn, 'rotate-ccw');
        redoBtn.createSpan({ text: t('shadowing.recorderRedo'), cls: 'lme-recorder-btn-label' });
        redoBtn.onclick = () => { this.stopRecordingCleanup(); this.updateRecorderUI(); };

        // Collapse button
        const collapseBtn = btnRow.createEl('button', {
            cls: 'lme-recorder-btn lme-recorder-btn-collapse',
            attr: { 'aria-label': t('shadowing.recorderCollapse') }
        });
        setIcon(collapseBtn, 'chevron-down');
        collapseBtn.createSpan({ text: t('shadowing.recorderCollapse'), cls: 'lme-recorder-btn-label' });
        collapseBtn.onclick = () => this.collapseRecorder();

        this.recorderPanelEl = wrap;
        this.updateRecorderUI();
    }

    private updateRecorderVisibilityForLearningMode(): void {
        const recorderWrap = this.recorderPanelEl || this.contentEl.querySelector('.lme-recorder-wrap') as HTMLElement | null;
        if (!recorderWrap) return;
        recorderWrap.style.display = this.learningMode === 'dictation' ? 'none' : '';
    }

    private expandRecorder(): void {
        if (this.recorderCollapsedBtn) this.recorderCollapsedBtn.style.display = 'none';
        if (this.recorderExpandedEl) this.recorderExpandedEl.style.display = '';
    }

    private collapseRecorder(): void {
        this.stopRecordingCleanup();
        if (this.recorderCollapsedBtn) this.recorderCollapsedBtn.style.display = '';
        if (this.recorderExpandedEl) this.recorderExpandedEl.style.display = 'none';
    }

    private updateRecorderUI(): void {
        const panel = this.recorderExpandedEl;
        if (!panel) return;

        const statusText = panel.querySelector('.lme-recorder-status-text') as HTMLElement;
        const dot = panel.querySelector('.lme-recorder-dot') as HTMLElement;
        const timerEl = panel.querySelector('.lme-recorder-timer') as HTMLElement;
        const recordBtn = panel.querySelector('.lme-recorder-btn-record') as HTMLElement;
        const playbackBtn = panel.querySelector('.lme-recorder-btn-playback') as HTMLElement;
        const redoBtn = panel.querySelector('.lme-recorder-btn-redo') as HTMLElement;

        const setBtnContent = (btn: HTMLElement | null, icon: string, label: string) => {
            if (!btn) return;
            btn.empty();
            setIcon(btn, icon);
            btn.createSpan({ text: label, cls: 'lme-recorder-btn-label' });
        };

        switch (this.recorderState) {
            case 'idle':
                if (statusText) statusText.textContent = t('shadowing.recorderReady');
                if (dot) { dot.className = 'lme-recorder-dot'; }
                setBtnContent(recordBtn, 'mic', t('shadowing.recorderRecord'));
                if (recordBtn) recordBtn.className = 'lme-recorder-btn lme-recorder-btn-record';
                if (playbackBtn) playbackBtn.disabled = true;
                if (redoBtn) redoBtn.style.display = 'none';
                break;
            case 'recording':
                if (statusText) statusText.textContent = t('shadowing.recorderRecording');
                if (dot) { dot.className = 'lme-recorder-dot is-recording'; }
                setBtnContent(recordBtn, 'square', t('shadowing.recorderStop'));
                if (recordBtn) recordBtn.className = 'lme-recorder-btn lme-recorder-btn-record is-active';
                if (playbackBtn) playbackBtn.disabled = true;
                if (redoBtn) redoBtn.style.display = 'none';
                break;
            case 'recorded':
                if (statusText) statusText.textContent = t('shadowing.recorderRecorded');
                if (dot) { dot.className = 'lme-recorder-dot is-recorded'; }
                setBtnContent(recordBtn, 'mic', t('shadowing.recorderRecord'));
                if (recordBtn) recordBtn.className = 'lme-recorder-btn lme-recorder-btn-record';
                if (playbackBtn) playbackBtn.disabled = false;
                if (redoBtn) redoBtn.style.display = '';
                break;
        }

        if (timerEl) {
            const m = String(Math.floor(this.recorderSeconds / 60)).padStart(2, '0');
            const s = String(this.recorderSeconds % 60).padStart(2, '0');
            timerEl.textContent = `${m}:${s}`;
        }
    }

    private async toggleRecording(): Promise<void> {
        if (this.recorderState === 'recording') {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    private async startRecording(): Promise<void> {
        if (this.recorderState !== 'idle' && this.recorderState !== 'recorded') return;
        this.recorderState = 'recording';
        this.updateRecorderUI();

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            this.recorderState = 'idle';
            this.updateRecorderUI();
            new Notice(t('shadowing.micDenied'));
            console.error('[EME] Mic access denied:', err);
            return;
        }

        this.recordedBlob = null;
        if (this.playbackRecordingUrl) {
            URL.revokeObjectURL(this.playbackRecordingUrl);
            this.playbackRecordingUrl = null;
        }
        if (this.recordedAudioEl) {
            this.recordedAudioEl.pause();
            this.recordedAudioEl = null;
        }

        const chunks: Blob[] = [];
        this.mediaRecorder = new MediaRecorder(this.mediaStream);
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };
        this.mediaRecorder.onstop = () => {
            const actualMime = this.mediaRecorder?.mimeType || 'audio/webm';
            this.recordedBlob = new Blob(chunks, { type: actualMime });
            this.recorderState = 'recorded';
            this.updateRecorderUI();
            this.releaseMediaStream();
        };

        this.mediaRecorder.start();
        this.recorderSeconds = 0;
        this.updateRecorderUI();
        this.startRecorderTimer();
        this.startWaveform();
    }

    private stopRecording(): void {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }
        this.stopRecorderTimer();
        this.stopWaveform();
    }

    private startRecorderTimer(): void {
        this.stopRecorderTimer();
        this.recorderTimer = window.setInterval(() => {
            this.recorderSeconds++;
            this.updateRecorderUI();
        }, 1000);
    }

    private stopRecorderTimer(): void {
        if (this.recorderTimer) {
            clearInterval(this.recorderTimer);
            this.recorderTimer = null;
        }
    }

    // ── Waveform ──

    private startWaveform(): void {
        if (!this.mediaStream || !this.waveformCanvas) return;

        // Resize canvas buffer to match display size
        const rect = this.waveformCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.waveformCanvas.width = Math.round(rect.width * dpr);
        this.waveformCanvas.height = Math.round(rect.height * dpr);

        this.audioContext = new AudioContext();
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 256;
        source.connect(this.analyserNode);

        this.drawWaveform();
    }

    /**
     * Start waveform visualization on an externally-provided canvas.
     * Used by the practice module for real-time recording feedback.
     */
    private startWaveformOnCanvas(canvas: HTMLCanvasElement): void {
        if (!this.mediaStream) return;

        // Resize canvas buffer to match display size
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);

        // Use this canvas as the waveform target
        this.waveformCanvas = canvas;

        // Create audio context if needed (mic stream is already active)
        if (!this.audioContext || this.audioContext.state === 'closed') {
            this.audioContext = new AudioContext();
        }
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 256;
        source.connect(this.analyserNode);

        this.drawWaveform();
    }

    private stopWaveform(): void {
        if (this.waveformAnimFrame) {
            cancelAnimationFrame(this.waveformAnimFrame);
            this.waveformAnimFrame = null;
        }
        if (this.analyserNode) {
            this.analyserNode.disconnect();
            this.analyserNode = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        // Clear canvas to flat line
        this.drawFlatLine();
    }

    private drawWaveform(): void {
        const canvas = this.waveformCanvas;
        const analyser = this.analyserNode;
        if (!canvas || !analyser) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            this.waveformAnimFrame = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);

            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            const barCount = 40;
            const step = Math.floor(bufferLength / barCount);
            const totalGap = barCount - 1;
            const gap = Math.max(2, w * 0.006);
            const barWidth = (w - totalGap * gap) / barCount;

            for (let i = 0; i < barCount; i++) {
                const val = dataArray[i * step] / 255;
                const barH = Math.max(4, val * h * 0.9);
                const x = i * (barWidth + gap);
                const y = (h - barH) / 2;

                ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.beginPath();
                const r = Math.min(barWidth / 2, 2);
                ctx.roundRect(x, y, barWidth, barH, r);
                ctx.fill();
            }
        };

        draw();
    }

    private drawFlatLine(): void {
        const canvas = this.waveformCanvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const barCount = 40;
        const gap = Math.max(2, w * 0.006);
        const barWidth = (w - (barCount - 1) * gap) / barCount;
        const barH = 4;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        for (let i = 0; i < barCount; i++) {
            const x = i * (barWidth + gap);
            const y = (h - barH) / 2;
            const r = Math.min(barWidth / 2, 2);
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barH, r);
            ctx.fill();
        }
    }

    private async playbackRecording(): Promise<void> {
        if (!this.recordedBlob) {
            new Notice(t('shadowing.noRecording'));
            return;
        }
        this.stopWaveform();
        if (this.recordedAudioEl) {
            this.recordedAudioEl.pause();
        }
        if (this.playbackRecordingUrl) {
            URL.revokeObjectURL(this.playbackRecordingUrl);
        }
        this.playbackRecordingUrl = URL.createObjectURL(this.recordedBlob);
        this.recordedAudioEl = new Audio(this.playbackRecordingUrl);

        // Resize canvas for playback
        if (this.waveformCanvas) {
            const rect = this.waveformCanvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            this.waveformCanvas.width = Math.round(rect.width * dpr);
            this.waveformCanvas.height = Math.round(rect.height * dpr);
        }

        // Synchronous: create/resume AudioContext in user-gesture scope,
        // then connect nodes and play — all synchronously to avoid losing
        // the gesture context on mobile WebViews (iOS WKWebView).
        let waveformReady = false;
        try {
            if (!this.audioContext || this.audioContext.state === 'closed') {
                this.audioContext = new AudioContext();
            }
            // On mobile, resume() is async — must await within the user
            // gesture scope so the context is actually running before we
            // route audio through it.
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            const source = this.audioContext.createMediaElementSource(this.recordedAudioEl);
            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = 256;
            source.connect(this.analyserNode);
            this.analyserNode.connect(this.audioContext.destination);
            waveformReady = true;
        } catch {
            // AudioContext / analyser setup failed — fall through to
            // play audio without waveform visualisation.
        }

        this.recordedAudioEl.onended = () => {
            this.stopWaveform();
            if (this.playbackRecordingUrl) {
                URL.revokeObjectURL(this.playbackRecordingUrl);
                this.playbackRecordingUrl = null;
            }
        };

        this.recordedAudioEl.play().catch(() => {
            new Notice(t('shadowing.playbackFailed'));
            this.stopWaveform();
        });
        if (waveformReady && this.analyserNode) {
            this.drawWaveform();
        }
    }

    private stopRecordingCleanup(): void {
        this.stopRecorderTimer();
        this.stopWaveform();
        if (this.mediaRecorder) {
            this.mediaRecorder.onstop = null;
            if (this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
            }
        }
        this.mediaRecorder = null;
        this.releaseMediaStream();
        if (this.playbackRecordingUrl) {
            URL.revokeObjectURL(this.playbackRecordingUrl);
            this.playbackRecordingUrl = null;
        }
        if (this.recordedAudioEl) {
            this.recordedAudioEl.pause();
            this.recordedAudioEl = null;
        }
        this.recordedBlob = null;
        this.recorderState = 'idle';
        this.recorderSeconds = 0;
    }

    private releaseMediaStream(): void {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(t => t.stop());
            this.mediaStream = null;
        }
    }

    private cleanupRecorder(): void {
        this.stopRecordingCleanup();
        this.recorderPanelEl = null;
        this.recorderCollapsedBtn = null;
        this.recorderExpandedEl = null;
    }

    // ═══════════════════════════════════════════════════════════
    // Guided Practice Integration
    // ═══════════════════════════════════════════════════════════

    private startGuidedPractice(block: TimestampBlock): void {
        // Stop any current recording or playback
        this.stopRecordingCleanup();

        // Clean up previous practice
        if (this.practice) {
            this.practice.cleanup();
        }

        this.practice = new ShadowingPractice({
            seekTo: (s: number) => this.seekTo(s),
            pauseMedia: () => this.pauseMedia(),
            playMedia: () => this.playMedia(),
            getMediaCurrentTime: () => this.getMediaCurrentTime(),
            getCurrentMedia: () => this.getCurrentMedia(),
            getYtPlayer: () => this.ytPlayer,
            getMediaType: () => this.mediaType,
            getCurrentMediaSrc: () => this.currentMediaSrc,
            startRecordingForPractice: () => this.startRecordingForPractice(),
            stopRecording: () => this.stopRecording(),
            getRecordedBlob: () => this.recordedBlob,
            extractOriginalAudioBuffer: (start: number, end: number) => this.extractOriginalAudioBuffer(start, end),
            refreshRecorderPanel: () => this.refreshRecorderPanel(),
            scoreRecording: (blob: Blob, originalText: string) => this.scoreRecording(blob, originalText),
            startWaveformOnCanvas: (canvas: HTMLCanvasElement) => this.startWaveformOnCanvas(canvas),
            stopWaveform: () => this.stopWaveform(),
        });

        // Highlight the selected block as active
        this.activeBlock = block;
        this.dictationPausedBlock = null;
        this.highlightNoteLine(block.lineIndex);
        this.updateActiveBlockUI();

        this.practice.startPractice(block);
    }

    private async startRecordingForPractice(): Promise<boolean> {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            new Notice(t('shadowing.micDenied'));
            console.error('[EME] Mic access denied:', err);
            return false;
        }

        this.recordedBlob = null;
        if (this.playbackRecordingUrl) {
            URL.revokeObjectURL(this.playbackRecordingUrl);
            this.playbackRecordingUrl = null;
        }
        if (this.recordedAudioEl) {
            this.recordedAudioEl.pause();
            this.recordedAudioEl = null;
        }

        const chunks: Blob[] = [];
        this.mediaRecorder = new MediaRecorder(this.mediaStream);
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };
        this.mediaRecorder.onstop = () => {
            const actualMime = this.mediaRecorder?.mimeType || 'audio/webm';
            this.recordedBlob = new Blob(chunks, { type: actualMime });
            this.releaseMediaStream();
            // Notify practice module that recording is complete
            if (this.practice) this.practice.onRecordingComplete();
        };

        this.mediaRecorder.start();
        this.recorderSeconds = 0;
        this.startRecorderTimer();
        return true;
    }

    private async extractOriginalAudioBuffer(startSec: number, endSec: number): Promise<Float32Array | null> {
        const src = this.currentMediaSrc;
        if (!src) return null;

        // YouTube: cannot extract raw audio from iframe
        if (this.mediaType === 'youtube') return null;

        // Bilibili cached locally: use blob URL
        if (this.bilibiliBlobUrl) {
            return this.decodeAudioSegment(this.bilibiliBlobUrl, startSec, endSec);
        }

        // Local video/audio file
        return this.decodeAudioSegment(src, startSec, endSec);
    }

    private async decodeAudioSegment(url: string, startSec: number, endSec: number): Promise<Float32Array | null> {
        try {
            // Reuse cached AudioBuffer if same source
            if (this.decodedAudioBuffer && this.decodedAudioBufferSrc === url) {
                return this.extractSegment(this.decodedAudioBuffer, startSec, endSec);
            }

            const MAX_FILE_BYTES = 50 * 1024 * 1024;

            // For vault files, check size via TFile.stat before reading anything
            let arrayBuffer: ArrayBuffer;
            if (this.detectedMediaFile) {
                if (this.detectedMediaFile.stat.size > MAX_FILE_BYTES) {
                    console.warn(`[EME] Local file too large (${Math.round(this.detectedMediaFile.stat.size / 1024 / 1024)}MB), skipping waveform extraction`);
                    return null;
                }
                arrayBuffer = await this.app.vault.readBinary(this.detectedMediaFile);
            } else {
                // Fallback: fetch for non-vault URLs (e.g. blob URLs)
                const response = await fetch(url);
                if (!response.ok) return null;
                const contentLength = response.headers.get('content-length');
                if (contentLength && parseInt(contentLength, 10) > MAX_FILE_BYTES) {
                    console.warn('[EME] File too large for waveform extraction, skipping');
                    return null;
                }
                arrayBuffer = await response.arrayBuffer();
                if (arrayBuffer.byteLength > MAX_FILE_BYTES) {
                    console.warn('[EME] Buffer too large for waveform extraction, skipping');
                    return null;
                }
            }

            const audioContext = new AudioContext();
            try {
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                // Guard: skip if decoded duration exceeds 30 minutes
                if (audioBuffer.duration > 1800) {
                    console.warn(`[EME] Decoded audio too long (${Math.round(audioBuffer.duration / 60)}min), skipping waveform extraction`);
                    return null;
                }

                // Cache for reuse
                this.decodedAudioBuffer = audioBuffer;
                this.decodedAudioBufferSrc = url;

                return this.extractSegment(audioBuffer, startSec, endSec);
            } finally {
                audioContext.close();
            }
        } catch (err) {
            console.warn('[EME] Failed to decode audio segment:', err);
            return null;
        }
    }

    private extractSegment(audioBuffer: AudioBuffer, startSec: number, endSec: number): Float32Array {
        const startSample = Math.floor(startSec * audioBuffer.sampleRate);
        const endSample = Math.floor(endSec * audioBuffer.sampleRate);
        const channelData = audioBuffer.getChannelData(0);
        const segment = channelData.slice(
            Math.max(0, startSample),
            Math.min(channelData.length, endSample)
        );
        return new Float32Array(segment);
    }

    private refreshRecorderPanel(): void {
        // Recorder panel is rendered as a child of contentEl, not playerOuterEl
        // Find the recorder wrap and replace it
        const existing = this.contentEl.querySelector('.lme-recorder-wrap');
        if (existing && existing.parentElement) {
            this.renderRecorderPanel(existing.parentElement);
            this.updateRecorderVisibilityForLearningMode();
        }
    }

    private async scoreRecording(blob: Blob, originalText: string): Promise<PronunciationScore | null> {
        const settings = this.plugin.settings as any;
        const r = AIService.resolveProvider(settings, 'aiScoring');
        const model = r.model || AIService.DEFAULT_GEMINI_MODEL;
        const locale: 'en' | 'zh' = 'zh';
        const geminiRec = (settings.aiProviders || []).find((p: any) => p.id === 'gemini');
        const geminiKey = (geminiRec && geminiRec.apiKey) || settings.geminiApiKey || '';
        const isGemini = r.kind === 'gemini' || r.baseUrl.includes('generativelanguage.googleapis.com');

        // 1. Gemini (native record or OpenAI-compat Gemini endpoint) → native multimodal API
        if (isGemini) {
            const key = r.apiKey || geminiKey;
            if (!key) {
                new Notice(t('shadowing.practiceScoreConfigure'));
                return null;
            }
            return AIService.scorePronunciation(blob, originalText, key, model, locale);
        }

        // 2. OpenAI-compatible provider → audio over chat/completions
        if (r.apiKey && r.baseUrl) {
            return AIService.scorePronunciationOpenAI(
                blob, originalText, r.baseUrl, r.apiKey, r.model || model, locale
            );
        }

        // 3. Active provider can't score audio (text-only/no key): fall back to a configured Gemini key
        if (geminiKey) {
            return AIService.scorePronunciation(blob, originalText, geminiKey, model, locale);
        }

        new Notice(t('shadowing.practiceScoreConfigure'));
        return null;
    }

    private rewind(seconds: number) {
        const media = this.getCurrentMedia();
        if (media) {
            const current = this.getMediaCurrentTime();
            this.setMediaCurrentTime(Math.max(0, current - seconds));
        } else if (this.ytPlayer) {
            const current = this.ytPlayer.getCurrentTime();
            this.ytPlayer.seekTo(Math.max(0, current - seconds), true);
        }
    }

    private setSpeed(rate: number) {
        const media = this.getCurrentMedia();
        if (media) {
            this.setMediaPlaybackRate(rate);
            new Notice(t('shadowing.speedChanged', { rate }));
        } else if (this.ytPlayer && this.ytPlayer.setPlaybackRate) {
            this.ytPlayer.setPlaybackRate(rate);
            new Notice(t('shadowing.speedChanged', { rate }));
        }
    }

    private onTimeUpdate = (currentTime: number) => {
        // 时间回跳(重播 / rewind / seek 回去)视为新的一轮 → 清空教学点"已弹"集合
        if (!this.loopSingleBlock && currentTime + 1 < this.lastTeachingUpdateTime) {
            this.teachingShown.clear();
        }
        this.lastTeachingUpdateTime = currentTime;

        // Forward to practice module for segment-end detection
        if (this.practice && this.practice.isActive()) {
            this.practice.onTimeUpdate(currentTime);
        }

        // Handle the selected block before auto-advancing activeBlock. In dictation,
        // crossing the end timestamp should pause the sentence the learner chose,
        // not silently switch to the next sentence first.
        if (this.activeBlock) {
            // ── Single-sentence loop: seek back to start when block ends ──
            if (this.loopSingleBlock && currentTime >= this.activeBlock.endSec) {
                this.seekTo(this.activeBlock.startSec);
                return;
            }

            // 社区免费版:视频讲解卡为完整版功能——播到讲解点暂停并弹一次付费引导
            // (每块每轮只弹一次;须早于影子/听写的末尾暂停并抑制它们)
            const hasPendingTeaching = !this.loopSingleBlock
                && !!this.activeBlock.teaching
                && !this.teachingShown.has(this.activeBlock.lineIndex);
            if (hasPendingTeaching && currentTime >= this.activeBlock.endSec) {
                this.teachingShown.add(this.activeBlock.lineIndex);
                this.pauseMedia();
                if (this.ytPlayer && this.ytPlayer.pauseVideo) this.ytPlayer.pauseVideo();
                new UpgradeModal(this.app, t('shadowing.teachingCard')).open();
                return;
            }

            // ── Shadowing mode: pause near buffer end (skip when looping / 待教学) ──
            if (this.shadowingMode && !this.loopSingleBlock && !hasPendingTeaching) {
                const buffer = this.plugin.settings.shadowingBufferMs / 1000;
                if (currentTime >= (this.activeBlock.endSec - buffer)) {
                    this.pauseMedia();
                    if (this.ytPlayer && this.ytPlayer.pauseVideo) this.ytPlayer.pauseVideo();
                    return;
                }
            }

            // ── Dictation mode: auto-pause when current block ends (skip when looping / 待教学) ──
            if (this.learningMode === 'dictation' &&
                !this.loopSingleBlock &&
                !hasPendingTeaching &&
                this.dictationPausedBlock !== this.activeBlock &&
                currentTime >= this.activeBlock.endSec) {
                this.dictationPausedBlock = this.activeBlock;
                this.pauseMedia();
                if (this.ytPlayer && this.ytPlayer.pauseVideo) this.ytPlayer.pauseVideo();
                return;
            }

            if (this.learningMode === 'dictation' &&
                !this.loopSingleBlock &&
                !hasPendingTeaching &&
                this.dictationPausedBlock === this.activeBlock &&
                currentTime >= this.activeBlock.endSec &&
                this.isMediaPaused()) {
                return;
            }
        }

        // When looping, lock activeBlock — only user click can change it
        if (!this.loopSingleBlock) {
            const block = this.findActiveBlockAtTime(currentTime);
            if (block && block !== this.activeBlock) {
                this.activeBlock = block;
                this.dictationPausedBlock = null;
                this.highlightNoteLine(block.lineIndex);
                this.updateActiveBlockUI();
            }
        }
    };

    private findActiveBlockAtTime(currentTime: number): TimestampBlock | null {
        for (let i = this.blocks.length - 1; i >= 0; i--) {
            const block = this.blocks[i];
            if (currentTime >= block.startSec) {
                return block;
            }
        }
        return null;
    }

    // 社区免费版:maybeShowTeaching/closeTeachingAndResume/replayTeachingBlock
    // 三个讲解卡浮层方法已随完整版移除;触发点改为上方付费引导。

    private async parseActiveNoteTimestamps(): Promise<void> {
        console.log('[EME] parseActiveNoteTimestamps() started');

        // 切换/重载笔记时清空教学点状态
        this.teachingShown.clear();

        // Use standard detection logic consistent with autoDetectVideo
        let file = this.file;
        if (!file) {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            file = view ? view.file : this.app.workspace.getActiveFile();

            if (!file) {
                const lastFiles = this.app.workspace.getLastOpenFiles();
                if (lastFiles && lastFiles.length > 0) {
                    const recentPath = lastFiles[0];
                    file = this.app.vault.getAbstractFileByPath(recentPath) as TFile;
                }
            }
        }

        if (!file || file.extension !== 'md') {
            console.log('[EME] No Markdown file for subtitle parsing');
            return;
        }

        this.file = file;
        let content = await this.app.vault.read(file);
        const yamlRegex = /^---\s*[\s\S]*?---\s*/;
        content = content.replace(yamlRegex, '');

        const lines = content.split('\n');
        // Match timestamps at line start, allowing any non-word prefix chars
        // Handles: [00:12], (01:23), {00:05}, 「00:12」, - 00:12, > 00:12, **00:12**, etc.
        const timestampRegex = /^\W*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/;
        const rawBlocks: { startSec: number; lineIndex: number; text: string; teaching?: string }[] = [];

        // 教学点开标记：主用 【小课堂】，兼容旧 ::teach
        const TEACH_MARKERS = ['【小课堂】', '::teach'];
        const findTeachMarker = (text: string): { idx: number; len: number } | null => {
            for (const m of TEACH_MARKERS) {
                const idx = text.indexOf(m);
                if (idx >= 0) return { idx, len: m.length };
            }
            return null;
        };

        // 教学点(::teach ... ::)两种写法都支持：
        //  (a) 独占行：`::teach` 单独一行，`::` 单独一行闭合
        //  (b) 内联：  `::teach` 贴字幕行尾，`::` 贴教学末行尾
        let teachingLines: string[] | null = null;
        let teachingTarget: { teaching?: string } | null = null;
        const flushTeaching = () => {
            if (teachingTarget && teachingLines && teachingLines.length) {
                teachingTarget.teaching = teachingLines.join('\n').trim();
            }
            teachingLines = null;
            teachingTarget = null;
        };

        lines.forEach((line, index) => {
            const trimmed = line.trim();

            // 已在教学块内 → 找闭合(:: 在行尾或独占一行)
            if (teachingLines !== null) {
                if (/::$/.test(trimmed)) {
                    const before = trimmed.slice(0, -2).trim();
                    if (before) teachingLines.push(before);
                    flushTeaching();
                } else {
                    teachingLines.push(line);
                }
                return;
            }

            // 时间戳行(可能内联教学标记)
            const match = line.match(timestampRegex);
            if (match) {
                let blockText = line.trim();
                const marker = findTeachMarker(blockText);
                let inlineAfter = '';
                if (marker) {
                    inlineAfter = blockText.slice(marker.idx + marker.len).trim();
                    blockText = blockText.slice(0, marker.idx).trim();
                }
                let totalSec = 0;
                if (match[1]) {
                    totalSec += parseInt(match[1]) * 3600;
                    totalSec += parseInt(match[2]) * 60;
                    totalSec += parseInt(match[3]);
                } else {
                    totalSec += parseInt(match[2]) * 60;
                    totalSec += parseInt(match[3]);
                }
                rawBlocks.push({ startSec: totalSec, lineIndex: index, text: blockText });
                if (marker) {
                    teachingLines = [];
                    teachingTarget = rawBlocks[rawBlocks.length - 1];
                    if (inlineAfter) {
                        if (/::$/.test(inlineAfter)) {
                            const before = inlineAfter.slice(0, -2).trim();
                            if (before) teachingLines.push(before);
                            flushTeaching();
                        } else {
                            teachingLines.push(inlineAfter);
                        }
                    }
                }
                return;
            }

            // 非时间戳、非教学内：独占行开标记(挂到上一条字幕)
            if (TEACH_MARKERS.includes(trimmed)) {
                teachingLines = [];
                teachingTarget = rawBlocks.length > 0 ? rawBlocks[rawBlocks.length - 1] : null;
            }
        });

        // 未闭合的 ::teach 兜底
        flushTeaching();

        let duration = 0;
        const mediaDuration = this.getMediaDuration();
        if (mediaDuration > 0) {
            duration = mediaDuration;
        } else if (this.ytPlayer && this.ytPlayer.getDuration) {
            duration = this.ytPlayer.getDuration();
        }

        // If no manual timestamps found, try loading matching SRT file
        if (rawBlocks.length === 0) {
            const srtBlocks = await this.tryLoadSrtSubtitles(file);
            if (srtBlocks.length > 0) {
                this.blocks = srtBlocks.map((block, i) => {
                    const nextBlock = srtBlocks[i + 1];
                    return {
                        ...block,
                        endSec: nextBlock ? nextBlock.startSec : (duration || block.startSec + 10)
                    };
                });
                console.log(`[EME] Loaded ${this.blocks.length} blocks from SRT`);
                this.renderBlocks();
                return;
            }
        }

        this.blocks = rawBlocks.map((block, i) => {
            const nextBlock = rawBlocks[i + 1];
            return {
                ...block,
                endSec: nextBlock ? nextBlock.startSec : (duration || block.startSec + 10)
            };
        });

        console.log(`[EME] Parsed ${this.blocks.length} subtitle blocks`);
        this.renderBlocks();
    }

    private renderBlocks(): void {
        if (!this.blocksContainer) return;
        this.blocksContainer.empty();
        this.blocksContainer.removeClass('is-shadowing', 'is-dictation');
        this.blocksContainer.removeClass('lme-dictation-workbench');
        this.blocksContainer.addClass(`is-${this.learningMode}`);
        this.contentEl.removeClass('lme-mode-shadowing', 'lme-mode-dictation');
        this.contentEl.addClass(`lme-mode-${this.learningMode}`);

        if (this.blocks.length === 0) {
            this.blocksContainer.createDiv({ text: t('shadowing.noBlocks'), cls: 'lme-no-blocks' });
            return;
        }

        if (this.learningMode === 'dictation') {
            this.renderDictationWorkbench();
            return;
        }

        this.blocks.forEach((block, index) => {
            const item = this.blocksContainer!.createDiv('lme-shadowing-item');
            item.dataset.index = index.toString();
            item.addClass(`lme-mode-${this.learningMode}`);
            if (block === this.activeBlock) item.addClass('active');
            if (this.learningMode === 'dictation' && this.submittedLines.has(index)) item.addClass('submitted');

            const timeStr = this.formatTime(block.startSec);
            const timeSpan = item.createSpan({ text: timeStr, cls: 'time' });
            const textContainer = item.createDiv('text');
            const sourcePath = this.file ? this.file.path : '';
            const rawText = block.text.replace(/^[\[{(]?\d{1,2}:\d{2}(?::\d{2})?(?:-\d{1,2}:\d{2}(?::\d{2})?)?[\]})]?\s*/, '').trim();

            MarkdownRenderer.renderMarkdown(rawText, textContainer, sourcePath, this);

            const seekHandler = (e: Event) => {
                console.log(`[EME] Seek to ${block.startSec}s requested via ${e.type}`);

                e.stopPropagation();

                if (Platform.isMobile) {
                    e.preventDefault();
                }

                // Update activeBlock immediately so loop targets the clicked block
                this.activeBlock = block;
                this.dictationPausedBlock = null;
                this.highlightNoteLine(block.lineIndex);
                this.updateActiveBlockUI();

                this.seekTo(block.startSec);
            };

            // Use onclick for all. On mobile, ontouchend provides faster response.
            timeSpan.onclick = seekHandler;
            if (Platform.isMobile) {
                timeSpan.ontouchend = seekHandler;
            }

            // ── Practice button (shadowing mode only) ──
            if (this.learningMode === 'shadowing') {
                const practiceBtn = item.createEl('button', {
                    cls: 'lme-practice-btn',
                    attr: { 'aria-label': t('shadowing.practiceBtn') }
                });
                setIcon(practiceBtn, 'mic');
                const practiceClickHandler = (e: Event) => {
                    e.stopPropagation();
                    if (Platform.isMobile) e.preventDefault();
                    this.startGuidedPractice(block);
                };
                practiceBtn.onclick = practiceClickHandler;
                if (Platform.isMobile) {
                    practiceBtn.ontouchend = practiceClickHandler;
                }
            }

            this.attachLookupHandlers(textContainer, block.text, block.lineIndex);

            // Mobile: rely on the floating lookup button from initMobileSupport()
            // instead of auto-triggering lookup via long-press
            if (Platform.isMobile) {
                const mobileHandler = (e: UIEvent) => {
                    const target = e.target as HTMLElement;
                    if (target.tagName === 'TEXTAREA' || target.closest('button')) {
                        return;
                    }
                    e.stopImmediatePropagation();
                    e.preventDefault();
                };
                textContainer.onclick = mobileHandler;
            } else {
                // Desktop regular click protection
                textContainer.onclick = (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                };
            }
        });
    }

    private attachLookupHandlers(target: HTMLElement, contextText: string, lineIndex: number): void {
        const runLookup = (e?: Event) => {
            if (e && Platform.isMobile) {
                e.stopImmediatePropagation();
                e.preventDefault();
            }

            const delay = Platform.isMobile ? 300 : 0;
            setTimeout(() => {
                try {
                    const selection = window.getSelection()?.toString().trim();
                    if (!selection) return;
                    const lookupPath = this.file ? this.file.path : '';
                    this.plugin.triggerLookup(selection, contextText, lookupPath, lineIndex);
                } catch (err) {
                    // Ignore transient selection errors from mobile/webview selection ranges.
                }
            }, delay);
        };

        target.onmouseup = (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                runLookup();
            }
        };
        target.ondblclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            runLookup();
        };
    }

    private renderDictationWorkbench(): void {
        if (!this.blocksContainer) return;
        this.blocksContainer.addClass('lme-dictation-workbench');

        let activeIndex = this.activeBlock ? this.blocks.indexOf(this.activeBlock) : -1;
        if (activeIndex < 0) {
            activeIndex = 0;
            this.activeBlock = this.blocks[0];
        }

        const activeBlock = this.blocks[activeIndex];
        const originalText = this.getCleanBlockText(activeBlock);
        const isSubmitted = this.submittedLines.has(activeIndex);
        const submittedAnswer = this.dictationSubmittedResults.get(activeIndex) || '';
        const answer = isSubmitted ? submittedAnswer : '';
        const submittedCount = this.submittedLines.size;

        const shell = this.blocksContainer.createDiv('lme-dictation-shell');

        const stage = shell.createDiv('lme-dictation-stage');
        const header = stage.createDiv('lme-dictation-current-header');
        const meta = header.createDiv('lme-dictation-meta');
        meta.createDiv({ cls: 'lme-dictation-kicker', text: t('shadowing.dictationCurrent') });
        meta.createDiv({
            cls: 'lme-dictation-title',
            text: t('shadowing.dictationSegmentTitle', {
                current: activeIndex + 1,
                total: this.blocks.length
            })
        });
        meta.createDiv({
            cls: 'lme-dictation-time',
            text: `${this.formatTime(activeBlock.startSec)} - ${this.formatTime(activeBlock.endSec)}`
        });

        const stats = header.createDiv('lme-dictation-mini-stats');
        stats.createDiv({ text: t('shadowing.dictationCompleted', { count: submittedCount, total: this.blocks.length }) });

        const actions = stage.createDiv('lme-dictation-actions');
        this.detachDictationPlaySync();
        this.createDictationAction(actions, 'skip-back', t('shadowing.dictationPrev'), () => this.selectDictationBlock(activeIndex - 1, true), activeIndex === 0);
        this.createDictationAction(actions, 'rotate-ccw', t('shadowing.dictationReplay'), () => this.replayCurrentBlock());
        const playBtn = this.createDictationAction(actions, this.isMediaPaused() ? 'play' : 'pause', t('shadowing.dictationPlayPause'), () => this.togglePlayback(), false, false, true);
        this.dictationPlayBtn = playBtn;
        this.attachDictationPlaySync();
        this.createDictationAction(actions, 'repeat', t('shadowing.dictationLoopSingle'), () => {
            this.toggleLoopSingle();
            this.renderBlocks();
        }, false, this.loopSingleBlock);
        this.createDictationAction(actions, 'skip-forward', t('shadowing.dictationNext'), () => this.selectDictationBlock(activeIndex + 1, true), activeIndex >= this.blocks.length - 1);

        const practiceGrid = stage.createDiv('lme-dictation-practice-grid');
        const inputPanel = practiceGrid.createDiv('lme-dictation-input-panel');
        inputPanel.createDiv({ cls: 'lme-dictation-panel-label', text: t('shadowing.dictationInputTitle') });
        const input = inputPanel.createEl('textarea', {
            cls: 'lme-dictation-input lme-dictation-main-input',
            attr: {
                placeholder: t('shadowing.dictationPlaceholder'),
                spellcheck: 'false'
            }
        });
        input.value = answer;
        const resize = () => {
            const minFloor = window.innerWidth <= 860 ? 84 : 132;
            input.style.height = 'auto';
            input.style.height = `${Math.max(input.scrollHeight, minFloor)}px`;
        };
        setTimeout(() => {
            resize();
            input.focus();
        }, 0);
        input.oninput = () => {
            resize();
            if (!isSubmitted) {
                renderDraftPreview();
            }
        };

        const footer = inputPanel.createDiv('lme-dictation-submit-row');
        const submitBtn = footer.createEl('button', {
            cls: 'lme-dictation-submit-btn lme-dictation-primary-submit',
            text: isSubmitted ? t('shadowing.dictationResubmit') : t('shadowing.dictationSubmit')
        });
        submitBtn.onclick = (e) => {
            e.stopPropagation();
            this.submitDictationBlock(activeIndex, input.value);
        };
        input.onkeydown = (e) => {
            if (e.key === ' ' && input.selectionStart === 0 && input.selectionEnd === 0 && input.value.trim() === '') {
                e.preventDefault();
                this.togglePlayback();
                return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitBtn.click();
            }
        };
        stage.onkeydown = (e) => {
            const target = e.target as HTMLElement;
            if (e.key === ' ' && target.tagName !== 'TEXTAREA' && target.tagName !== 'INPUT') {
                e.preventDefault();
                this.togglePlayback();
            }
        };
        stage.tabIndex = -1;

        const resultPanel = practiceGrid.createDiv('lme-dictation-result-panel');
        resultPanel.createDiv({
            cls: 'lme-dictation-panel-label',
            text: isSubmitted ? t('shadowing.dictationFeedbackTitle') : t('shadowing.dictationPreviewTitle')
        });
        const resultBody = resultPanel.createDiv('lme-dictation-result-body');
        const renderDraftPreview = () => {
            resultBody.empty();
            const latestDraft = this.dictationResults.get(activeIndex) || '';
            resultBody.createDiv({
                cls: `lme-dictation-live-preview ${latestDraft.trim() ? '' : 'is-empty'}`,
                text: latestDraft.trim() ? latestDraft : t('shadowing.dictationPreviewEmpty')
            });
        };
        if (isSubmitted) {
            this.renderDictationFeedback(originalText, submittedAnswer, resultBody, {
                lineIndex: activeBlock.lineIndex,
                revealOriginal: this.dictationRevealedAnswers.has(activeIndex),
                onRevealOriginal: () => {
                    this.dictationRevealedAnswers.add(activeIndex);
                    this.renderBlocks();
                }
            });
        } else {
            renderDraftPreview();
        }

        this.renderDictationHistory(stage, activeIndex);

        const summaryActions = stage.createDiv('lme-dictation-session-actions');
        if (isSubmitted) {
            const nextBtn = summaryActions.createEl('button', { cls: 'lme-dictation-next-btn', text: t('shadowing.dictationGoNext') });
            nextBtn.onclick = (e) => {
                e.stopPropagation();
                this.selectDictationBlock(activeIndex + 1, true);
            };
        }
        const finishBtn = summaryActions.createEl('button', { cls: 'lme-dictation-finish-btn', text: t('shadowing.dictationFinish') });
        finishBtn.onclick = (e) => {
            e.stopPropagation();
            this.showDictationSummary = true;
            this.renderBlocks();
            requestAnimationFrame(() => {
                const report = this.blocksContainer.querySelector('.lme-dictation-summary');
                if (report) report.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        };

        if (this.showDictationSummary || submittedCount === this.blocks.length) {
            this.renderDictationSummaryReport(shell);
        }
    }

    private renderDictationHistory(parent: HTMLElement, activeIndex: number): void {
        const submittedIndexes = Array.from(this.submittedLines).sort((a, b) => a - b);
        if (submittedIndexes.length === 0) return;

        const history = parent.createDiv('lme-dictation-history');
        history.createDiv({ cls: 'lme-dictation-panel-label', text: t('shadowing.dictationRecordsTitle') });
        const list = history.createDiv('lme-dictation-history-list');

        submittedIndexes.forEach(index => {
            const block = this.blocks[index];
            if (!block) return;

            const row = list.createDiv(`lme-dictation-history-row${index === activeIndex ? ' is-active' : ''}`);
            const timeBtn = row.createEl('button', {
                cls: 'lme-dictation-history-time',
                text: this.formatTime(block.startSec),
                attr: { 'aria-label': t('shadowing.dictationReplay') }
            });
            timeBtn.onclick = (e) => {
                e.stopPropagation();
                this.selectDictationBlock(index, true);
            };

            const record = row.createDiv('lme-dictation-history-record');
            const meta = record.createDiv('lme-dictation-history-meta');
            meta.createSpan({
                text: t('shadowing.dictationSegmentTitle', {
                    current: index + 1,
                    total: this.blocks.length
                })
            });
            meta.createSpan({
                text: t('shadowing.dictationAccuracy', {
                    score: this.dictationScores.get(index) ?? 0
                })
            });
            record.createDiv({
                cls: 'lme-dictation-history-text',
                text: this.dictationSubmittedResults.get(index) || t('shadowing.dictationPreviewEmpty')
            });
        });
    }

    private createDictationAction(parent: HTMLElement, icon: string, label: string, action: () => void, disabled = false, active = false, iconOnly = false): HTMLButtonElement {
        const btn = parent.createEl('button', {
            cls: `lme-dictation-action-btn${iconOnly ? ' is-icon-only' : ''}${active ? ' is-active' : ''}`,
            attr: { 'aria-label': label }
        });
        setIcon(btn, icon);
        if (!iconOnly) btn.createSpan({ text: label });
        btn.disabled = disabled;
        btn.onclick = (e) => {
            e.stopPropagation();
            if (!disabled) action();
        };
        return btn;
    }

    private selectDictationBlock(index: number, play: boolean): void {
        if (index < 0 || index >= this.blocks.length) {
            if (index >= this.blocks.length) {
                this.showDictationSummary = true;
                this.renderBlocks();
            }
            return;
        }
        this.activeBlock = this.blocks[index];
        this.dictationPausedBlock = null;
        this.highlightNoteLine(this.activeBlock.lineIndex);
        this.renderBlocks();
        if (play) this.seekTo(this.activeBlock.startSec);
    }

    private submitDictationBlock(index: number, userInput: string): void {
        const block = this.blocks[index];
        if (!block) return;

        this.dictationResults.set(index, userInput);
        this.dictationSubmittedResults.set(index, userInput);
        this.submittedLines.add(index);
        const { score } = this.calcAccuracy(this.getCleanBlockText(block), userInput);
        this.dictationScores.set(index, score);
        this.dictationRevealedAnswers.delete(index);
        this.showDictationSummary = this.submittedLines.size === this.blocks.length;
        this.renderBlocks();
    }

    private getCleanBlockText(block: TimestampBlock): string {
        return block.text.replace(/^[\[{(]?\d{1,2}:\d{2}(?::\d{2})?(?:-\d{1,2}:\d{2}(?::\d{2})?)?[\]})]?\s*/, '').trim();
    }

    private renderDictationSummaryReport(parent: HTMLElement): void {
        const report = parent.createDiv('lme-dictation-summary');
        const submittedIndexes = Array.from(this.submittedLines).sort((a, b) => a - b);
        const scores = submittedIndexes.map(i => this.dictationScores.get(i) ?? 0);
        const average = scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
        const weakIndexes = submittedIndexes.filter(i => (this.dictationScores.get(i) ?? 0) < 80);

        const head = report.createDiv('lme-dictation-summary-head');
        const titleWrap = head.createDiv();
        titleWrap.createDiv({ cls: 'lme-dictation-kicker', text: t('shadowing.dictationReportKicker') });
        titleWrap.createEl('h3', { text: t('shadowing.dictationReportTitle') });
        const scoreBadge = head.createDiv('lme-dictation-summary-score');
        scoreBadge.createSpan({ text: `${average}%` });
        scoreBadge.createEl('small', { text: t('shadowing.dictationAverage') });

        const metrics = report.createDiv('lme-dictation-summary-metrics');
        metrics.createDiv({ text: t('shadowing.dictationCompleted', { count: submittedIndexes.length, total: this.blocks.length }) });
        metrics.createDiv({ text: t('shadowing.dictationWeakCount', { count: weakIndexes.length }) });

        const weakList = report.createDiv('lme-dictation-weak-list');
        weakList.createDiv({ cls: 'lme-dictation-summary-label', text: t('shadowing.dictationWeakSentences') });
        if (weakIndexes.length === 0) {
            weakList.createDiv({ cls: 'lme-dictation-empty-note', text: t('shadowing.dictationNoWeakSentences') });
        } else {
            weakIndexes.slice(0, 8).forEach(index => {
                const item = weakList.createEl('button', {
                    cls: 'lme-dictation-weak-item',
                    text: t('shadowing.dictationWeakItem', {
                        index: index + 1,
                        score: this.dictationScores.get(index) ?? 0
                    })
                });
                item.onclick = (e) => {
                    e.stopPropagation();
                    this.selectDictationBlock(index, true);
                };
            });
        }

        const article = report.createDiv('lme-dictation-article-review');
        article.createDiv({ cls: 'lme-dictation-summary-label', text: t('shadowing.dictationArticleReview') });
        const originalFlow = article.createDiv('lme-dictation-original-flow');
        this.blocks.forEach((block, index) => {
            const original = this.getCleanBlockText(block);
            if (!this.submittedLines.has(index)) {
                const pending = originalFlow.createSpan({ cls: 'lme-dictation-article-pending', text: original });
                pending.setAttr('title', t('shadowing.dictationNotSubmitted'));
                this.attachLookupHandlers(pending, original, block.lineIndex);
                originalFlow.createSpan({ text: ' ' });
                return;
            }

            const userInput = this.dictationSubmittedResults.get(index) || '';
            const { origTokens, matchFlags } = this.calcAccuracy(original, userInput);
            origTokens.forEach((word, wordIndex) => {
                const wordEl = originalFlow.createSpan({ cls: 'lme-dictation-article-word', text: word });
                wordEl.addClass(matchFlags[wordIndex] ? 'correct' : 'wrong');
                this.attachLookupHandlers(wordEl, original, block.lineIndex);
                originalFlow.createSpan({ text: ' ' });
            });
        });

    }

    private renderDictationFeedback(
        originalText: string,
        userInput: string,
        feedbackWrapper: HTMLElement,
        options: { lineIndex?: number; revealOriginal?: boolean; onRevealOriginal?: () => void } = {}
    ) {
        feedbackWrapper.empty();
        const { score, origTokens, matchFlags, userTokens, userMatchFlags } = this.calcAccuracy(originalText, userInput);
        const tier = score >= 80 ? 'excellent' : score >= 50 ? 'good' : 'poor';
        const wrongCount = matchFlags.filter(matched => !matched).length;

        // ── Teacher comment card (handwriting style) ──
        const teacherCard = feedbackWrapper.createDiv('lme-dictation-teacher-card');
        teacherCard.addClass(`tier-${tier}`);

        const comment = teacherCard.createDiv('lme-dictation-comment');
        if (tier === 'excellent') {
            comment.createSpan({ text: t('shadowing.excellent') });
            comment.createEl('strong', { text: `${score}%` });
            comment.createSpan({ text: t('shadowing.excellentSuffix') });
        } else if (tier === 'good') {
            comment.createSpan({ text: t('shadowing.good') });
            comment.createEl('strong', { text: `${score}%` });
            comment.createSpan({ text: t('shadowing.goodSuffix') });
        } else {
            comment.createSpan({ text: t('shadowing.keepTrying') });
            comment.createEl('strong', { text: `${score}%` });
            comment.createSpan({ text: t('shadowing.keepTryingSuffix') });
        }

        const summary = teacherCard.createDiv('lme-dictation-feedback-summary');
        summary.createSpan({ text: t('shadowing.dictationAccuracy', { score }) });
        summary.createSpan({ text: t('shadowing.dictationMistakeCount', { count: wrongCount }) });

        const wordLine = teacherCard.createDiv({ cls: 'lme-dictation-word-line' });
        if (userTokens.length > 0) {
            userTokens.forEach((word, i) => {
                const w = wordLine.createSpan({ text: word, cls: 'lme-dictation-word' });
                w.addClass(userMatchFlags[i] ? 'correct' : 'wrong');
                if (i < userTokens.length - 1) wordLine.createSpan({ text: ' ' });
            });
        } else {
            wordLine.createSpan({ text: t('shadowing.dictationPreviewEmpty'), cls: 'lme-dictation-empty-answer' });
        }

        const revealRow = teacherCard.createDiv('lme-dictation-answer-row');
        const revealBtn = revealRow.createEl('button', {
            cls: 'lme-dictation-reveal-btn',
            text: options.revealOriginal ? t('shadowing.dictationAnswerShown') : t('shadowing.dictationRevealAnswer')
        });
        revealBtn.disabled = !!options.revealOriginal;
        revealBtn.onclick = (e) => {
            e.stopPropagation();
            options.onRevealOriginal?.();
        };

        if (options.revealOriginal) {
            const originalCard = feedbackWrapper.createDiv('lme-dictation-original-card');
            originalCard.createSpan({ text: t('shadowing.original'), cls: 'label' });
            const originalContent = originalCard.createDiv('content');
            MarkdownRenderer.renderMarkdown(originalText, originalContent, '', this);
            this.attachLookupHandlers(originalContent, originalText, options.lineIndex ?? 0);
        }
    }

    private calcAccuracy(original: string, userInput: string): {
        score: number;
        origTokens: string[];
        matchFlags: boolean[];
        userTokens: string[];
        userMatchFlags: boolean[];
    } {
        // Strip Markdown / HTML / timestamp formatting from the original
        const stripMarkdown = (s: string) => s
            .replace(/^[\[{(]?\d{1,2}:\d{2}(?::\d{2})?(?:-\d{1,2}:\d{2}(?::\d{2})?)?[\]})]?\s*/, '')  // timestamps at line start only
            .replace(/!\[.*?\]\(.*?\)/g, '')       // images
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
            .replace(/<[^>]+>/g, '')               // HTML tags
            .replace(/`[^`]*`/g, '')               // inline code
            .replace(/\*\*([^*]+)\*\*/g, '$1')     // **bold**
            .replace(/\*([^*]+)\*/g, '$1')         // *italic*
            .replace(/__([^_]+)__/g, '$1')         // __bold__
            .replace(/_([^_]+)_/g, '$1')           // _italic_
            .replace(/~~([^~]+)~~/g, '$1')         // ~~strike~~
            .replace(/#+\s*/g, '')                 // headings
            .replace(/[-*]\s+/g, '');              // list markers

        // Normalise a word: lowercase, strip surrounding punctuation
        const clean = (w: string) => w.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');

        const origTokens = stripMarkdown(original).split(/\s+/).filter(Boolean);
        const userTokens = userInput.split(/\s+/).filter(Boolean);

        // Bag-of-words: build a frequency map of user words
        const userBag = new Map<string, number>();
        userTokens.forEach(w => {
            const k = clean(w);
            if (k) userBag.set(k, (userBag.get(k) ?? 0) + 1);
        });

        // For each original word, check if user "used" it (consume from bag to handle duplicates)
        const matchFlags = origTokens.map(w => {
            const k = clean(w);
            if (!k) return true; // skip punctuation-only tokens
            const count = userBag.get(k) ?? 0;
            if (count > 0) { userBag.set(k, count - 1); return true; }
            return false;
        });

        const origBag = new Map<string, number>();
        origTokens.forEach(w => {
            const k = clean(w);
            if (k) origBag.set(k, (origBag.get(k) ?? 0) + 1);
        });
        const userMatchFlags = userTokens.map(w => {
            const k = clean(w);
            if (!k) return true;
            const count = origBag.get(k) ?? 0;
            if (count > 0) { origBag.set(k, count - 1); return true; }
            return false;
        });

        const correct = matchFlags.filter(Boolean).length;
        const denominator = origTokens.filter(w => clean(w)).length;
        const score = denominator > 0 ? Math.round((correct / denominator) * 100) : 100;
        return { score, origTokens, matchFlags, userTokens, userMatchFlags };
    }

    private updateActiveBlockUI(): void {
        if (!this.blocksContainer) return;
        if (this.learningMode === 'dictation') {
            this.renderBlocks();
            return;
        }
        const items = this.blocksContainer.querySelectorAll('.lme-shadowing-item');
        items.forEach(item => item.removeClass('active'));
        const activeIndex = this.blocks.indexOf(this.activeBlock!);
        if (activeIndex !== -1) {
            const activeEl = items[activeIndex] as HTMLElement;
            if (activeEl) {
                activeEl.addClass('active');
                if (this.learningMode === 'dictation') {
                    this.scrollActiveBlockIntoPreferredPosition(activeEl, 0.24);
                    const textarea = activeEl.querySelector('.lme-dictation-input') as HTMLTextAreaElement;
                    if (textarea && !this.submittedLines.has(activeIndex)) {
                        setTimeout(() => textarea.focus(), 300);
                    }
                } else {
                    this.scrollActiveBlockIntoPreferredPosition(activeEl, 0.10);
                }
            }
        }
    }

    private scrollActiveBlockIntoPreferredPosition(activeEl: HTMLElement, viewportRatio: number): void {
        if (!this.blocksContainer) return;
        const container = this.blocksContainer;
        const containerRect = container.getBoundingClientRect();
        const activeRect = activeEl.getBoundingClientRect();
        const targetTop = container.scrollTop + activeRect.top - containerRect.top - (container.clientHeight * viewportRatio);
        container.scrollTo({
            top: Math.max(0, targetTop),
            behavior: 'smooth'
        });
    }

    private formatTime(seconds: number): string {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    private highlightNoteLine(lineIndex: number): void {
        if (this.learningMode !== 'shadowing') return;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const editor = view.editor;
        editor.setCursor(lineIndex, 0);
        editor.scrollIntoView({ from: { line: lineIndex, ch: 0 }, to: { line: lineIndex, ch: 0 } }, true);
        const editorEl = view.contentEl.querySelector('.cm-content');
        if (editorEl) {
            editorEl.querySelectorAll('.lme-active-line').forEach(el => el.removeClass('lme-active-line'));
            const activeLine = editorEl.querySelector('.cm-activeLine');
            if (activeLine) activeLine.addClass('lme-active-line');
        }
    }


    public getMediaSource(): string | null {
        return this.currentMediaSrc;
    }
    public async seekTo(seconds: number) {
        if (!this.currentMediaSrc) await this.autoDetectVideo();
        // Clear the dictation pause guard so the block can play again after seeking
        this.dictationPausedBlock = null;
        const media = this.getCurrentMedia();
        if (media) {
            this.setMediaCurrentTime(seconds);
            this.playMedia();
        } else if (this.ytPlayer && this.ytPlayer.seekTo) {
            this.ytPlayer.seekTo(seconds, true);
            this.ytPlayer.playVideo();
        }
    }


    // ============================================================
    // Video Bookmarks
    // ============================================================

    private registerBookmarkShortcut(): void {
        const shortcut = this.plugin.settings.bookmarkShortcut || 'Ctrl+Shift+B';
        const parts = shortcut.toLowerCase().split('+');
        const needCtrl = parts.includes('ctrl') || parts.includes('mod');
        const needShift = parts.includes('shift');
        const needAlt = parts.includes('alt');
        const key = parts[parts.length - 1];

        this.bookmarkKeyHandler = (e: KeyboardEvent) => {
            const ctrlMatch = needCtrl ? (e.ctrlKey || e.metaKey) : !e.ctrlKey && !e.metaKey;
            const shiftMatch = needShift ? e.shiftKey : !e.shiftKey;
            const altMatch = needAlt ? e.altKey : !e.altKey;

            if (ctrlMatch && shiftMatch && altMatch && e.key.toLowerCase() === key) {
                e.preventDefault();
                e.stopPropagation();
                // 社区免费版:视频标注为完整版功能,弹付费引导
                new UpgradeModal(this.app, t('shadowing.btnBookmark')).open();
            }
        };
        // Use capture phase to intercept before other handlers
        document.addEventListener('keydown', this.bookmarkKeyHandler, true);
    }

    private unregisterBookmarkShortcut(): void {
        if (this.bookmarkKeyHandler) {
            document.removeEventListener('keydown', this.bookmarkKeyHandler, true);
            this.bookmarkKeyHandler = null;
        }
    }

// 社区免费版:视频标注(截图书签/定点跳回)后端已随完整版移除,
    // 入口按钮与快捷键保留,点击时弹 UpgradeModal 付费引导。

    // ============================================================
    // Subtitle Download & Insertion
    // ============================================================

    private async fetchAndInsertSubtitles(): Promise<void> {
        // 社区免费版:视频笔记每周配额校验(生成视频笔记与工坊下载共用本入口)
        if (!checkSubtitleWeeklyQuota(this.app)) return;
        const file = this.file || this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') {
            new Notice(t('shadowing.noActiveNote'));
            return;
        }

        const content = await this.app.vault.read(file);

        // Detect video source using existing regex patterns
        const biliFullRegex = /(?:https?:\/\/)?(?:www\.)?bilibili\.com\/video\/((?:BV[a-zA-Z0-9]{10})|(?:av[0-9]+))[^\s]*/i;
        const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i;

        let subtitles: { startSec: number; text: string }[] = [];
        let videoLineIndex = -1;
        const lines = content.split('\n');

        // Find video URL line and detect source type
        const biliMatch = content.match(biliFullRegex);
        const ytMatch = content.match(ytRegex);

        try {
            if (biliMatch) {
                const bvid = biliMatch[1];
                const fullUrl = biliMatch[0];
                videoLineIndex = lines.findIndex(line => biliFullRegex.test(line));
                new Notice(t('shadowing.downloadingBilibiliSub'));
                subtitles = await this.fetchBilibiliSubtitles(bvid, fullUrl);
            } else if (ytMatch) {
                const videoId = ytMatch[1];
                videoLineIndex = lines.findIndex(line => ytRegex.test(line));
                new Notice(t('shadowing.downloadingYoutubeSub'));
                subtitles = await this.fetchYouTubeSubtitles(videoId);
            } else {
                new Notice(t('shadowing.noVideoLink'));
                return;
            }
        } catch (error) {
            console.error('[EME] Subtitle fetch failed:', error);
            new Notice(error instanceof Error ? error.message : t('shadowing.subDownloadFailed'));
            return;
        }

        if (subtitles.length === 0) {
            new Notice(t('shadowing.noSubtitles'));
            return;
        }

        // Merge short subtitle blocks into natural sentence chunks
        const merged = this.mergeSubtitleBlocks(subtitles);
        console.log(`[EME] Subtitles: ${subtitles.length} raw → ${merged.length} merged`);

        // Format subtitles as [MM:SS] text lines
        const formatted = merged.map(s => {
            const totalSec = Math.floor(s.startSec);
            const hours = Math.floor(totalSec / 3600);
            const minutes = Math.floor((totalSec % 3600) / 60);
            const seconds = totalSec % 60;
            if (hours > 0) {
                return `[${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}] ${s.text}`;
            }
            return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}] ${s.text}`;
        }).join('\n');

        // Ensure every generated subtitle note has the canonical properties.
        const metadata = ytMatch
            ? await this.fetchVideoMetadata(`https://www.youtube.com/watch?v=${ytMatch[1]}`)
            : { link: biliMatch?.[0] || '' };
        await this.ensureSubtitleNoteFrontmatter(file, metadata);
        const latestContent = await this.app.vault.read(file);
        // Insert into note
        await this.insertSubtitlesIntoNote(file, latestContent, formatted, videoLineIndex);
        // 社区免费版:字幕成功写入笔记后消耗本周配额(失败/无字幕路径不计数)
        recordSubtitleDownload();
        new Notice(t('shadowing.subtitlesDownloaded', { raw: subtitles.length, merged: merged.length }));
    }

    /**
     * Merge short subtitle blocks into natural sentence chunks.
     * Rules:
     * - Accumulate blocks until hitting a sentence-ending punctuation (. ! ?)
     * - Flush at sentence boundaries if >= 5s accumulated (minimum)
     * - Force flush if accumulated time exceeds 10s (maximum)
     */
    /**
     * Clean noise from a raw subtitle block before merging.
     * Removes speaker markers (>>), stray >, HTML entities, and collapses whitespace.
     */
    private cleanSubtitleText(text: string): string {
        return text
            .replace(/&gt;/g, '>')
            .replace(/&lt;/g, '<')
            .replace(/&amp;/g, '&')
            .replace(/&#39;|&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&nbsp;/g, ' ')
            .replace(/&[#\w]+;/g, '')
            .replace(/>+/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private mergeSubtitleBlocks(raw: { startSec: number; text: string }[]): { startSec: number; text: string }[] {
        if (raw.length === 0) return [];

        const SENTENCE_END = /[.!?。！？—…]$/;
        const MIN_DURATION_SEC = 5;
        const MAX_DURATION_SEC = 10;

        const result: { startSec: number; text: string }[] = [];
        const batchTexts: string[] = [];
        let batchStart = raw[0].startSec;

        const flush = (nextStart?: number) => {
            if (batchTexts.length === 0) return;
            result.push({ startSec: batchStart, text: batchTexts.join(' ') });
            batchTexts.length = 0;
            if (nextStart !== undefined) batchStart = nextStart;
        };

        for (let i = 0; i < raw.length; i++) {
            const current = raw[i];
            const next = i < raw.length - 1 ? raw[i + 1] : null;
            const nextStart = next ? next.startSec : undefined;
            const elapsed = next ? (next.startSec - batchStart) : 0;
            const text = this.cleanSubtitleText(current.text);
            const isSentenceEnd = SENTENCE_END.test(text);

            if (!text) continue;

            batchTexts.push(text);

            if (elapsed > MAX_DURATION_SEC) {
                // Hard limit: force flush regardless of sentence boundary
                flush(nextStart);
            } else if (isSentenceEnd && elapsed >= MIN_DURATION_SEC) {
                // Sentence boundary + enough time — flush
                flush(nextStart);
            }
        }

        // Flush remaining
        flush();

        return result;
    }

    // ============================================================
    // YouTube Subtitle via InnerTube API
    // (based on stable reference: obsidian-rss-dashboard-transcript)
    // ============================================================

    /**
     * Fetch YouTube subtitles using InnerTube API.
     * 1. requestUrl to fetch watch page → extract INNERTUBE_API_KEY
     * 2. requestUrl POST to /youtubei/v1/player with ANDROID context
     * 3. Extract caption tracks → fetch subtitle XML → parse
     */
    private async fetchYouTubeSubtitles(videoId: string): Promise<{ startSec: number; text: string }[]> {
        // Step 1: Fetch YouTube page HTML and extract InnerTube API key
        let pageResp;
        try {
            pageResp = await fetchWithRetry(() => requestUrl({
                url: `https://www.youtube.com/watch?v=${videoId}`,
                method: 'GET',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml',
                },
            }));
        } catch (e: any) {
            if (e?.status === 429) {
                throw new Error(t('shadowing.youtubeRateLimit'));
            }
            throw new Error(t('shadowing.youtubeNoAccess'));
        }

        const apiKeyMatch = pageResp.text.match(/"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/);
        if (!apiKeyMatch || apiKeyMatch.length < 2) {
            if (pageResp.text.includes('class="g-recaptcha"')) {
                throw new Error(t('shadowing.youtubeIpBlocked'));
            }
            throw new Error(t('shadowing.youtubeApiKeyFailed'));
        }

        console.log(`[EME] YouTube API key extracted: ${apiKeyMatch[1].substring(0, 10)}...`);

        // Step 2: POST to InnerTube player endpoint with ANDROID client context
        let playerResp;
        try {
            playerResp = await fetchWithRetry(() => requestUrl({
                url: `https://www.youtube.com/youtubei/v1/player?key=${apiKeyMatch[1]}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    context: {
                        client: {
                            clientName: 'ANDROID',
                            clientVersion: '20.10.38',
                        },
                    },
                    videoId,
                }),
            }));
        } catch (e: any) {
            if (e?.status === 429) {
                throw new Error(t('shadowing.youtubeRateLimit'));
            }
            throw new Error(t('shadowing.youtubePlayerApiFailed'));
        }

        const playerData = JSON.parse(playerResp.text);

        // Step 3: Check playability status
        this.checkYouTubePlayability(playerData);

        // Step 4: Extract caption tracks
        const captionsData = playerData?.captions?.playerCaptionsTracklistRenderer;
        if (!captionsData?.captionTracks || captionsData.captionTracks.length === 0) {
            throw new Error(t('shadowing.youtubeNoSubtitles'));
        }

        console.log(`[EME] YouTube: found ${captionsData.captionTracks.length} caption track(s): ${
            captionsData.captionTracks.map((t: any) => `${t.name?.simpleText || t.languageCode}(${t.languageCode})`).join(', ')
        }`);

        // Select track by matching current active language, fallback to English, then first
        const track = this.selectYouTubeTrack(captionsData.captionTracks);
        const subtitleUrl = (track.baseUrl || '').replace(
            /\\u([0-9a-fA-F]{4})/g,
            (_match: string, hex: string) => String.fromCharCode(parseInt(hex, 16))
        );
        if (!subtitleUrl) {
            throw new Error(t('shadowing.youtubeSubtitleUrlFailed'));
        }

        let xmlResp;
        try {
            xmlResp = await fetchWithRetry(() => requestUrl({
                url: subtitleUrl,
                method: 'GET',
                headers: {
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            }));
        } catch (e: any) {
            if (e?.status === 429) {
                throw new Error(t('shadowing.youtubeSubtitleRateLimit'));
            }
            throw new Error(t('shadowing.youtubeSubtitleFetchFailed'));
        }

        if (!xmlResp.text || xmlResp.text.length === 0) {
            throw new Error(t('shadowing.youtubeSubtitleEmpty'));
        }

        // Step 6: Parse XML
        return this.parseYouTubeXml(xmlResp.text);
    }

    /** Check YouTube player response playability status. */
    private checkYouTubePlayability(playerData: any): void {
        const status = playerData?.playabilityStatus?.status;
        if (!status || status === 'OK') return;

        const reason = playerData?.playabilityStatus?.reason || '';

        if (status === 'LOGIN_REQUIRED') {
            if (reason.includes('not a bot')) {
                throw new Error(t('shadowing.youtubeBotDetected'));
            }
            if (reason.includes('inappropriate')) {
                throw new Error(t('shadowing.youtubeAgeRestricted'));
            }
            throw new Error(t('shadowing.youtubeLoginRequired'));
        }

        if (status === 'ERROR') {
            if (reason.includes('unavailable')) {
                throw new Error(t('shadowing.youtubeUnavailable'));
            }
            throw new Error(t('shadowing.youtubeLoadError', { reason }));
        }

        if (status === 'UNPLAYABLE') {
            const runs = playerData?.playabilityStatus?.errorScreen
                ?.playerErrorMessageRenderer?.subreason?.runs || [];
            const subreasons = runs.map((r: any) => r.text || '').join(' ');
            throw new Error(t('shadowing.youtubeUnplayable', { reason: subreasons || reason || t('common.unknownError') }));
        }
    }

    /** Parse YouTube subtitle XML. Supports both <text> and <p> tag formats. */
    private parseYouTubeXml(xml: string): { startSec: number; text: string }[] {
        const results: { startSec: number; text: string }[] = [];

        // Try <text> tag format (most common)
        const textRegex = /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
        let match;
        while ((match = textRegex.exec(xml)) !== null) {
            const startSec = parseFloat(match[1]);
            const rawText = match[3];
            const cleanText = this.cleanSubtitleHtml(rawText);
            if (cleanText) {
                results.push({ startSec, text: cleanText });
            }
        }

        // Fallback: try <p> tag format (alternative format)
        if (results.length === 0) {
            const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
            while ((match = pRegex.exec(xml)) !== null) {
                const startMs = parseInt(match[1], 10);
                const rawText = match[3];
                const cleanText = this.cleanSubtitleHtml(rawText);
                if (cleanText) {
                    results.push({ startSec: startMs / 1000, text: cleanText });
                }
            }
        }

        return results;
    }

    private async fetchBilibiliSubtitles(bvid: string, fullUrl?: string): Promise<{ startSec: number; text: string }[]> {
        // Step 1: Get video info (cid, pages)
        let infoResp;
        try {
            infoResp = await fetchWithRetry(() => requestUrl({
                url: `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
                method: 'GET',
                headers: {
                    'Referer': 'https://www.bilibili.com',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }));
        } catch (e: any) {
            if (e?.status === 429) {
                throw new Error(t('shadowing.bilibiliRateLimit'));
            }
            throw new Error(t('shadowing.bilibiliApiFailed'));
        }

        const infoData = infoResp.json;
        if (infoData.code !== 0) {
            throw new Error(infoData.message || t('shadowing.bilibiliApiError'));
        }

        // Parse page number from URL (?p=2) for multi-part videos
        let pageNum = 1;
        if (fullUrl) {
            const pMatch = fullUrl.match(/[?&]p=(\d+)/i);
            if (pMatch) {
                pageNum = parseInt(pMatch[1]);
            }
        }

        // Get correct cid for the requested page
        let cid = infoData.data.cid;
        const pages = infoData.data.pages || [];
        if (pageNum > 1 && pages.length >= pageNum) {
            cid = pages[pageNum - 1].cid;
            console.log(`[EME] Multi-part video: using page ${pageNum}, cid=${cid}`);
        }

        // Build common headers, include SESSDATA cookie if configured
        const commonHeaders: Record<string, string> = {
            'Referer': 'https://www.bilibili.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        if (this.plugin.settings.bilibiliSessdata) {
            commonHeaders['Cookie'] = `SESSDATA=${this.plugin.settings.bilibiliSessdata}`;
        }

        // Step 2: Get subtitle list — try multiple approaches
        let subtitles: any[] | null = null;

        // Approach 1: /x/v2/dm/view (original, works on desktop with cookies)
        try {
            const dmResp = await fetchWithRetry(() => requestUrl({
                url: `https://api.bilibili.com/x/v2/dm/view?oid=${cid}&type=1&bvid=${bvid}`,
                method: 'GET',
                headers: commonHeaders
            }));
            const dmData = dmResp.json;
            const subs = dmData?.data?.subtitle?.subtitles;
            if (subs && subs.length > 0) {
                subtitles = subs;
                console.log(`[EME] dm/view: found ${subs.length} subtitle track(s)`);
            }
        } catch (e: any) {
            if (e?.status === 429) {
                throw new Error(t('shadowing.bilibiliRateLimit'));
            }
            console.warn('[EME] dm/view failed, trying fallback...', e.message);
        }

        // Approach 2: /x/player/v2 (alternative player API)
        if (!subtitles) {
            try {
                const playerResp = await fetchWithRetry(() => requestUrl({
                    url: `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`,
                    method: 'GET',
                    headers: commonHeaders
                }));
                const playerData = playerResp.json;
                const subs = playerData?.data?.subtitle?.subtitles;
                if (subs && subs.length > 0) {
                    subtitles = subs;
                    console.log(`[EME] player/v2: found ${subs.length} subtitle track(s)`);
                }
            } catch (e: any) {
                console.warn('[EME] player/v2 failed, trying page scrape...', e.message);
            }
        }

        // Approach 3: Scrape video page HTML for embedded subtitle data
        if (!subtitles) {
            try {
                console.log('[EME] Trying page scrape for subtitle data...');
                const pageResp = await fetchWithRetry(() => requestUrl({
                    url: `https://www.bilibili.com/video/${bvid}${pageNum > 1 ? '?p=' + pageNum : ''}`,
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'text/html',
                    }
                }));
                const html = pageResp.text || '';

                // Extract subtitle info from embedded JSON: "subtitle":{"subtitles":[...]}
                const subtitleMatch = html.match(/"subtitle"\s*:\s*\{[^}]*"subtitles"\s*:\s*(\[[\s\S]*?\])\s*[\]}]/);
                if (subtitleMatch) {
                    try {
                        const parsed = JSON.parse(subtitleMatch[1]);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            subtitles = parsed;
                            console.log(`[EME] page scrape: found ${parsed.length} subtitle track(s)`);
                        }
                    } catch (parseErr) {
                        console.warn('[EME] Failed to parse scraped subtitle JSON');
                    }
                }

                // Alternative: try to find subtitle_url directly
                if (!subtitles || subtitles.length === 0) {
                    const urlMatch = html.match(/"subtitle_url"\s*:\s*"(\/\/[^"]+\.json)"/);
                    if (urlMatch) {
                        const rawUrl = urlMatch[1].replace(/\\u002F/g, '/').replace(/\\u0026/g, '&');
                        subtitles = [{ lan: 'unknown', lan_doc: 'Scraped', subtitle_url: rawUrl }];
                        console.log('[EME] page scrape: found subtitle_url directly');
                    }
                }
            } catch (e: any) {
                console.warn('[EME] page scrape failed:', e.message);
            }
        }

        if (!subtitles || subtitles.length === 0) {
            const hint = t('shadowing.bilibiliNoSubtitles');
            throw new Error(hint);
        }

        console.log(`[EME] Found ${subtitles.length} subtitle track(s): ${subtitles.map((s: any) => `${s.lan_doc}(${s.lan})`).join(', ')}`);

        // Select subtitle by matching current active language, fallback to English, then first
        const subtitle = this.selectBilibiliSubtitle(subtitles);
        let subtitleUrl: string = subtitle.subtitle_url;
        if (subtitleUrl.startsWith('//')) {
            subtitleUrl = 'https:' + subtitleUrl;
        }
        // Handle http:// URLs
        if (subtitleUrl.startsWith('http://')) {
            subtitleUrl = subtitleUrl.replace('http://', 'https://');
        }

        // Step 3: Fetch subtitle JSON
        const subResp = await requestUrl({ url: subtitleUrl, method: 'GET', headers: commonHeaders });
        const subData = subResp.json;

        // Parse JSON body: [{from: 0.27, to: 3.48, content: "text"}]
        const results: { startSec: number; text: string }[] = [];
        const body = subData.body || [];
        for (const item of body) {
            const startSec = typeof item.from === 'number' ? item.from : parseFloat(item.from);
            const rawText = item.content || '';
            const cleanText = this.cleanSubtitleHtml(rawText);
            if (cleanText.trim()) {
                results.push({ startSec, text: cleanText.trim() });
            }
        }

        return results;
    }

    /** Get ISO 639-1 code for the current active language setting. */
    private getActiveLangCode(): string {
        const lang = this.plugin.settings.activeLanguage;
        const codes: Record<string, string> = {
            english: 'en', german: 'de', french: 'fr', spanish: 'es',
            korean: 'ko', russian: 'ru', japanese: 'ja',
        };
        return codes[lang] || 'en';
    }

    /** Select YouTube caption track matching current language, fallback to English, then first. */
    private selectYouTubeTrack(tracks: any[]): any {
        const target = this.getActiveLangCode();
        const exact = tracks.find(t => t.languageCode === target);
        if (exact) return exact;
        // Handle locale variants: e.g. target='en' matches 'en-US', 'en-GB'
        const prefix = tracks.find(t => t.languageCode?.startsWith(target + '-'));
        if (prefix) return prefix;
        // Fallback to English
        if (target !== 'en') {
            const enTrack = tracks.find(t => t.languageCode === 'en' || t.languageCode?.startsWith('en-'));
            if (enTrack) return enTrack;
        }
        return tracks[0];
    }

    /** Select Bilibili subtitle track matching current language, fallback to English, then first. */
    private selectBilibiliSubtitle(subtitles: any[]): any {
        const target = this.getActiveLangCode();
        // Bilibili lan field: 'en', 'zh-CN', 'ja', 'ko', 'de', 'fr', etc.
        const exact = subtitles.find(s => s.lan === target);
        if (exact) return exact;
        const prefix = subtitles.find(s => s.lan?.startsWith(target + '-'));
        if (prefix) return prefix;
        if (target !== 'en') {
            const enSub = subtitles.find(s => s.lan === 'en' || s.lan?.startsWith('en-'));
            if (enSub) return enSub;
        }
        // For Chinese learners, zh-CN/zh-Hans is often useful as secondary
        if (target !== 'zh') {
            const zhSub = subtitles.find(s => s.lan?.startsWith('zh'));
            if (zhSub) return zhSub;
        }
        return subtitles[0];
    }

    private cleanSubtitleHtml(text: string): string {
        return text
            // Strip HTML tags
            .replace(/<[^>]+>/g, '')
            // Decode common HTML entities
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
            // Normalize whitespace
            .replace(/\s+/g, ' ')
            .trim();
    }

    private async insertSubtitlesIntoNote(
        file: TFile,
        currentContent: string,
        formatted: string,
        videoLineIndex: number
    ): Promise<void> {
        const lines = currentContent.split('\n');
        const subtitleSectionHeader = '## Subtitles';
        const subtitleBlock = `\n${subtitleSectionHeader}\n\n${formatted}\n`;

        // Check if ## Subtitles section already exists
        const existingSectionStart = lines.findIndex(line => line.trim() === subtitleSectionHeader);
        if (existingSectionStart !== -1) {
            // Find the end of the existing subtitle section
            // Section ends at next heading (## or #) or end of file
            let sectionEnd = existingSectionStart + 1;
            while (sectionEnd < lines.length) {
                const line = lines[sectionEnd].trim();
                if (line.startsWith('## ') || line.startsWith('# ')) {
                    break;
                }
                sectionEnd++;
            }

            // Replace existing section
            const newLines = [
                ...lines.slice(0, existingSectionStart),
                subtitleSectionHeader,
                '',
                ...formatted.split('\n'),
                ...lines.slice(sectionEnd)
            ];
            await this.app.vault.modify(file, newLines.join('\n'));
        } else {
            // ALWAYS INSERT AT THE END OF THE DOCUMENT
            const insertIndex = lines.length;
            const newLines = [
                ...lines.slice(0, insertIndex),
                subtitleBlock,
                ...lines.slice(insertIndex)
            ];
            await this.app.vault.modify(file, newLines.join('\n'));
        }

        // Refresh subtitle blocks in shadowing view
        await this.parseActiveNoteTimestamps();
    }

    private async ensureSubtitleNoteFrontmatter(file: TFile, metadata: SubtitleNoteMetadata): Promise<void> {
        const content = await this.app.vault.read(file);
        if (/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/.test(content)) return;
        await this.app.vault.modify(file, `${buildSubtitleNoteFrontmatter(metadata)}\n\n${content}`);
    }

    // ============================================================
    // AI Analysis (跟读工坊 AI 智能解析)
    // ============================================================

    private async runAIAnalysis(): Promise<void> {
        console.log('[EME] runAIAnalysis() called');
        if (this.blocks.length === 0) {
            console.log('[EME] No blocks available');
            new Notice(t('shadowing.downloadSubFirst'));
            return;
        }

        const settings = this.plugin.settings;
        if (!AIService.resolveProvider(settings, 'docAnalysis').apiKey) {
            console.log('[EME] No API key configured');
            new Notice(t('shadowing.configureApiKey'));
            return;
        }

        // Collect all prompts: built-in + custom
        const allPrompts = [...BUILTIN_PROMPTS, ...(settings.aiPrompts || [])];

        if (allPrompts.length === 1) {
            // Only one prompt available, run directly
            this.executeAnalysis(allPrompts[0].content, { name: allPrompts[0].name, isBuiltIn: !!allPrompts[0].isBuiltIn });
        } else {
            // Show prompt selection modal
            const modal = new PromptSelectModal(this.app, allPrompts, (selected) => {
                this.executeAnalysis(selected.content, { name: selected.name, isBuiltIn: !!selected.isBuiltIn });
            });
            modal.open();
        }
    }

    private async executeAnalysis(promptContent: string, promptMeta?: { name: string; isBuiltIn: boolean }): Promise<void> {
        const settings = this.plugin.settings;
        console.log('[EME] executeAnalysis called');
        const notice = new Notice(t('shadowing.aiGenerating'), 0);

        try {
            console.log('[EME] Calling AIService.analyzeSubtitles with', this.blocks.length, 'blocks');
            const ai = AIService.resolveProvider(settings, 'docAnalysis');
            let failedChunks = 0;
            const markdown = await AIService.analyzeSubtitles(
                this.blocks,
                ai.provider,
                ai.apiKey,
                ai.model,
                settings.englishLevel,
                promptContent,
                settings.aiProviders,
                (done, total) => {
                    if (total > 1 && notice.messageEl) {
                        const current = Math.min(done + 1, total);
                        notice.messageEl.setText(`${t('shadowing.aiGenerating')} (${current}/${total})`);
                    }
                },
                () => { failedChunks++; }
            );
            console.log('[EME] Analysis completed, markdown length:', markdown.length);

            // Open AI Analysis view in right sidebar
            console.log('[EME] Activating AI analysis view');
            await this.plugin.activateView(AI_ANALYSIS_VIEW_TYPE, 'right');

            // Find the view and send the result
            const leaves = this.app.workspace.getLeavesOfType(AI_ANALYSIS_VIEW_TYPE);
            console.log('[EME] Found leaves of type', AI_ANALYSIS_VIEW_TYPE, ':', leaves.length);
            if (leaves.length > 0) {
                const aiView = leaves[0].view as any;
                if (aiView.setResult) {
                    aiView.setResult(markdown, this.leaf, promptMeta);
                }
            }

            notice.hide();
            if (failedChunks > 0) {
                new Notice(`⚠️ ${failedChunks} 段分析失败,已返回成功部分(详见控制台)`, 8000);
            } else {
                new Notice(t('shadowing.aiDone'));
            }
        } catch (error) {
            notice.hide();
            console.error('[EME] AI analysis failed:', error);
            new Notice(error instanceof Error ? error.message : t('shadowing.aiFailed'));
        }
    }

    private renderAIResultPanel(markdown: string): void {
        if (!this.blocksContainer) return;
        this.blocksContainer.empty();

        // Panel wrapper
        const panel = this.blocksContainer.createDiv('lme-ai-panel');

        // Header
        const header = panel.createDiv('lme-ai-panel-header');
        const title = header.createDiv('lme-ai-panel-title');
        setIcon(title, 'lightbulb');
        title.createSpan({ text: t('shadowing.aiPanelTitle') });

        const closeBtn = header.createEl('button', { cls: 'lme-ai-panel-close' });
        setIcon(closeBtn, 'x');
        closeBtn.onclick = () => {
            panel.remove();
            this.renderBlocks();
        };

        // Body - render markdown
        const body = panel.createDiv('lme-ai-panel-body');
        MarkdownRenderer.render(this.app, markdown, body, '', this);

        // Make timestamps clickable
        this.makeTimestampsClickable(body);

        // Enhance table styling
        this.enhanceTables(body);

        // Footer
        const footer = panel.createDiv('lme-ai-panel-footer');
        const saveBtn = footer.createEl('button', { cls: 'lme-ai-save-btn', text: t('shadowing.saveToNote') });
        saveBtn.onclick = () => this.saveAIResultToNote(markdown);

        const closeBtn2 = footer.createEl('button', { cls: 'lme-ai-close-btn', text: t('common.close') });
        closeBtn2.onclick = () => {
            panel.remove();
            this.renderBlocks();
        };
    }

    private enhanceTables(container: HTMLElement) {
        const tables = container.querySelectorAll('table');
        tables.forEach(table => {
            table.classList.add('lme-ai-timeline-table');
        });
    }

    private makeTimestampsClickable(container: HTMLElement): void {
        // Walk all text nodes and replace [MM:SS] patterns with clickable spans
        const walk = (el: HTMLElement) => {
            const children = Array.from(el.childNodes);
            for (const child of children) {
                if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.textContent || '';
                    const tsRegex = /\[(\d{1,2}):(\d{2})\]/g;
                    if (!tsRegex.test(text)) continue;
                    tsRegex.lastIndex = 0;

                    const fragment = document.createDocumentFragment();
                    let lastIndex = 0;
                    let match;
                    while ((match = tsRegex.exec(text)) !== null) {
                        // Text before match
                        if (match.index > lastIndex) {
                            fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
                        }
                        // Clickable timestamp
                        const sec = parseInt(match[1]) * 60 + parseInt(match[2]);
                        const span = document.createElement('span');
                        span.className = 'lme-ai-timestamp';
                        span.textContent = match[0];
                        span.onclick = () => this.seekTo(sec);
                        fragment.appendChild(span);
                        lastIndex = tsRegex.lastIndex;
                    }
                    // Remaining text
                    if (lastIndex < text.length) {
                        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
                    }
                    el.replaceChild(fragment, child);
                } else if (child instanceof HTMLElement) {
                    walk(child);
                }
            }
        };
        walk(container);
    }

    private async saveAIResultToNote(markdown: string): Promise<void> {
        const file = this.file || this.app.workspace.getActiveFile();
        if (!file) return;

        const settings = this.plugin.settings;
        const dateStr = new Date().toISOString().slice(0, 10);

        // Extract topic from markdown content (first heading or first line)
        const topicSlug = this.extractTopicSlug(markdown);
        const reportFileName = `${t('shadowing.aiReportPrefix')}_${topicSlug}_${dateStr}`;
        const noteBaseName = file.basename;

        // Determine report folder
        const reportFolder = settings.aiReportFolder
            ? settings.aiReportFolder
            : file.parent?.path || '';

        const reportPath = reportFolder
            ? `${reportFolder}/${reportFileName}.md`
            : `${reportFileName}.md`;

        // Ensure folder exists
        if (reportFolder) {
            const folderExists = await this.app.vault.adapter.exists(reportFolder);
            if (!folderExists) {
                await this.app.vault.adapter.mkdir(reportFolder);
            }
        }

        // Build report content with backlink to source note
        const reportContent = `${t('shadowing.aiReportTitle', { note: noteBaseName, date: dateStr })}${markdown}\n`;

        // Check if report file already exists, append suffix if needed
        let finalPath = reportPath;
        let counter = 1;
        while (await this.app.vault.adapter.exists(finalPath)) {
            finalPath = reportFolder
                ? `${reportFolder}/${reportFileName}_${counter}.md`
                : `${reportFileName}_${counter}.md`;
            counter++;
        }

        await this.app.vault.create(finalPath, reportContent);

        // Insert backlink in the subtitle note
        const content = await this.app.vault.read(file);
        const lines = content.split('\n');
        const reportBasename = finalPath.replace(/\.md$/, '').split('/').pop() || reportFileName;

        const calloutBlock = [
            '',
            t('shadowing.aiReportCalloutTip', { unwrap: true }),
            t('shadowing.aiReportCalloutLink', { basename: reportBasename }),
            '',
        ];

        const subIdx = lines.findIndex(l => l.trim() === '## Subtitles');
        let newLines: string[];

        if (subIdx !== -1) {
            // Remove existing AI callout if present
            const hasCallout = lines.slice(subIdx + 1, subIdx + 5).some(l => l.includes(t('shadowing.aiReportCalloutTip', { unwrap: true })));
            if (hasCallout) {
                // Find and remove the old callout block
                let calloutStart = -1;
                let calloutEnd = -1;
                for (let i = subIdx + 1; i < Math.min(subIdx + 6, lines.length); i++) {
                    if (lines[i].includes(t('shadowing.aiReportCalloutTip', { unwrap: true }))) {
                        if (calloutStart === -1) {
                            // Go back to find the empty line before callout
                            calloutStart = i > 0 && lines[i - 1].trim() === '' ? i - 1 : i;
                        }
                        calloutEnd = i + 1;
                        // Skip trailing empty line
                        if (calloutEnd < lines.length && lines[calloutEnd].trim() === '') {
                            calloutEnd++;
                        }
                        break;
                    }
                }
                if (calloutStart !== -1 && calloutEnd !== -1) {
                    newLines = [
                        ...lines.slice(0, calloutStart),
                        ...lines.slice(calloutEnd),
                    ];
                    // Recalculate subIdx after removal
                    const newSubIdx = newLines.findIndex(l => l.trim() === '## Subtitles');
                    if (newSubIdx !== -1) {
                        newLines = [
                            ...newLines.slice(0, newSubIdx + 1),
                            ...calloutBlock,
                            ...newLines.slice(newSubIdx + 1),
                        ];
                    }
                } else {
                    newLines = [...lines];
                }
            } else {
                newLines = [
                    ...lines.slice(0, subIdx + 1),
                    ...calloutBlock,
                    ...lines.slice(subIdx + 1),
                ];
            }
        } else {
            // No Subtitles section, append at end
            newLines = [...lines, ...calloutBlock];
        }

        await this.app.vault.modify(file, newLines.join('\n'));
        new Notice(t('shadowing.aiReportSaved', { name: reportBasename }));
    }

    private extractTopicSlug(markdown: string): string {
        // Try to extract from first ## heading
        const headingMatch = markdown.match(/^##\s+(.+)$/m);
        if (headingMatch) {
            const heading = headingMatch[1].trim().replace(/[^一-鿿\w\s-]/g, '').trim();
            if (heading) return heading.slice(0, 12);
        }

        // Try to extract from first <h1> or <b> tag
        const htmlMatch = markdown.match(/<(?:h1|h2|b)[^>]*>([^<]+)</);
        if (htmlMatch) {
            const text = htmlMatch[1].trim().replace(/[^一-鿿\w\s-]/g, '').trim();
            if (text) return text.slice(0, 12);
        }

        // Fallback: first non-empty line
        const firstLine = markdown.split('\n').find(l => l.trim())?.trim() || t('shadowing.aiReportTag');
        return firstLine.replace(/[^一-鿿\w\s-]/g, '').trim().slice(0, 12) || t('shadowing.aiReportTag');
    }
}

// ============================================================
// Prompt Selection Modal
// ============================================================

export class PromptSelectModal extends FuzzySuggestModal<PromptTemplate> {
    private prompts: PromptTemplate[];
    private onSelect: (prompt: PromptTemplate) => void;

    constructor(app: any, prompts: PromptTemplate[], onSelect: (prompt: PromptTemplate) => void) {
        super(app);
        this.prompts = prompts;
        this.onSelect = onSelect;
        this.setPlaceholder(t('shadowing.selectPrompt'));
    }

    getItems(): PromptTemplate[] {
        return this.prompts;
    }

    getItemText(item: PromptTemplate): string {
        const displayName = item.isBuiltIn ? t('prompts.' + item.name) : item.name;
	        return item.isBuiltIn ? displayName + t('shadowing.builtinTag') : displayName;
    }

    onChooseItem(item: PromptTemplate, evt: MouseEvent | KeyboardEvent): void {
        this.onSelect(item);
    }
}

export class FileSelectModal extends FuzzySuggestModal<TFile> {
    private files: TFile[];
    private onSelect: (file: TFile) => void;

    constructor(app: App, onSelect: (file: TFile) => void) {
        super(app);
        this.files = app.vault.getMarkdownFiles();
        this.onSelect = onSelect;
        this.setPlaceholder(t('shadowing.selectDoc'));
    }

    getItems(): TFile[] {
        return this.files;
    }

    getItemText(item: TFile): string {
        return item.path;
    }

    onChooseItem(item: TFile, evt: MouseEvent | KeyboardEvent): void {
        this.onSelect(item);
    }
}
