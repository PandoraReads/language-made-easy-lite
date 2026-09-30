/**
 * Language Made Easy - Unified Dictionary Service
 * Supports multiple languages (English, German, French, Spanish)
 * Includes lemmatization for better word lookup
 *
 * @ts-nocheck
 */

import { Platform, requestUrl, Notice } from 'obsidian';
import type { DictResult, LMESettings, MdxDictionary } from '../models';
import { MDXEngine } from '../core/MDXEngine';
import { t } from '../i18n';

const ONLINE_DICT_TIMEOUT_MS = 8000;

async function requestUrlWithTimeout(options: Parameters<typeof requestUrl>[0], timeoutMs = ONLINE_DICT_TIMEOUT_MS): Promise<Awaited<ReturnType<typeof requestUrl>>> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('Dictionary request timed out')), timeoutMs);
    });

    try {
        return await Promise.race([requestUrl(options), timeout]);
    } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
    }
}

// Cache for lemmatization results (improves performance)
const LEMMA_CACHE = new Map<string, unknown[]>();

// MDX Engine instances for each language
const mdxEngines: Record<string, {
    engine: MDXEngine | null;
    mdxPath: string;
    mddPath: string;
    cssPath: string;
}> = {};

/**
 * Get MDX dictionaries for specific language (up to 5 from new format)
 */
function getLanguageMDXPaths(language: string, settings: LMESettings): MdxDictionary[] {
    // 桌面路径条目(data.json)+ 移动端导入条目(每设备 localStorage 注册表)合并。
    // 注册表条目 missing(OPFS 数据被系统驱逐)时跳过,避免每次查词都弹丢失提示;
    // data.json 里偶发的 store 条目(3.2.0 遗留/同步时差)一并纳入,启动迁移会清掉。
    const pathDicts = (settings.localDictionaries?.[language] || [])
        .filter(d => d.mdxPath || d.source === 'store');
    if (pathDicts.length > 0) {
        return pathDicts;
    }

    // Fallback: read legacy flat fields
    const lang = language;
    const mdxPath = (settings as unknown)[`${lang}MdxPath`] || '';
    const mddPath = (settings as unknown)[`${lang}MddPath`] || '';
    const cssPath = (settings as unknown)[`${lang}MdxCssPath`] || '';
    const mdxPath2 = (settings as unknown)[`${lang}MdxPath2`] || '';
    const mddPath2 = (settings as unknown)[`${lang}MddPath2`] || '';
    const cssPath2 = (settings as unknown)[`${lang}MdxCssPath2`] || '';

    const dicts: MdxDictionary[] = [];
    if (mdxPath) {
        dicts.push({
            id: `${lang}_dict1`,
            name: mdxPath.split('/').pop()?.replace(/\.mdx$/i, '') || 'Dictionary 1',
            mdxPath,
            mddPath: mddPath || '',
            cssPath: cssPath || '',
        });
    }
    if (mdxPath2) {
        dicts.push({
            id: `${lang}_dict2`,
            name: mdxPath2.split('/').pop()?.replace(/\.mdx$/i, '') || 'Dictionary 2',
            mdxPath: mdxPath2,
            mddPath: mddPath2 || '',
            cssPath: cssPath2 || '',
        });
    }
    return dicts;
}

/**
 * Query MDX dictionary for a specific language
 * Tries all configured dictionaries, returns first successful result
 */
async function queryMDX(word: string, language: string, settings: LMESettings): Promise<DictResult> {
    const allDicts = getLanguageMDXPaths(language, settings);

    for (let i = 0; i < allDicts.length; i++) {
        try {
            const result = await querySingleMDX(word, language, allDicts[i]);
            if (result) return result;
        } catch (e) {
            console.warn(`[LME] ${allDicts[i].name} failed for "${word}":`, e.message);
        }
    }

    throw new Error(t('errors.mdxNotFound', { word }));
}

/**
 * Query a single MDX dictionary
 */
