// ============================================================
// English Made Easy - AI Service
// ============================================================
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com

import { requestUrl } from 'obsidian';
import type { RequestUrlResponse } from 'obsidian';
import type { LMESettings, AIProviderConfig, AIProviderKind, PronunciationScore } from '../models';
import { t } from '../i18n';

export interface WordLookupResult {
    phonetic: string;
    definition: string;
    example: string;
}

/** AI features that can be assigned a dedicated provider (override). */
export type AiFeature = 'docAnalysis' | 'flashcardFill' | 'aiScoring';

/** Resolved provider config for a feature (returned by resolveProvider). */
export interface ResolvedProvider {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl: string;
    kind: AIProviderKind;
}

/** One transcribed segment with start/end in seconds. */
export interface TranscriptSegment {
    start: number;
    end: number;
    text: string;
}

/** Gemini generateContent response as the lenient analysis path reads it (members may be absent). */
interface GeminiGenerateContentResponse {
    candidates?: Array<{
        content?: {
            parts?: Array<{ text?: string }>;
        };
    }>;
}

/** Gemini generateContent response as pronunciation scoring assumes it (strict chain). */
interface GeminiScoringResponse {
    candidates: Array<{
        content: {
            parts: Array<{ text: string }>;
        };
    }>;
}

/** Minimal OpenAI-compatible /chat/completions response shape this service reads. */
interface ChatCompletionResponse {
    choices: Array<{
        message: {
            content: string;
            reasoning_content?: string;
        };
    }>;
}

/** JSON payload lookupWord asks the model to emit. */
interface WordLookupJson {
    phonetic?: string;
    definition?: string;
    example?: string;
}

/** Status union carried by PronunciationScore.wordComparison entries. */
type WordComparisonStatus = PronunciationScore['wordComparison'][number]['status'];

/** One wordComparison entry of the scoring JSON (fields best-effort from the model). */
interface ScoredWordJson {
    word?: string;
    status?: unknown;
}

/** JSON payload the pronunciation-scoring prompt asks for (fields best-effort). */
interface ScoringResponseJson {
    overall?: unknown;
    accuracy?: unknown;
    fluency?: unknown;
    completeness?: unknown;
    recognizedText?: string;
    summary?: string;
    wordComparison?: unknown[];
    tips?: unknown[];
}

/** Shape requestUrl may reject with (transport failure / non-2xx on some Obsidian versions). */
interface RequestUrlFailure {
    status?: number;
    statusCode?: number;
    text?: string;
    body?: unknown;
    message?: string;
}

/** Whisper verbose_json transcription response (fields best-effort). */
interface TranscriptionResponse {
    text?: string;
    duration?: number;
    segments?: Array<{
        text?: string;
        start?: number;
        end?: number;
    }>;
}

// PandoraReads — AI 服务
// Note: this class is a static utility. All AI features are invoked via static
// methods that receive provider/key/model explicitly; the class holds no state.
export class AIService {
    static readonly DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
    static readonly DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

    // ============================================================
    // Provider resolution (per-feature → {provider, apiKey, model})
    // ============================================================

    private static readonly FEATURE_PROVIDER_FIELD: Record<AiFeature, keyof LMESettings> = {
        docAnalysis: 'aiDocAnalysisProvider',
        flashcardFill: 'aiFlashcardFillProvider',
        aiScoring: 'aiScoringProvider',
    };

    /**
     * Resolve the effective provider config for a given AI feature.
     * - Feature override wins, else falls back to the default provider.
     * - Primary source: the unified `aiProviders` list (each record is
     *   self-contained: own baseUrl/apiKey/model/kind).
     * - Legacy fallback for old/un-migrated data: built-in deepseek/gemini
     *   read their key from the dedicated field (deepseekApiKey/geminiApiKey)
     *   then aiAnalysisApiKey.
     */
    static resolveProvider(settings: LMESettings, feature: AiFeature): ResolvedProvider {
        const defaultProvider = settings.aiAnalysisProvider || 'deepseek';
        const override = (settings[AIService.FEATURE_PROVIDER_FIELD[feature]] as string) || '';
        const provider = override || defaultProvider;

        const list = settings.aiProviders || [];
        const rec = list.find(p => p.id === provider);
        if (rec) {
            return { provider: rec.id, apiKey: rec.apiKey, model: rec.model, baseUrl: rec.baseUrl, kind: rec.kind };
        }

        // Legacy fallback (old data before migration, or unmatched id)
        if (provider === 'deepseek') {
            return {
                provider: 'deepseek',
                apiKey: settings.deepseekApiKey || settings.aiAnalysisApiKey,
                model: settings.aiAnalysisModel || '',
                baseUrl: 'https://api.deepseek.com',
                kind: 'openai',
            };
        }
        if (provider === 'gemini') {
            return {
                provider: 'gemini',
                apiKey: settings.geminiApiKey || settings.aiAnalysisApiKey,
                model: settings.aiAnalysisModel || '',
                baseUrl: 'https://generativelanguage.googleapis.com',
                kind: 'gemini',
            };
        }

        // Unknown id: fall back to the default provider record, else raw default.
        const defRec = list.find(p => p.id === defaultProvider);
        if (defRec) {
            return { provider: defRec.id, apiKey: defRec.apiKey, model: defRec.model, baseUrl: defRec.baseUrl, kind: defRec.kind };
        }
        return { provider: defaultProvider, apiKey: settings.aiAnalysisApiKey, model: settings.aiAnalysisModel || '', baseUrl: '', kind: 'openai' };
    }