async function querySingleMDX(word: string, language: string, dict: MdxDictionary): Promise<DictResult> {
    if (!dict.mdxPath) {
        throw new Error(`Dictionary not configured`);
    }

    const engineKey = dict.id;
    if (!mdxEngines[engineKey]) {
        mdxEngines[engineKey] = {
            engine: null,
            mdxPath: '',
            mddPath: '',
            cssPath: ''
        };
    }

    const langEngine = mdxEngines[engineKey];

    // Re-init if paths changed
    if (!langEngine.engine ||
        langEngine.mdxPath !== dict.mdxPath ||
        langEngine.mddPath !== (dict.mddPath || '') ||
        langEngine.cssPath !== (dict.cssPath || '')) {

        langEngine.engine = new MDXEngine(dict.mdxPath, dict.mddPath || undefined, dict.cssPath || undefined);
        langEngine.mdxPath = dict.mdxPath;
        langEngine.mddPath = dict.mddPath || '';
        langEngine.cssPath = dict.cssPath || '';
        await langEngine.engine.load();
    }

    const html = await langEngine.engine.lookup(word);
    if (!html) {
        throw new Error(`Word "${word}" not found`);
    }

    return {
        word,
        phonetic: '',
        definition: html,
        srcMdx: dict.mdxPath,
        style: langEngine.engine.getCSS() ?? '',
        explains: [],
        partOfSpeech: '',
        dictionaryIndex: 0,
        dictId: dict.id,
        dictName: dict.name,
    };
}

/**
 * Get MDX resource (for audio, images, etc.)
 * If dictId is provided, search that specific engine first.
 * Fallback: try all loaded engines.
 */
export async function getMDXResource(path: string, language: string = 'english', dictId?: string): Promise<unknown | null> {
    // ── 桌面路径:精确 dictId 优先,再遍历全部已加载引擎 ──
    if (dictId && mdxEngines[dictId]?.engine) {
        const buffer = await mdxEngines[dictId].engine.getResource(path);
        if (buffer) return buffer;
    }

    // Fallback: try all loaded engines
    for (const entry of Object.values(mdxEngines)) {
        if (entry?.engine) {
            const buffer = await entry.engine.getResource(path);
            if (buffer) return buffer;
        }
    }
    return null;
}

// Audio cache to improve performance
const audioCache = new Map<string, HTMLAudioElement>();
const audioBlobCache = new Map<string, string>();

/**
 * Preload audio for faster playback (call this when displaying results)
 * Uses multiple TTS sources for speed optimization
 */
export function preloadAudio(word: string, language: string = 'english'): void {
    const cacheKey = `${language}:${word}`;

    // Skip if already cached
    if (audioCache.has(cacheKey)) {
        console.debug(`[LME Audio] Already cached: ${word} (${language})`);
        return;
    }

    console.debug(`[LME Audio] Preloading: ${word} (${language})`);

    try {
        // Use fast TTS sources with fallbacks
        const ttsUrls: Record<string, string[]> = {
            english: [
                // Youdao (fastest for English in China)
                `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`,
                // Baidu (backup)
                `https://fanyi.baidu.com/gettts?lan=en&text=${encodeURIComponent(word)}&spd=3&source=web`
            ],
        };

        const urls = ttsUrls[language] || ttsUrls.english;
        const audioUrl = urls[0]; // Use first (fastest) URL

        const audio = new Audio(audioUrl);

        // Force preload to start immediately
        audio.preload = 'auto';

        // Trigger data loading immediately
        audio.load();

        // Cache immediately
        audioCache.set(cacheKey, audio);

        // Set up error handler with fallback.
        // Preload failures are expected (offline, region-blocked TTS sources)
        // and harmless — playback has its own fallback chain — so keep this
        // path at debug level to avoid console noise on every lookup.
        audio.onerror = (e) => {
            console.debug('[LME Audio] Preload error:', audio.error);

            // Try fallback URL if available
            if (urls.length > 1 && !audioCache.has(`${cacheKey}_fallback`)) {
                console.debug(`[LME Audio] Trying fallback URL for ${word}`);
                try {
                    const fallbackAudio = new Audio(urls[1]);
                    fallbackAudio.preload = 'auto';
                    fallbackAudio.load();
                    audioCache.set(`${cacheKey}_fallback`, fallbackAudio);
                    audioCache.set(cacheKey, fallbackAudio); // Replace failed audio
                } catch (fallbackError) {
                    console.debug('[LME Audio] Fallback also failed:', fallbackError);
                    audioCache.delete(cacheKey);
                }
            } else {
                audioCache.delete(cacheKey);
            }
        };

        console.debug(`[LME Audio] Preload started: ${word} (${language})`);
    } catch (e) {
        console.debug('[LME Audio] Preload failed:', e);
    }
}

/**
 * Play audio for a word or path
 * Domestic (China) Version: Optimized for mobile with fallback strategy
 */
export async function playAudio(source: string, languageOrPath: string | boolean = 'english', isPath: boolean = false, dictId?: string): Promise<void> {
    // Handle backward compatibility: playAudio(word, isPath)
    let language: string;
    if (typeof languageOrPath === 'boolean') {
        isPath = languageOrPath;
        language = 'english';
    } else {
        language = languageOrPath;
    }

    const startTime = Date.now();
    console.debug(`[LME Audio] playAudio called: word="${source}", language="${language}", isPath=${isPath}", dictId=${dictId}`);

    try {
        let audioUrl: string;
        const cacheKey = `${language}:${source}`;

        if (isPath) {
            // Local MDX Sound - check cache first
            if (audioBlobCache.has(cacheKey)) {
                audioUrl = audioBlobCache.get(cacheKey)!;
                console.debug('[LME Audio] Using cached blob URL');
            } else {
                console.debug('[LME Audio] Loading MDX sound:', source);
                const buffer = await getMDXResource(source, language, dictId);
                if (buffer) {
                    // Detect MIME type from file extension
                    const ext = source.toLowerCase().split('.').pop() || '';
                    const mimeMap: Record<string, string> = {
                        mp3: 'audio/mpeg',
                        wav: 'audio/wav',
                        ogg: 'audio/ogg',
                        oga: 'audio/ogg',
                        m4a: 'audio/mp4',
                        aac: 'audio/aac',
                        wma: 'audio/x-ms-wma',
                        speex: 'audio/speex',
                        spx: 'audio/speex',
                    };
                    const mimeType = mimeMap[ext] || 'audio/mpeg';
                    console.debug('[LME Audio] Resource loaded, MIME:', mimeType, 'size:', buffer.length);
                    const blob = new Blob([buffer], { type: mimeType });
                    audioUrl = URL.createObjectURL(blob);
                    audioBlobCache.set(cacheKey, audioUrl);
                    console.debug('[LME Audio] Created and cached blob URL');
                } else {
                    console.error('[LME Audio] MDX resource not found for path:', source, 'language:', language);
                    throw new Error(t('errors.mdxResourceNotFound'));
                }
            }
        } else {
            // ═══════════════════════════════════════════════════════════════
            // ONLINE TTS - DOMESTIC (CHINA) OPTIMIZED STRATEGY
            // ═══════════════════════════════════════════════════════════════

            // STRATEGY 1: Try Web Speech API (browser built-in, no network needed)
            console.debug('[LME Audio] Trying Web Speech API (browser built-in)...');
            // STRATEGY 1: Use online TTS services directly (ensure female voice)
            console.debug('[LME Audio] Using online TTS service directly');
            let audio = audioCache.get(cacheKey);

            if (!audio) {
                console.debug('[LME Audio] Not preloaded, creating now...');

                // Build TTS URLs with fallbacks (DOMESTIC OPTIMIZED)
                const ttsUrls: Record<string, string[]> = {
                    english: [
                        // Youdao (fastest for English in China, female voice)
                        `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(source)}&type=0`,
                        // Baidu (backup, female voice)
                        `https://fanyi.baidu.com/gettts?lan=en&text=${encodeURIComponent(source)}&spd=3&source=web`
                    ],
                };

                const urls = ttsUrls[language] || ttsUrls.english;
                audioUrl = urls[0]; // Use first (fastest) URL

                audio = new Audio(audioUrl);
                audio.preload = 'auto';

                // Force load immediately
                audio.load();

                audioCache.set(cacheKey, audio);

                // Set up error handler with fallback
                audio.onerror = (e) => {
                    console.error('[LME Audio] Playback error:', audio!.error);

                    // Try fallback URL if available
                    if (urls.length > 1) {
                        console.debug(`[LME Audio] Trying fallback URL`);
                        try {
                            const fallbackAudio = new Audio(urls[1]);
                            fallbackAudio.preload = 'auto';
                            fallbackAudio.load();
                            audioCache.set(cacheKey, fallbackAudio);
                            fallbackAudio.play().catch(console.error);
                        } catch (fallbackError) {
                            console.error('[LME Audio] Fallback also failed:', fallbackError);
                            audioCache.delete(cacheKey);
                        }
                    } else {
                        audioCache.delete(cacheKey);
                    }
                };
            } else {
                console.debug('[LME Audio] Using preloaded/cached audio');
            }

            // Reset to beginning if needed
            if (audio.currentTime > 0) {
                audio.currentTime = 0;
            }

            // Play immediately (even if still loading)
            console.debug('[LME Audio] Starting playback...');
            const playPromise = audio.play();

            if (playPromise) {
                await playPromise.catch(e => {
                    console.error('[LME Audio] Play failed:', e);
                    throw e;
                });
            }

            const elapsed = Date.now() - startTime;
            console.debug(`[LME Audio] ✅ Playing after ${elapsed}ms`);

            return;
        }

        // MDX audio path handling
        if (!audioUrl) {
            throw new Error('No audio URL generated');
        }

        const audio = new Audio(audioUrl);
        audio.play().catch(e => {
            console.error('[LME Audio] MDX play failed:', e);
        });

        const elapsed = Date.now() - startTime;
        console.debug(`[LME Audio] MDX audio playing after ${elapsed}ms`);

    } catch (e) {
        console.error('[LME Audio] Exception:', e);
    }
}