    /**
     * Unified chat dispatch by provider kind.
     * - kind='gemini' → native Gemini API (queryGeminiStatic).
     * - otherwise → OpenAI-compatible /chat/completions (queryOpenAICompatible),
     *   using the record's baseUrl (deepseek included — same endpoint as the
     *   former queryDeepseekStatic, now with 429-aware retry).
     * Looks the provider up in `providers` for baseUrl/kind/model, with a
     * built-in fallback for legacy deepseek/gemini ids not present in the list.
     */
    private static async runChat(
        provider: string,
        apiKey: string,
        modelName: string,
        prompt: string,
        providers?: AIProviderConfig[]
    ): Promise<string> {
        const rec = (providers || []).find(p => p.id === provider);
        const kind: AIProviderKind = rec?.kind ?? (provider === 'gemini' ? 'gemini' : 'openai');
        const baseUrl: string = rec?.baseUrl ?? (provider === 'deepseek' ? 'https://api.deepseek.com' : '');
        const model = modelName || rec?.model || AIService.defaultModelForProvider(provider);
        const key = apiKey || rec?.apiKey || '';

        if (kind === 'gemini') {
            return await AIService.queryGeminiStatic(key, prompt, model);
        }
        if (!baseUrl) {
            throw new Error(t('errors.unsupportedProvider'));
        }
        return await AIService.queryOpenAICompatible(baseUrl, key, model, prompt);
    }

    // ============================================================
    // AI Analysis for Shadowing View (跟读工坊)
    // ============================================================

    /**
     * Max output tokens per chat request. deepseek-chat's hard ceiling is 8192 and
     * most OpenAI-compatible models accept this; raising it above the provider
     * default (often 4096) is what stops long bilingual output from being truncated
     * mid-stream. If a provider ever rejects it (HTTP 400 citing max_tokens), lower
     * this value.
     */
    private static readonly MAX_OUTPUT_TOKENS = 8192;

    /**
     * Target span of each subtitle chunk when streaming custom-prompt output
     * (e.g. per-block bilingual). 3 minutes keeps every single request well under
     * both MAX_OUTPUT_TOKENS and the 90s chat timeout, while yielding only a handful
     * of calls for a typical video.
     */
    private static readonly CHUNK_TARGET_SECONDS = 180;

    static async analyzeSubtitles(
        subtitles: { startSec: number; text: string }[],
        provider: string,
        apiKey: string,
        modelName: string,
        level: string,
        customPrompt?: string,
        providers?: AIProviderConfig[],
        onProgress?: (done: number, total: number) => void,
        onChunkError?: (failedIndex: number, total: number) => void
    ): Promise<string> {
        if (!apiKey) {
            throw new Error(t('errors.apiKeyMissing'));
        }

        const levelLabel: Record<string, string> = {
            beginner: '初学者 (Beginner)',
            intermediate: '中级 (Intermediate)',
            advanced: '高级 (Advanced)',
            native: '母语者 (Native)',
        };

        // Chinese UI: no English-only locale instruction.
        const localeInstruction = '';

        // Default analysis report is a single self-contained HTML report whose
        // template already caps each section's count, so output size is bounded —
        // no chunking needed.
        if (!customPrompt) {
            const formattedSubs = AIService.formatSubtitles(subtitles);
            const prompt = localeInstruction + AIService.buildDefaultPrompt(formattedSubs, level, levelLabel);
            onProgress?.(1, 1);
            return await AIService.runChat(provider, apiKey, modelName, prompt, providers);
        }

        // Custom prompts (e.g. the bilingual preset) ask the model to emit one block
        // per subtitle line for the WHOLE file. One shot would exceed the model's
        // max-output-token budget and get cut off partway (the "only ~5 minutes
        // comes back" symptom). So we chunk by time, call once per chunk, and
        // concatenate. Short chunks also keep each request safely under the 90s
        // chat timeout.
        const chunks = AIService.chunkSubtitlesByTime(subtitles, AIService.CHUNK_TARGET_SECONDS);
        const parts: string[] = [];
        let firstError: Error | null = null;
        for (let i = 0; i < chunks.length; i++) {
            onProgress?.(i, chunks.length);
            const formattedSubs = AIService.formatSubtitles(chunks[i]);
            const prompt = localeInstruction + customPrompt
                .replace(/\{\{subtitles\}\}/g, formattedSubs)
                .replace(/\{\{level\}\}/g, levelLabel[level] || level);
            // Wrap each chunk so one failure (deepseek rate-limit, transient 5xx,
            // …) doesn't discard the already-succeeded chunks. Record the first
            // error, notify the caller, and keep going — a rate-limit often clears
            // within the window and later chunks succeed. Throw only if NOTHING came
            // back, so the user always gets partial results when possible.
            try {
                const part = await AIService.runChat(provider, apiKey, modelName, prompt, providers);
                parts.push(part.trim());
            } catch (err) {
                if (firstError === null) firstError = err instanceof Error ? err : new Error(String(err));
                console.error(`[EME] 字幕分析第 ${i + 1}/${chunks.length} 段失败,跳过并继续:`, err);
                onChunkError?.(i, chunks.length);
            }
        }
        onProgress?.(chunks.length, chunks.length);
        if (parts.length === 0) {
            throw firstError || new Error('AI analysis failed');
        }
        return parts.join('\n\n');
    }