/**
 * Try using Web Speech API (browser built-in TTS)
 * Supports multiple languages without network requests
 * Returns true if successful, false otherwise
 */
async function tryWebSpeechAPI(word: string, language: string): Promise<boolean> {
    try {
        // Check if SpeechSynthesis API is available
        if (!('speechSynthesis' in window) && !('webkitSpeechSynthesis' in window)) {
            console.debug('[LME Audio] Web Speech API not available in this browser');
            return false;
        }

        const synth = window.speechSynthesis || (window as unknown).webkitSpeechSynthesis;
        if (!synth) {
            console.debug('[LME Audio] SpeechSynthesis not accessible');
            return false;
        }

        // Map language codes for Web Speech API
        const langCodes: Record<string, string> = {
            english: 'en-US',
        };

        const langCode = langCodes[language] || 'en-US';
        console.debug(`[LME Audio] Using Web Speech API with language: ${langCode}`);

        // Create utterance
        const utterance = new SpeechSynthesisUtterance(word);
        utterance.lang = langCode;
        utterance.rate = 0.9; // Slightly slower for better clarity
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Try to select a voice that matches the language
        const voices = synth.getVoices();
        if (voices && voices.length > 0) {
            // Find a voice matching the language
            const matchingVoice = voices.find(voice => voice.lang.startsWith(langCode));
            if (matchingVoice) {
                utterance.voice = matchingVoice;
                console.debug(`[LME Audio] Selected voice: ${matchingVoice.name} (${matchingVoice.lang})`);
            }
        }

        // Create a promise to track completion
        return new Promise<boolean>((resolve) => {
            utterance.onend = () => {
                console.debug('[LME Audio] ✅ Web Speech API playback completed');
                resolve(true);
            };

            utterance.onerror = (event) => {
                console.error('[LME Audio] Web Speech API error:', event);
                resolve(false);
            };

            // Start speaking
            synth.speak(utterance);

            // Wait a bit and resolve (it's async but we want to return quickly)
            window.setTimeout(() => {
                resolve(true); // Assume success if no immediate error
            }, 100);
        });

    } catch (e) {
        console.error('[LME Audio] Web Speech API exception:', e);
        return false;
    }
}

/**
 * Multi-source lookup with streaming results
 *
 * Results are delivered via onResult callback as soon as each source completes.
 * Also returns a Promise that resolves when ALL tasks are done (for final actions).
 *
 * Sources (all run in parallel):
 *   1. MDX Dictionary 1 (if configured)
 *   2. MDX Dictionary 2 (if configured)
 *   3. Online Dictionary (always):
 *      - User's preferred dict first, then fallbacks
 */
export function lookupMulti(
    word: string,
    language: string,
    settings: LMESettings,
    onResult?: (result: DictResult) => void
): Promise<DictResult[]> {
    console.debug(`[LME] Looking up "${word}" in ${language}`);

    const completedResults: DictResult[] = [];
    const lookupTasks: Promise<void>[] = [];

    // ──── Preload audio in parallel ────
    preloadAudio(word, language);

    const allDicts = getLanguageMDXPaths(language, settings);
    console.debug(`[LME] Dictionary configs:`, allDicts.map(d => d.name));

    // Helper: emit a result immediately
    const emit = (result: DictResult) => {
        if (result.definition && result.definition.trim().length > 0) {
            completedResults.push(result);
            onResult?.(result);
        }
    };

    // ──── Ordered lookup: local MDX first, then online fallback ────
    lookupTasks.push(
        (async () => {
            for (const dict of allDicts) {
                try {
                    const result = await querySingleMDX(word, language, dict);
                    console.debug(`[LME] Found in ${dict.name}`);
                    emit(result);
                } catch (e: unknown) {
                    console.debug(`[LME] ${dict.name} failed: ${e.message}`);
                }
            }

            const onlineEnabledKey = `${language}OnlineDictEnabled` as keyof LMESettings;
            const shouldUseOnline = Platform.isMobile || settings[onlineEnabledKey] !== false;
            if (!shouldUseOnline) {
                console.debug(`[LME] Online dictionary disabled for ${language} on desktop`);
                return;
            }

            // Get user's preferred online dict for current language
            const onlineDictKey = `${language}OnlineDict` as keyof LMESettings;
            const defaultDict = 'youdao-free';
            const preferred = (settings[onlineDictKey] as string) || defaultDict;

            // Build ordered list of online dicts: preferred first, then others as fallback
            const available = ['youdao-free', 'google-free', 'mymemory-free'];
            const ordered = [preferred, ...available.filter(d => d !== preferred)].filter(d => available.includes(d));

            for (const dict of ordered) {
                try {
                    let result: DictResult | null = null;

                    if (dict === 'youdao-free') {
                        result = await queryYoudaoFree(word, 'english');
                    } else if (dict === 'google-free') {
                        result = await queryGoogleFree(word, language);
                    } else if (dict === 'mymemory-free') {
                        result = await queryMyMemory(word, language);
                    }

                    if (result?.definition?.trim()) {
                        console.debug(`[LME] ✓ Found via ${dict}`);
                        emit(result);
                        return;
                    }
                } catch (e: unknown) {
                    console.debug(`[LME] ${dict} failed: ${e.message}`);
                }
            }
            console.debug(`[LME] All online dictionaries failed for "${word}"`);
        })()
    );

    // Return a promise that resolves when ALL tasks finish
    return Promise.allSettled(lookupTasks).then(() => {
        if (completedResults.length > 0) {
            console.debug(`[LME] All done, ${completedResults.length} results for "${word}"`);
            return completedResults;
        }
        throw new Error(t('errors.mdxNotFound', { word }));
    });
}

/**
 * Youdao Free Dictionary (English only)
 * Uses /jsonapi for rich results: phonetic, POS, definitions, bilingual examples, web phrases
 */