    /** Format subtitle blocks as `[MM:SS] text` lines (the {{subtitles}} form). */
    private static formatSubtitles(subtitles: { startSec: number; text: string }[]): string {
        return subtitles.map(s => {
            const totalSec = Math.floor(s.startSec);
            const m = Math.floor(totalSec / 60);
            const sec = totalSec % 60;
            return '[' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0') + '] ' + s.text;
        }).join('\n');
    }

    /**
     * Split subtitles into consecutive chunks each spanning roughly `targetSeconds`.
     * A chunk closes as soon as its span (first block's startSec → current block's
     * startSec) reaches the target, so cuts always land on a real subtitle block.
     * A file shorter than the target yields a single chunk.
     */
    private static chunkSubtitlesByTime(
        subtitles: { startSec: number; text: string }[],
        targetSeconds: number
    ): { startSec: number; text: string }[][] {
        if (subtitles.length === 0) return [];
        const chunks: { startSec: number; text: string }[][] = [];
        let current: { startSec: number; text: string }[] = [];
        for (const s of subtitles) {
            current.push(s);
            const segStart = current[0].startSec;
            if (current.length >= 2 && s.startSec - segStart >= targetSeconds) {
                chunks.push(current);
                current = [];
            }
        }
        if (current.length > 0) chunks.push(current);
        return chunks;
    }

    private static buildDefaultPrompt(
        formattedSubs: string,
        level: string,
        levelLabel: Record<string, string>
    ): string {
        const template = '\n<div style="background:#FFF8F0;border:2px solid #8B7E74;padding:24px;border-radius:12px;font-family:Georgia,serif;line-height:1.6;color:#8B7E74;box-shadow:4px 4px 0 #F0E6D8;">'
            + '\n<div style="text-align:center;border-bottom:4px double #8B7E74;padding-bottom:16px;margin-bottom:24px;">'
            + '\n<h1 style="font-size:1.8em;margin:8px 0;font-weight:900;letter-spacing:-0.5px;">{{视频主题}}</h1>'
            + '\n<div style="background:#FFB5A7;color:#fff;display:inline-block;padding:3px 14px;font-size:0.85em;letter-spacing:1px;">Level: ' + (levelLabel[level] || level) + '</div>'
            + '\n</div>'
            + '\n<div style="display:flex;gap:20px;margin-bottom:28px;">'
            + '\n<div style="flex:1;border-right:1px solid #E8D5C8;padding-right:16px;">'
            + '\n<p style="font-size:1.05em;font-style:italic;color:#8B7E74;margin-top:0;">{{从字幕中选取一句最有代表性的话作为引言}}</p>'
            + '\n</div>'
            + '\n<div style="flex:1.2;font-size:0.92em;">'
            + '\n<b style="font-size:1.1em;border-bottom:2px solid #FFB5A7;">内容概要</b>'
            + '\n<p style="margin-top:8px;">{{2-3句中文概要}}</p>'
            + '\n</div>'
            + '\n</div>'
            + '\n<hr style="border:0;border-top:1px solid #F0E6D8;margin:24px 0;">'
            + '\n<h3 style="background:#B5D8C7;color:#fff;display:inline-block;padding:4px 12px;font-size:1em;margin-bottom:16px;">视频时间线</h3>'
            + '\n<div style="background:#FFF0E8;padding:16px;border-radius:10px;margin-bottom:28px;">'
            + '\n{{视频时间线列表}}'
            + '\n</div>'
            + '\n<h3 style="background:#C5B3E6;color:#fff;display:inline-block;padding:4px 12px;font-size:1em;margin-bottom:16px;">语言实验室</h3>'
            + '\n{{语言点卡片列表}}'
            + '\n<hr style="border:0;border-top:1px solid #F0E6D8;margin:24px 0;">'
            + '\n<h3 style="background:#FFB5A7;color:#fff;display:inline-block;padding:4px 12px;font-size:1em;margin-bottom:16px;">重点词汇</h3>'
            + '\n<div style="border:1px solid #F0E6D8;padding:16px;border-radius:12px;background:#FFFAF6;">'
            + '\n{{词汇列表}}'
            + '\n</div>'
            + '\n<hr style="border:0;border-top:1px solid #F0E6D8;margin:24px 0;">'
            + '\n<div style="border:2px solid #C5B3E6;padding:16px;background:#F8F0FC;border-radius:10px;">'
            + '\n<h4 style="margin:0 0 12px 0;text-align:center;letter-spacing:2px;">表达习得</h4>'
            + '\n{{表达卡片列表}}'
            + '\n</div>'
            + '\n<div style="margin-top:30px;display:flex;justify-content:space-between;align-items:center;font-size:0.75em;color:#B8A99A;">'
            + '\n<span></span>'
            + '\n<span style="letter-spacing:2px;">© 2026 PANDORA\'S DIGITAL GARDEN</span>'
            + '\n<span></span>'
            + '\n</div>'
            + '\n</div>';

        const timelineExample = '每条时间线格式：\n'
            + '<div style="margin-bottom:10px;border-bottom:1px dashed #D4C4B5;padding-bottom:6px;">'
            + '<span style="color:#FFB5A7;font-weight:bold;">[MM:SS - MM:SS]</span>'
            + ' <b>主题标题</b>：一句话描述</div>\n'
            + '时间戳从字幕实际时间计算。';

        const langPointExample = '每个语言点用一个卡片：\n'
            + '<div style="border:1px solid #E8D5C8;padding:12px;margin-bottom:14px;position:relative;border-radius:8px;">'
            + '<span style="position:absolute;top:-10px;left:10px;background:#FFF8F0;padding:0 5px;font-weight:bold;font-size:0.8em;">类型标签</span>'
            + '<p style="font-size:0.93em;"><b>"英文原文（用 &lt;span style=&quot;background:#FCD5CE;padding:0 2px;&quot;&gt;高亮关键词&lt;/span&gt; 标注重点词）"</b></p>'
            + '<p style="font-size:0.85em;color:#9B8E82;"><b>讲解：</b>中文讲解这个语言点的含义、用法。给一个简短例句及翻译。</p>'
            + '</div>\n'
            + '类型标签可选：句法分析 ANALYSIS、地道结构 STRUCTURE、语用提示 USAGE 等。每个卡片选不同标签。';

        const vocabExample = '每个词汇一行，格式：\n'
            + '<p style="margin:6px 0;"><b>Word</b> <small>/音标/</small><br>中文释义。用法提示。</p>';

        const expressionExample = '每个表达一个卡片：\n'
            + '<div style="background:#FFF8F0;padding:6px 14px;border:1px solid #C5B3E6;display:inline-block;margin:4px;font-size:0.9em;border-radius:16px;">'
            + '<b>English Expression</b><br><small>中文解释</small></div>';

        return '你是一位经验丰富的英语教师，正在为中国学生分析一段英语视频的字幕。' +
            '\n学习者英语水平：' + (levelLabel[level] || level) +
            '\n\n字幕内容：\n' + formattedSubs +
            '\n\n请严格按照以下 HTML 模板格式输出完整报告。模板中的 {{...}} 是占位符，你需要用实际内容替换它们。' +
            '\n\n模板结构：' + template +
            '\n\n各占位符的填写规则：' +
            '\n\n1. {{视频主题}}：用5-8个字概括视频主题' +
            '\n\n2. {{从字幕中选取一句最有代表性的话作为引言}}：选一句能体现视频核心内容的英文原话' +
            '\n\n3. {{2-3句中文概要}}：用中文概括视频核心内容' +
            '\n\n4. {{视频时间线列表}}：按实际字幕时间划分4-8个段落。' + timelineExample +
            '\n\n5. {{语言点卡片列表}}：挑选4-6个最值得学习的语言点（语法、句型、短语搭配等）。' + langPointExample +
            '\n\n6. {{词汇列表}}：挑选5-7个重点词汇。' + vocabExample +
            '\n\n7. {{表达卡片列表}}：挑选4-6个地道表达或习语，用卡片形式排列。' + expressionExample +
            '\n\n要求：' +
            '\n- 所有讲解用中文，像英语老师给学生讲题一样自然易懂' +
            '\n- 引用的英文原文加粗，重点词用粉色高亮标注' +
            '\n- 时间戳格式必须为 [MM:SS - MM:SS]，加粗粉色' +
            '\n- 严禁包含任何引导性客套话' +
            '\n- 输出必须是完整的 HTML，从 <div style="background:#FFF8F0;...> 开始，到 </div> 结束，不要用 ``` 包裹' +
            '\n- 根据学习者水平调整深度：初学者侧重基础词汇和句型，高级侧重语感差异和地道用法';
    }

    static defaultModelForProvider(provider: string): string {
        if (provider === 'deepseek') return AIService.DEFAULT_DEEPSEEK_MODEL;
        if (provider === 'gemini') return AIService.DEFAULT_GEMINI_MODEL;
        return '';
    }

    static normalizeBuiltinModel(provider: string, modelName?: string): string {
        const raw = (modelName || '').trim();
        if (provider === 'deepseek') {
            if (!raw || raw === 'deepseek-chat') return AIService.DEFAULT_DEEPSEEK_MODEL;
            return raw;
        }
        if (provider === 'gemini') {
            const lower = raw.toLowerCase().replace(/^models\//, '').trim();
            if (!lower || lower === 'gemini 3.5' || lower === 'gemini-3.5') {
                return AIService.DEFAULT_GEMINI_MODEL;
            }
            return lower;
        }
        return raw;
    }

    private static async queryGeminiStatic(
        apiKey: string,
        prompt: string,
        model: string
    ): Promise<string> {
        const normalizedModel = AIService.normalizeBuiltinModel('gemini', model);
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(normalizedModel) + ':generateContent';
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: AIService.MAX_OUTPUT_TOKENS }
        };

        try {
            const resp = await AIService.withTimeout(requestUrl({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify(payload)
            }), AIService.AI_CHAT_TIMEOUT_MS, 'AI request timeout');

            if (resp.status < 200 || resp.status >= 300) {
                throw new Error(AIService.describeApiFailure(resp.status, resp.text || '', 'Gemini API 返回错误'));
            }
            const json = resp.json as GeminiGenerateContentResponse | undefined;
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                throw new Error('Gemini API 未返回有效内容: ' + JSON.stringify(json || {}).slice(0, 400));
            }
            return text.trim();
        } catch (err: unknown) {
            console.error('[EME] Gemini analysis error', err);
            throw new Error('Gemini 调用失败: ' + err.message);
        }
    }

    static async queryOpenAICompatible(
        baseUrl: string,
        apiKey: string,
        model: string,
        prompt: string,
        systemPrompt?: string
    ): Promise<string> {
        let url = baseUrl.replace(/\/+$/, '');
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            throw new Error('Base URL 必须以 http:// 或 https:// 开头');
        }
        if (!url.endsWith('/chat/completions')) {
            url += '/chat/completions';
        }

        const payload: Record<string, unknown> = {
            model,
            messages: [
                { role: 'system', content: systemPrompt || 'You are a professional English teacher and content analyst. Always respond in the requested format without any preamble.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: AIService.MAX_OUTPUT_TOKENS
        };
        // deepseek-v4 系列 thinking 默认开启(effort=high):模型先把 token 耗在
        // reasoning_content 思维链上,长输出(双语对照)时会把 max_tokens 吃光导致
        // content 为空(一片空白、且不报错),也拖慢生成。翻译/查词/闪卡都不需要
        // 推理,关掉它让模型直接输出 content。仅对 deepseek 加此参数,其他 OpenAI
        // 兼容 provider 不认(传了可能 400)。
        if (baseUrl.includes('deepseek.com') || model.toLowerCase().includes('deepseek')) {
            // deepseek-v4 thinking 默认 high → reasoning 耗光 max_tokens、content 空(一片
            // 空白);完全 disabled 又太草率,模型不对照原文、擅自改时间戳等细节。取 low
            // effort:保留轻度推理(更严格遵守"原样复刻"类指令),reasoning 又不致耗光
            // token,兼顾准确与不空白。
            payload.thinking = { type: 'enabled' };
            payload.reasoning_effort = 'low';
        }

        const json = await AIService.postWithRateLimitRetry(url, apiKey, payload, '模型调用失败');
        // content 优先;万一某次 content 空,fall back 到 reasoning_content 兜底。
        const msg = json.choices[0].message;
        return (msg.content || msg.reasoning_content || '').trim();
    }

    // ============================================================
    // AI Word Lookup for Flashcard Auto-fill
    // ============================================================

    static async lookupWord(
        word: string,
        language: string,
        provider: string,
        apiKey: string,
        modelName: string,
        providers?: AIProviderConfig[]
    ): Promise<WordLookupResult> {
        if (!apiKey) {
            throw new Error(t('errors.apiKeyMissing'));
        }

        const langNames: Record<string, string> = {
            english: '英语',
            german: '德语',
            french: '法语',
            spanish: '西班牙语',
            korean: '韩语',
            russian: '俄语',
            japanese: '日语',
        };
        const langName = langNames[language] || language;

        const phoneticSpec = language === 'japanese'
            ? '假名读音。汉字词优先用平假名，外来语可保留片假名；不要输出罗马音或 IPA'
            : '国际音标IPA';
        const phoneticRule = language === 'japanese'
            ? '- phonetic: 输出日语假名读音。汉字词用平假名读法；外来语可保留片假名；不要输出罗马音或 IPA\n'
            : '- phonetic: 标准国际音标(IPA)，用斜线包裹如 /ɪˈpɪfəni/\n';
        const prompt = '你是一位专业的' + langName + '词典编纂专家。请查词 "' + word + '"，严格按照以下 JSON 格式返回结果，不要包含任何其他文字、解释或 markdown 代码块标记：\n\n'
            + '{"phonetic":"' + phoneticSpec + '","definition":"中文释义（含词性标注，支持 Markdown 加粗，多义词用分号分隔）","example":"一句地道的' + langName + '例句（含中文翻译）"}\n\n'
            + '要求：\n'
            + phoneticRule
            + '- definition: 格式为 **词性.** 释义，例如 **n.** 顿悟；突然的感悟。多个词性用换行分隔\n'
            + '- example: 一句能体现该词用法的地道例句，后跟中文翻译。格式：英文例句\\n中文翻译\n'
            + '- 直接输出 JSON，不要包含 ```json``` 包裹';

        const raw: string = await AIService.runChat(provider, apiKey, modelName, prompt, providers);

        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        let parsed: unknown;
        try {
            parsed = JSON.parse(cleaned);
        } catch {
            throw new Error(t('errors.invalidJson'));
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            // LLM 返回合法但非对象的 JSON(null/"ok"/42) → 字段访问会 TypeError,统一友好报错。
            throw new Error(t('errors.invalidJson'));
        }

        const rec = parsed as WordLookupJson;
        return {
            phonetic: rec.phonetic || '',
            definition: rec.definition || '',
            example: rec.example || ''
        };
    }


    // ============================================================
    // Pronunciation Scoring (Multimodal AI)
    // ============================================================

    private static readonly SCORING_PROMPT = `You are an expert pronunciation coach. The user was asked to read the following sentence:

"{originalText}"

Their recording is attached as audio. Please:

1. Transcribe what you hear in the recording
2. Compare the transcription with the original text word by word
3. Score the pronunciation on three dimensions (0-100):
   - accuracy: how correctly each word was pronounced
   - fluency: natural rhythm, pacing, and smoothness
   - completeness: how much of the original text was spoken
4. Calculate an overall score (weighted average)
5. Write a brief one-line summary (max 15 words) that feels encouraging and conversational, like a coach giving instant feedback
6. Provide 1-3 specific, actionable tips for improvement

Respond with ONLY a JSON object in this exact format (no markdown, no code blocks):
{
  "overall": <number 0-100>,
  "accuracy": <number 0-100>,
  "fluency": <number 0-100>,
  "completeness": <number 0-100>,
  "recognizedText": "<what you heard, full sentence>",
  "summary": "<one-line encouraging comment, max 15 words>",
  "wordComparison": [
    {"word": "the", "status": "correct"},
    {"word": "quick", "status": "correct"},
    {"word": "brown", "status": "wrong"},
    {"word": "fox", "status": "missing"}
  ],
  "tips": ["<tip 1>", "<tip 2>"]
}

For wordComparison, compare the recognized text against the original word by word:
- "correct": word was present and pronounced well
- "wrong": word was present but pronounced incorrectly
- "missing": word from original was not spoken
- "extra": word spoken but not in original

If the audio is too quiet, unclear, or empty, still return a valid JSON with low scores and a tip explaining the issue.

{localeInstruction}`;

    /**
     * Score pronunciation via Gemini API (inlineData audio format)
     */
    static async scorePronunciation(
        audioBlob: Blob,
        originalText: string,
        apiKey: string,
        model: string,
        locale: 'en' | 'zh' = 'zh'
    ): Promise<PronunciationScore> {
        const base64Audio = await AIService.blobToBase64(audioBlob);
        const mimeType = audioBlob.type || 'audio/webm';
        const localeInstruction = locale === 'en'
            ? 'IMPORTANT: All text content (summary, tips) must be in English.'
            : '重要：所有文字内容（summary、tips）必须用中文回复。';
        const prompt = AIService.SCORING_PROMPT
            .replace('{originalText}', originalText)
            .replace('{localeInstruction}', localeInstruction);

        const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
        const payload = {
            contents: [{
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType, data: base64Audio } }
                ]
            }]
        };

        try {
            const resp = await AIService.withTimeout(requestUrl({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify(payload)
            }), AIService.AI_CHAT_TIMEOUT_MS, 'AI request timeout');

            const json = resp.json as GeminiScoringResponse;
            const rawText = json.candidates[0].content.parts[0].text.trim();
            return AIService.parseScoringResponse(rawText);
        } catch (err: unknown) {
            console.error('[EME] Gemini pronunciation scoring error', err);
            throw new Error('AI scoring failed: ' + (err.message || 'Unknown error'));
        }
    }

    /**
     * Score pronunciation via OpenAI-compatible API (input_audio format).
     * Works with GPT-4o, GPT-4o-mini, and any model that supports audio input
     * via the OpenAI chat completions format.
     */
    static async scorePronunciationOpenAI(
        audioBlob: Blob,
        originalText: string,
        baseUrl: string,
        apiKey: string,
        model: string,
        locale: 'en' | 'zh' = 'zh'
    ): Promise<PronunciationScore> {
        const base64Audio = await AIService.blobToBase64(audioBlob);
        const mimeType = audioBlob.type || 'audio/webm';
        const localeInstruction = locale === 'en'
            ? 'IMPORTANT: All text content (summary, tips) must be in English.'
            : '重要：所有文字内容（summary、tips）必须用中文回复。';
        const prompt = AIService.SCORING_PROMPT
            .replace('{originalText}', originalText)
            .replace('{localeInstruction}', localeInstruction);

        let url = baseUrl.replace(/\/+$/, '');
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            throw new Error('Base URL must start with http:// or https://');
        }
        if (!url.endsWith('/chat/completions')) {
            url += '/chat/completions';
        }

        const payload = {
            model,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        {
                            type: 'input_audio',
                            input_audio: { data: base64Audio, format: mimeType.includes('webm') ? 'webm' : 'wav' }
                        }
                    ]
                }
            ],
            temperature: 0.3
        };

        const json = await AIService.postWithRateLimitRetry(url, apiKey, payload, 'AI scoring failed');
        const rawText = json.choices[0].message.content.trim();
        return AIService.parseScoringResponse(rawText);
    }

    private static parseScoringResponse(raw: string): PronunciationScore {
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        let parsed: unknown;
        try {
            parsed = JSON.parse(cleaned);
        } catch {
            // If JSON parsing fails, return a fallback score with the raw text as a tip
            return {
                overall: 0,
                accuracy: 0,
                fluency: 0,
                completeness: 0,
                recognizedText: '',
                summary: '',
                wordComparison: [],
                tips: [cleaned.slice(0, 200)]
            };
        }

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            // 非 JSON 对象 → 同 parse 失败,返回降级 0 分(带原文提示),避免 TypeError。
            return {
                overall: 0,
                accuracy: 0,
                fluency: 0,
                completeness: 0,
                recognizedText: '',
                summary: '',
                wordComparison: [],
                tips: [cleaned.slice(0, 200)]
            };
        }

        const rec = parsed as ScoringResponseJson;
        return {
            overall: AIService.clampScore(rec.overall),
            accuracy: AIService.clampScore(rec.accuracy),
            fluency: AIService.clampScore(rec.fluency),
            completeness: AIService.clampScore(rec.completeness),
            recognizedText: String(rec.recognizedText || ''),
            summary: String(rec.summary || ''),
            wordComparison: Array.isArray(rec.wordComparison)
                ? rec.wordComparison.map((w: ScoredWordJson) => ({
                    word: String(w.word || ''),
                    status: ['correct', 'wrong', 'missing', 'extra'].includes(w.status as WordComparisonStatus) ? w.status as WordComparisonStatus : 'wrong'
                }))
                : [],
            tips: Array.isArray(rec.tips)
                ? rec.tips.map((t: unknown) => String(t)).slice(0, 3)
                : []
        };
    }

    private static clampScore(val: unknown): number {
        const n = Number(val);
        if (isNaN(n)) return 0;
        return Math.max(0, Math.min(100, Math.round(n)));
    }

    /** AI 请求超时上限。chat 调用 90s;Whisper 转写长音频放宽到 300s(避免误杀既有长音频转写)。 */
    // 240s: long bilingual/analysis outputs — especially from deepseek, which
    // streams noticeably slower than Gemini — can take 2-3 min for a single chunk.
    // The old 90s ceiling cut them off mid-generation ("AI request timeout"). Short
    // calls (word lookup, flashcards) return in seconds regardless, so raising the
    // ceiling is safe for them too.
    private static readonly AI_CHAT_TIMEOUT_MS = 240_000;
    private static readonly AI_TRANSCRIBE_TIMEOUT_MS = 300_000;

    private static withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
        return new Promise((resolve, reject) => {
            const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
            promise.then(resolve, reject).finally(() => window.clearTimeout(timeoutId));
        });
    }

    // ============================================================
    // OpenAI-compatible request helpers
    // (surface the real server error + smart 429 retry)
    // ============================================================

    private static readonly MAX_RATE_LIMIT_RETRIES = 4;

    /**
     * POST to an OpenAI-compatible chat-completions endpoint. Never throws on HTTP
     * error status — returns the status + server response body instead, so callers
     * can show the real reason (rate_limit_exceeded vs insufficient_quota, model
     * not found, …) and decide whether to retry.
     */
    private static async postChatCompletion(
        url: string,
        apiKey: string,
        payload: unknown
    ): Promise<{ ok: true; json: ChatCompletionResponse } | { ok: false; status: number; body: string }> {
        try {
            const resp = await AIService.withTimeout(requestUrl({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + apiKey
                },
                body: JSON.stringify(payload)
            }), AIService.AI_CHAT_TIMEOUT_MS, 'AI request timeout');
            if (resp.status >= 200 && resp.status < 300) {
                return { ok: true, json: resp.json as ChatCompletionResponse };
            }
            return { ok: false, status: resp.status, body: typeof resp.text === 'string' ? resp.text : '' };
        } catch (err: unknown) {
            // requestUrl throws on network-level failures; on some Obsidian versions it
            // also rejects for HTTP error statuses, carrying status/body on the error.
            const reqErr = err as RequestUrlFailure;
            const status = reqErr?.status ?? reqErr?.statusCode ?? 0;
            const body = typeof reqErr?.text === 'string'
                ? reqErr.text
                : (typeof reqErr?.message === 'string' ? reqErr.message : String(err));
            return { ok: false, status, body };
        }
    }

    /**
     * Send a chat-completion request, retrying transient 429 rate limits with linear
     * backoff (1s, 2s). A 429 caused by exhausted quota/billing is NOT retried
     * (pointless and spams the server) — it fails fast with the real error surfaced.
     */
    private static async postWithRateLimitRetry(
        url: string,
        apiKey: string,
        payload: unknown,
        errorPrefix: string
    ): Promise<ChatCompletionResponse> {
        let lastStatus = 0;
        let lastBody = '';
        for (let attempt = 0; attempt <= AIService.MAX_RATE_LIMIT_RETRIES; attempt++) {
            const result = await AIService.postChatCompletion(url, apiKey, payload);
            if (result.ok) {
                return result.json;
            }
            lastStatus = result.status;
            lastBody = result.body;
            // Retry on transient rate limits (429) and server errors (5xx). Gemini
            // never returns these, so it is unaffected; deepseek's per-minute token
            // cap surfaces as 429 mid-stream and needs a longer exponential backoff
            // (2s/4s/8s/16s) to let the window recover before the next attempt.
            const retriable = AIService.isTransientRateLimit(result.status, result.body)
                || (result.status >= 500 && result.status < 600);
            if (retriable && attempt < AIService.MAX_RATE_LIMIT_RETRIES) {
                const waitMs = 2000 * (2 ** attempt);
                console.warn(`[EME] AI 请求返回 ${result.status},第 ${attempt + 1}/${AIService.MAX_RATE_LIMIT_RETRIES} 次重试(等待 ${waitMs}ms)`);
                await AIService.delay(waitMs);
                continue;
            }
            break;
        }
        console.error('[EME] OpenAI-compatible API error', { status: lastStatus, body: lastBody });
        throw new Error(AIService.describeApiFailure(lastStatus, lastBody, errorPrefix));
    }

    /**
     * A 429 is only retryable when it reflects a transient *rate* limit. If the body
     * mentions quota/billing/credits it is an exhaustion problem — do not retry.
     */
    private static isTransientRateLimit(status: number, body: string): boolean {
        if (status !== 429) return false;
        const text = (body || '').toLowerCase();
        if (/quota|insufficient|billing|credit|payment|exhausted|余额|额度|欠费|充值|付款/.test(text)) {
            return false;
        }
        return /rate|too many|throttl|try again|稍后|稍候|频繁|过频|限制/.test(text);
    }

    private static delay(ms: number): Promise<void> {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    }

    /**
     * Build a user-facing error string that always includes the (truncated) server
     * response body, replacing the previous generic failure message.
     */
    private static describeApiFailure(status: number, body: string, prefix: string): string {
        const detail = (body || '').trim();
        const snippet = detail.length > 400 ? detail.slice(0, 400) + '…' : detail;
        return prefix + ' (HTTP ' + (status || '?') + '): ' + (snippet || '服务器未返回错误详情');
    }

    private static blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result as string;
                // Remove "data:audio/webm;base64," prefix
                const base64 = dataUrl.split(',')[1] || '';
                resolve(base64);
            };
            reader.onerror = () => reject(new Error('Failed to convert audio to base64'));
            reader.readAsDataURL(blob);
        });
    }

    // ============================================================
    // Audio Transcription (Whisper-compatible /audio/transcriptions)
    // ============================================================

    /** Format seconds as [MM:SS] (or [H:MM:SS] when >= 1h). */
    private static formatTimestamp(sec: number): string {
        const total = Math.max(0, Math.floor(sec));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const mm = String(m).padStart(2, '0');
        const ss = String(s).padStart(2, '0');
        return h > 0 ? `[${h}:${mm}:${ss}]` : `[${mm}:${ss}]`;
    }

    /** Convert segments to `[MM:SS] text` lines (the note timestamp format). */
    static segmentsToTimestampLines(segs: TranscriptSegment[]): string {
        return segs
            .map(sg => `${AIService.formatTimestamp(sg.start)} ${sg.text.trim()}`)
            .join('\n');
    }

    /** Convert segments to a standard SRT subtitle string. */
    static segmentsToSrt(segs: TranscriptSegment[]): string {
        const pad = (n: number, len = 2) => String(n).padStart(len, '0');
        const srtTime = (sec: number) => {
            const t = Math.max(0, sec);
            const ms = Math.round((t - Math.floor(t)) * 1000);
            const total = Math.floor(t);
            const h = Math.floor(total / 3600);
            const m = Math.floor((total % 3600) / 60);
            const s = total % 60;
            return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
        };
        return segs.map((sg, i) => `${i + 1}\n${srtTime(sg.start)} --> ${srtTime(sg.end)}\n${sg.text.trim()}\n`).join('\n');
    }

    /**
     * Build a multipart/form-data body (ArrayBuffer) for Whisper file upload.
     * Obsidian's requestUrl accepts an ArrayBuffer body + a custom Content-Type header.
     */
    private static buildMultipartBody(
        fields: Record<string, string>,
        file: { name: string; type: string; data: ArrayBuffer }
    ): { body: ArrayBuffer; contentType: string } {
        const boundary = '----LMETranscribe' + Math.random().toString(16).slice(2);
        const enc = new TextEncoder();
        const parts: Uint8Array[] = [];
        const CRLF = '\r\n';

        const fieldLines = (name: string, value: string) =>
            `--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`;
        for (const [k, v] of Object.entries(fields)) {
            parts.push(enc.encode(fieldLines(k, v)));
        }
        // File part header
        parts.push(enc.encode(
            `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${file.name}"${CRLF}Content-Type: ${file.type}${CRLF}${CRLF}`
        ));
        parts.push(new Uint8Array(file.data));
        parts.push(enc.encode(`${CRLF}--${boundary}--${CRLF}`));

        // Concatenate into a single ArrayBuffer
        const total = parts.reduce((n, p) => n + p.length, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const p of parts) { out.set(p, off); off += p.length; }
        return { body: out.buffer, contentType: `multipart/form-data; boundary=${boundary}` };
    }

    /** Map a file extension to a MIME type for Whisper upload. */
    private static mimeForExt(filename: string): string {
        const ext = (filename.split('.').pop() || '').toLowerCase();
        const map: Record<string, string> = {
            mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg',
            flac: 'audio/flac', aac: 'audio/aac', webm: 'audio/webm',
            mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska',
            m4v: 'video/x-m4v',
        };
        return map[ext] || 'application/octet-stream';
    }

    /**
     * Transcribe audio/video bytes via a Whisper-compatible endpoint.
     * Returns sentence-level segments with reliable timestamps (verbose_json).
     */
    static async transcribeAudio(
        audio: ArrayBuffer,
        filename: string,
        settings: LMESettings
    ): Promise<TranscriptSegment[]> {
        const key = (settings.transcriptionApiKey || '').trim();
        if (!key) throw new Error(t('transcribe.noApiKey'));

        const base = (settings.transcriptionBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const model = settings.transcriptionModel || 'whisper-1';
        const url = `${base}/audio/transcriptions`;

        const fields: Record<string, string> = {
            model,
            response_format: 'verbose_json',
            // Request segment-level timestamps (sentence granularity)
            timestamp_granularities: 'segment',
        };

        const { body, contentType } = AIService.buildMultipartBody(fields, {
            name: filename,
            type: AIService.mimeForExt(filename),
            data: audio,
        });

        let resp: RequestUrlResponse;
        try {
            resp = await AIService.withTimeout(requestUrl({
                url,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': contentType,
                    // Whisper expects the actual multipart Content-Type (no JSON header)
                },
                body,
            }), AIService.AI_TRANSCRIBE_TIMEOUT_MS, 'AI request timeout');
        } catch (e: unknown) {
            const reqErr = e as RequestUrlFailure;
            const status = reqErr?.status || 0;
            let bodyText = '';
            try { bodyText = typeof reqErr?.body === 'string' ? reqErr.body : JSON.stringify(reqErr?.body || {}); } catch { /* non-serializable body */ }
            throw new Error(AIService.describeApiFailure(status, bodyText, t('transcribe.failed')));
        }

        const data = (resp?.json || {}) as TranscriptionResponse;
        const segs = Array.isArray(data.segments) ? data.segments : [];
        const result: TranscriptSegment[] = [];
        for (const s of segs) {
            const text = (s?.text || '').trim();
            if (!text) continue;
            if (typeof s?.start !== 'number' || typeof s?.end !== 'number') continue;
            result.push({ start: s.start, end: s.end, text });
        }
        if (result.length === 0) {
            // Some endpoints return only `text` without segments
            const whole = (data.text || '').trim();
            if (!whole) throw new Error(t('transcribe.failed'));
            // Fallback: single segment spanning the reported duration (or 0)
            const dur = typeof data.duration === 'number' ? data.duration : 0;
            result.push({ start: 0, end: dur, text: whole });
        }
        return result;
    }
}