async function queryYoudaoFree(word: string, language: string): Promise<DictResult> {
    // Youdao only supports English well
    if (language !== 'english') {
        throw new Error(t('errors.youdaoEnglishOnly'));
    }

    // Use /jsonapi for richer results (phonetic, POS, examples, web phrases)
    const url = `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}&le=en`;

    try {
        const resp = await requestUrlWithTimeout({ url, method: 'GET' });
        const data = resp.json;

        console.debug('[LME] Youdao jsonapi response keys:', data ? Object.keys(data) : 'null');

        // ── 1. Phonetic (Youdao uses usphone/ukphone) ──
        let phonetic = '';
        if (data?.ec?.word?.length > 0) {
            const w = data.ec.word[0];
            const us = w.usphone || '';
            const uk = w.ukphone || '';
            if (us || uk) {
                const parts: string[] = [];
                if (uk) parts.push(`UK /${uk}/`);
                if (us) parts.push(`US /${us}/`);
                phonetic = parts.join('  ');
            }
        }

        // ── 2. Definitions (with POS) ──
        const explains: string[] = [];
        let mainDefinition = '';
        let partOfSpeech = '';

        if (data?.ec?.word?.length > 0) {
            const trs = data.ec.word[0].trs || [];
            for (const tr of trs) {
                // tr is { tr: [{ l: { i: ["n. book"] } }] }
                const text = typeof tr === 'string'
                    ? tr
                    : tr?.tr?.[0]?.l?.i?.[0] || '';
                if (text) {
                    explains.push(text);
                    // Extract POS from first entry like "n. book"
                    if (!partOfSpeech) {
                        const posMatch = text.match(/^([a-z./]+(?=\s))/i);
                        if (posMatch) partOfSpeech = posMatch[1];
                    }
                }
            }
            mainDefinition = explains.join('; ');
        }

        // Fallback to simple section if ec has no translations
        if (!mainDefinition && data?.simple?.word?.length > 0) {
            const explain = data.simple.word[0]?.explain || '';
            if (explain) {
                mainDefinition = explain;
                explains.push(...explain.split(';').map(s => s.trim()).filter(Boolean));
            }
        }

        // Fallback to suggest API if jsonapi yields nothing
        if (!mainDefinition) {
            const suggestUrl = `https://dict.youdao.com/suggest?q=${encodeURIComponent(word)}&num=1&doctype=json`;
            const suggestResp = await requestUrlWithTimeout({ url: suggestUrl, method: 'GET' });
            const suggestData = suggestResp.json;
            if (suggestData?.data?.entries?.length > 0) {
                const entry = suggestData.data.entries[0];
                mainDefinition = entry.explain || '';
                explains.push(...mainDefinition.split(';').map(s => s.trim()).filter(Boolean));
            }
        }

        if (!mainDefinition) {
            throw new Error(t('errors.noDefinition'));
        }

        // ── 3. Bilingual examples (blng_sents_part is a dict, not array) ──
        const examples: Array<{ en: string; zh: string }> = [];
        const sentsPart = data?.blng_sents_part;
        if (sentsPart && typeof sentsPart === 'object' && !Array.isArray(sentsPart)) {
            const pairs = sentsPart['sentence-pair'] || [];
            for (const pair of pairs.slice(0, 3)) {
                const en = (pair.sentence || '').replace(/<[^>]+>/g, '').trim();
                const zh = (pair['sentence-translation'] || '').trim();
                if (en && zh) {
                    examples.push({ en, zh });
                }
            }
        }

        // ── 4. Phrases (from phrs field) ──
        const webPhrases: string[] = [];
        const phrsData = data?.phrs?.phrs;
        if (Array.isArray(phrsData) && phrsData.length > 0) {
            for (const item of phrsData.slice(0, 5)) {
                const headword = item?.phr?.headword?.l?.i || '';
                const trs = item?.phr?.trs || [];
                const meanings = trs
                    .slice(0, 2)
                    .map((tr: unknown) => tr?.tr?.l?.i || '')
                    .filter(Boolean)
                    .join('; ');
                if (headword && meanings) {
                    webPhrases.push(`${headword}: ${meanings}`);
                }
            }
        }

        return {
            word,
            phonetic,
            definition: mainDefinition,
            explains,
            partOfSpeech,
            examples: examples.length > 0 ? examples : undefined,
            webPhrases: webPhrases.length > 0 ? webPhrases : undefined,
            srcYoudao: true,
        };
    } catch (e: unknown) {
        console.error('[LME] Youdao error:', e);
        throw new Error(t('errors.youdaoFailed') + ': ' + (e.message || t('errors.unknown')));
    }
}

/**
 * Google Translation Free (multi-language support)
 * Simplified version based on original plugin
 */
async function queryGoogleFree(word: string, language: string): Promise<DictResult> {
    // Language codes for Google Translate
    const langCodes: Record<string, string> = {
        english: 'en',
    };

    const sourceLang = langCodes[language] || 'en';
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=zh&dt=t&dt=bd&q=${encodeURIComponent(word)}`;

    try {
        const resp = await requestUrlWithTimeout({ url, method: 'GET' });
        const data = resp.json;

        if (!data || !data[0] || !data[0][0] || !data[0][0][0]) {
            throw new Error(t('errors.noDefinition'));
        }

        // Simple and direct access like original plugin
        const translation = data[0][0][0];
        const dictEntries = data[1] || [];
        const explains: string[] = [];

        dictEntries.forEach((entry: unknown) => {
            const pos = entry[0];
            const meanings = (entry[1] as string[]).slice(0, 3);
            // Only include meanings that contain Chinese characters
            const zhMeanings = meanings.filter((m: string) => /[\u4e00-\u9fff]/.test(m));
            if (zhMeanings.length > 0) {
                explains.push(`${pos}: ${zhMeanings.join(', ')}`);
            }
        });

        // For non-English languages, Google's dict entries are often source-language
        // synonyms. Always ensure translation appears in explains.
        if (explains.length === 0) {
            explains.push(translation);
        }

        const phonetic = '';
        return {
            word,
            phonetic,
            definition: translation,
            explains,
            partOfSpeech: dictEntries[0]?.[0] || '',
            srcGoogle: true
        };
    } catch (e: unknown) {
        console.error('[LME] Google Translate error:', e);
        throw new Error(t('errors.googleFailed') + ': ' + (e.message || t('errors.unknown')));
    }
}

/**
 * Bing Free Dictionary
 */
async function queryBingFree(word: string, language: string): Promise<DictResult> {
    // Placeholder - implement Bing lookup if needed
    throw new Error(t('errors.bingNotSupported'));
}


/**
 * MyMemory Translation API (multi-language support, no API key required)
 * Supports: English, German, French, Spanish, and 100+ more languages
 * Free tier with rate limits, perfect for personal use
 */
async function queryMyMemory(word: string, language: string): Promise<DictResult> {
    // Language codes for MyMemory API
    const langCodes: Record<string, string> = {
        english: 'en',
    };

    const sourceLang = langCodes[language] || 'en';
    const targetLang = 'zh'; // Chinese UI: dictionary target always Chinese

    // MyMemory API endpoint (no API key required for basic usage)
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${sourceLang}|${targetLang}`;

    try {
        const resp = await requestUrlWithTimeout({ url, method: 'GET' });
        const data = resp.json;

        console.debug('[LME] MyMemory response:', data);

        // Check for valid response
        if (!data || !data.responseStatus || data.responseStatus !== 200) {
            throw new Error('MyMemory API returned error status');
        }

        const translation = data.responseData?.translatedText;
        if (!translation) {
            throw new Error('MyMemory API did not return translation');
        }

        // Extract additional matches, preferring Chinese results
        const matches = data.matches || [];
        const explains: string[] = [];

        // Find best Chinese translation from matches
        let bestTranslation = '';
        for (const match of matches) {
            const t = match.translation || '';
            if (/[\u4e00-\u9fff]/.test(t)) {
                if (!bestTranslation) bestTranslation = t;
                if (match.quality > 50 && explains.length < 3) {
                    explains.push(t);
                }
            }
        }

        // Use best Chinese match as definition; fall back to responseData
        const finalTranslation = bestTranslation || (/[\u4e00-\u9fff]/.test(translation) ? translation : '');

        if (!finalTranslation) {
            throw new Error('MyMemory did not return Chinese translation');
        }

        return {
            word,
            phonetic: '',
            definition: finalTranslation,
            explains: explains.length > 0 ? explains : [finalTranslation],
            partOfSpeech: '',
            srcMyMemory: true
        };
    } catch (e: unknown) {
        console.error('[LME] MyMemory Translation error:', e);
        throw new Error(t('errors.mymemoryFailed') + ': ' + (e.message || t('errors.unknown')));
    }
}

/**
 * Get lemmatized candidates with caching
 * Returns array of form candidates (original + alternatives)
 */
async function getLemmatizedCandidates(word: string, language: string): Promise<unknown[]> {
    const trimmed = word.trim();
    if (!trimmed) return [];

    // Check cache first
    const cacheKey = `${language}:${trimmed}`;
    if (LEMMA_CACHE.has(cacheKey)) {
        return LEMMA_CACHE.get(cacheKey)!;
    }

    const candidates: unknown[] = [];

    try {
        // 社区免费版:仅英语。英语走最小词形还原(原词直查)。
        candidates.push({ word: trimmed, info: '' });
    } catch (e) {
        console.warn(`[LME] Lemmatization failed for "${trimmed}" (${language}):`, e.message);
        // Fallback to original word
        candidates.push({ word: trimmed, info: 'error' });
    }

    // Cache the results
    LEMMA_CACHE.set(cacheKey, candidates);

    return candidates;
}

/**
 * Legacy function for single-word lemmatization (kept for compatibility)
 */
async function lemmatizeWord(word: string, language: string): Promise<string | null> {
    const candidates = await getLemmatizedCandidates(word, language);
    // Return first candidate that's different from input
    for (const candidate of candidates) {
        if (candidate.word && candidate.word !== word) {
            return candidate.word;
        }
    }
    return null;
}

/**
 * Extract sentence from context
 */
export function extractSentence(text: string, word: string): string {
    // Simple sentence extraction - could be improved
    const sentences = text.split(/[.!?。！？]/);
    for (const sentence of sentences) {
        if (sentence.toLowerCase().includes(word.toLowerCase())) {
            return sentence.trim();
        }
    }
    return text.substring(0, 100);
}

/**
 * Get clean definition (strips HTML tags)
 */
export function getCleanDefinition(html: string): string {
    return html
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Fetch phonetic from Youdao full dictionary API (English IPA)
 * Uses /jsonapi endpoint which returns phonetic field
 */
async function fetchPhoneticFromYoudao(word: string): Promise<string> {
    try {
        const url = `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}&le=en`;
        const resp = await requestUrlWithTimeout({ url, method: 'GET' });
        const data = resp.json;

        if (data?.ec?.word?.length > 0) {
            const w = data.ec.word[0];
            const us = w.usphone || '';
            const uk = w.ukphone || '';
            if (us || uk) {
                const parts: string[] = [];
                if (uk) parts.push(`UK /${uk}/`);
                if (us) parts.push(`US /${us}/`);
                return parts.join('  ');
            }
        }
        return '';
    } catch (e) {
        return '';
    }
}


/**
 * Unified phonetic fetcher - dispatches to the right source per language
 * English: Youdao IPA
 * Korean: Google romanization
 * German/French/Spanish: empty (not supported yet)
 */
export async function fetchPhonetic(word: string, language: string): Promise<string> {
    // 社区免费版:仅英语(有道 IPA)
    return fetchPhoneticFromYoudao(word);
}

/**
 * Fetch a clean Chinese definition from online API (for flashcard/vocab use)
 * Avoids MDX HTML bloat by always getting a concise online translation
 */
export async function fetchCleanDefinition(word: string, language: string): Promise<string> {
    try {
        if (language === 'english') {
            const url = `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}&le=en`;
            const resp = await requestUrlWithTimeout({ url, method: 'GET' });
            const data = resp.json;

            // Try ec (English-Chinese) section first
            if (data?.ec?.word?.length > 0) {
                const wordData = data.ec.word[0];
                if (wordData?.trs?.length > 0) {
                    const trs = wordData.trs
                        .slice(0, 3)
                        .map((tr: unknown) => (typeof tr === 'string' ? tr : tr.tr?.[0]?.l?.i?.[0] || ''))
                        .filter(Boolean);
                    if (trs.length > 0) return trs.join('; ');
                }
            }

            // Try simple section as fallback
            if (data?.simple?.word?.length > 0) {
                const explain = data.simple.word[0]?.explain || '';
                if (explain) return explain.split(';').map((s: string) => s.trim()).filter(Boolean).join('; ');
            }
        }

        // Fallback to Google Translate for any language
        const langCodes: Record<string, string> = {
            english: 'en'
        };
        const sourceLang = langCodes[language] || 'en';
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=zh&dt=t&q=${encodeURIComponent(word)}`;
        const resp = await requestUrlWithTimeout({ url, method: 'GET' });
        const data = resp.json;

        if (data?.[0]?.[0]?.[0]) {
            return data[0][0][0];
        }

        return '';
    } catch (e) {
        return '';
    }
}
