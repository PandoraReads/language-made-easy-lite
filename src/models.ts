// ============================================================
// English Made Easy - Data Models
// ============================================================

/**
 * FSRS scheduling data (mirrors ts-fsrs Card fields we need to persist)
 */
export interface FSRSData {
    due: number;           // Due date as Unix timestamp (ms)
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    state: number;         // 0=New, 1=Learning, 2=Review, 3=Relearning
    last_review?: number;  // Unix timestamp (ms)
}

/**
 * Core vocabulary entry stored in IndexedDB
 */
export interface PromptTemplate {
	id: string;
	name: string;
	content: string;
	contentEn?: string;  // English version of prompt (for English UI)
	isBuiltIn: boolean; // true = preset, cannot edit/delete
}

// One entry in the AI analysis sidebar's history (most recent first)
export interface AIAnalysisHistoryEntry {
	id: string;          // stable id (Date.now + random)
	timestamp: number;   // generation time (ms epoch)
	title: string;       // extracted report title (<=30 chars)
	content: string;     // rendered report markdown/html
	promptName?: string;       // 生成该报告所用提示词(raw name; 内置为翻译键片段如 'builtin.comprehensive')
	promptIsBuiltin?: boolean; // true 时 promptName 需经 t('prompts.'+promptName) 解析
}

export interface CustomAIProvider {
    id: string;          // unique identifier (uuid)
    name: string;        // display name, e.g. "OpenAI GPT-4o"
    baseUrl: string;     // API base URL, e.g. https://api.openai.com/v1
    model: string;       // model name, e.g. gpt-4o
    apiKey: string;
}

// ── Unified AI provider record (replaces the preset/custom split) ──
// Every provider — built-in preset or user-added — is one self-contained
// record holding its own baseUrl/model/apiKey, so switching the active
// provider never loses its config. kind drives the HTTP dispatch:
// 'gemini' = native Gemini API, 'openai' = OpenAI-compatible /chat/completions.
export type AIProviderKind = 'openai' | 'gemini';

// Learning languages supported by flashcard decks and AI features
export type LanguageId = 'english' | 'german' | 'french' | 'spanish' | 'korean' | 'russian' | 'japanese' | 'chinese';

// UI theme id -> display name (single source; settings dropdown, theme-cycle
// command and switch notice all read this so names never drift apart)
export const UI_THEME_LABELS: Record<LMESettings['uiStyle'], string> = {
    'paper-ink': 'Paper & Ink (经典纸墨)',
    'mint-coach': 'Mint Atelier (薄荷雅境)',
    'rose-blush': 'Rose Blush (蔷薇柔粉)',
    'lavender-dream': 'Lavender Dream (紫藤之梦)',
    'candy-pop': 'Candy Pop (糖果派对)',
    'mindful-oasis': 'Mindful Oasis (童心绿洲)',
    'coral-warmth': 'Coral Warmth (珊瑚暖阳)',
    'ocean-glass': 'Ocean Glass (海洋之心)',
    'aurora-prism': 'Aurora Prism (极光棱镜)',
    'neon-lime': 'Dark Lemon (暗夜柠檬)',
};

export interface AIProviderConfig {
    id: string;          // preset ids are stable ('openai'/'deepseek'/...); custom = 'custom-<ts>'
    name: string;        // display name
    baseUrl: string;     // OpenAI-compatible base URL; for kind='gemini' only used by scoring sniff
    model: string;       // chosen/default model name
    apiKey: string;      // per-provider key (independent → no re-entry on switch)
    kind: AIProviderKind;
    isBuiltIn: boolean;  // preset entries cannot be deleted
}

// Preset catalog offered via "add from catalog". deepseek/gemini model values
// intentionally match AIService.DEFAULT_DEEPSEEK_MODEL / DEFAULT_GEMINI_MODEL.
export const BUILTIN_PROVIDERS: AIProviderConfig[] = [
    { id: 'openai',     name: 'OpenAI',          baseUrl: 'https://api.openai.com/v1',                         model: 'gpt-4o-mini',        apiKey: '', kind: 'openai', isBuiltIn: true },
    { id: 'deepseek',   name: 'DeepSeek',        baseUrl: 'https://api.deepseek.com',                          model: 'deepseek-v4-flash',  apiKey: '', kind: 'openai', isBuiltIn: true },
    { id: 'gemini',     name: 'Google Gemini',   baseUrl: 'https://generativelanguage.googleapis.com',         model: 'gemini-3.5-flash',   apiKey: '', kind: 'gemini', isBuiltIn: true },
    { id: 'kimi',       name: 'Kimi (Moonshot)', baseUrl: 'https://api.moonshot.cn/v1',                        model: 'moonshot-v1-8k',     apiKey: '', kind: 'openai', isBuiltIn: true },
    { id: 'glm',        name: 'Zhipu GLM',       baseUrl: 'https://open.bigmodel.cn/api/paas/v4',              model: 'glm-4-flash',        apiKey: '', kind: 'openai', isBuiltIn: true },
    { id: 'qwen',       name: 'Tongyi Qwen',     baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo',         apiKey: '', kind: 'openai', isBuiltIn: true },
    { id: 'openrouter', name: 'OpenRouter',      baseUrl: 'https://openrouter.ai/api/v1',                      model: 'openai/gpt-4o-mini', apiKey: '', kind: 'openai', isBuiltIn: true },
];

export const BUILTIN_PROMPTS: PromptTemplate[] = [
	{
		id: 'builtin-comprehensive',
		name: 'builtin.comprehensive',
		isBuiltIn: true,
		content: '你是一位经验丰富的第二外语教师，正在为中国学生分析一段第二外语视频的字幕。\n学习者第二外语水平：{{level}}\n\n字幕内容：\n{{subtitles}}\n\n请严格按照以下 HTML 模板格式输出完整报告。模板中的 {{...}} 是占位符，你需要用实际内容替换它们。\n\n模板结构：\n{{template}}\n\n各占位符的填写规则：\n\n1. {{视频主题}}：用5-8个字概括视频主题\n\n2. {{从字幕中选取一句最有代表性的话作为引言}}：选一句能体现视频核心内容的英文原话\n\n3. {{2-3句中文概要}}：用中文概括视频核心内容\n\n4. {{视频时间线列表}}：按实际字幕时间划分4-8个段落。{{timelineExample}}\n\n5. {{语言点卡片列表}}：挑选4-6个最值得学习的语言点（语法、句型、短语搭配等）。{{langPointExample}}\n\n6. {{词汇列表}}：挑选5-7个重点词汇。{{vocabExample}}\n\n7. {{表达卡片列表}}：挑选4-6个地道表达或习语，用卡片形式排列。{{expressionExample}}\n\n要求：\n- 所有讲解用中文，像第二外语老师给学生讲题一样自然易懂\n- 引用的英文原文加粗，重点词用黄色高亮标注\n- 时间戳格式必须为 [MM:SS - MM:SS]，加粗红色\n- 严禁包含任何引导性客套话\n- 输出必须是完整的 HTML，从 <div style="background:#fff;...> 开始，到 </div> 结束，不要用 ``` 包裹\n- 根据学习者水平调整深度：初学者侧重基础词汇和句型，高级侧重语感差异和地道用法',
	},

	{
		id: 'builtin-vocab-analysis',
		name: 'builtin.vocabAnalysis',
		isBuiltIn: true,
		content: '你是一位专业的语言教育分析师。请分析以下文本的词汇特征，生成一份视觉美观、数据精准的词汇难度报告。\n\n文本内容：\n{{subtitles}}\n\n【分析算法严格约束】\n1. 词汇量需求：必须基于词干复原（Lemmatization），去除重复词根、标点及纯数字后，计算学习该文本所需的不重复核心词根数。\n2. 词汇多样性：计算类标记比（TTR公式 = 不重复词数 / 总词数 * 100%）。\n3. 词汇亮点：优先提取 B2 及以上的核心词汇。若全文无 B2 以上词汇，则提取文本中难度最高、最具学习价值的 3 个词汇。\n\n【输出要求】\n请严格按照以下 HTML 模板输出完整报告。直接输出渲染后的 HTML 内容，不要将 HTML 包裹在 ```html 等任何代码块中，不要包含任何引导性客套话。输出必须以 "<div>" 开始，以 "</div>" 结束。\n\n【HTML 输出模板】\n<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 20px auto; padding: 24px; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); color: #333; line-height: 1.6;">\n\n  <!-- 标题 -->\n  <h2 style="margin-top: 0; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid #f0f0f0; color: #1a1a1a; font-size: 24px; font-weight: 700;">📊 词汇难度分析报告</h2>\n\n  <!-- 总体评估卡片 -->\n  <h3 style="color: #4b5563; font-size: 16px; margin-bottom: 12px; font-weight: 600;">一、总体评估</h3>\n  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 28px;">\n    <div style="background: #f8fafc; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6; text-align: center;">\n      <div style="font-size: 13px; color: #64748b; margin-bottom: 4px;">建议 CEFR 等级</div>\n      <div style="font-size: 24px; font-weight: 800; color: #1d4ed8;">[A1/A2/B1/B2/C1/C2]</div>\n    </div>\n    <div style="background: #f8fafc; padding: 16px; border-radius: 8px; border-left: 4px solid #10b981; text-align: center;">\n      <div style="font-size: 13px; color: #64748b; margin-bottom: 4px;">核心词汇量需求</div>\n      <div style="font-size: 24px; font-weight: 800; color: #065f46;">[数字] <span style="font-size: 14px; font-weight: normal;">词</span></div>\n    </div>\n    <div style="background: #f8fafc; padding: 16px; border-radius: 8px; border-left: 4px solid #8b5cf6; text-align: center;">\n      <div style="font-size: 13px; color: #64748b; margin-bottom: 4px;">词汇多样性 (TTR)</div>\n      <div style="font-size: 24px; font-weight: 800; color: #5b21b6;">[百分比]%</div>\n    </div>\n  </div>\n\n  <!-- 词汇分级分布 -->\n  <h3 style="color: #4b5563; font-size: 16px; margin-bottom: 12px; font-weight: 600;">二、词汇分级分布</h3>\n  <div style="overflow-x: auto; margin-bottom: 28px;">\n    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">\n      <thead>\n        <tr style="background: #f1f5f9; color: #475569; font-weight: 600;">\n          <th style="padding: 12px; border: 1px solid #e2e8f0;">CEFR 等级</th>\n          <th style="padding: 12px; border: 1px solid #e2e8f0;">单词数</th>\n          <th style="padding: 12px; border: 1px solid #e2e8f0;">占比</th>\n          <th style="padding: 12px; border: 1px solid #e2e8f0;">代表词汇示例</th>\n        </tr>\n      </thead>\n      <tbody>\n        <tr>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: 500; color: #1e293b;">A1 入门</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; color: #475569;">[数字]</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; color: #475569;">[百分比]%</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-style: italic; color: #64748b;">[3-5个词]</td>\n        </tr>\n        <tr style="background: #f8fafc;">\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: 500; color: #1e293b;">A2 初级</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; color: #475569;">[数字]</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; color: #475569;">[百分比]%</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-style: italic; color: #64748b;">[3-5个词]</td>\n        </tr>\n        <tr>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: 500; color: #1e293b;">B1 中级</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; color: #475569;">[数字]</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; color: #475569;">[百分比]%</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-style: italic; color: #64748b;">[3-5个词]</td>\n        </tr>\n        <tr style="background: #f8fafc;">\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: 500; color: #1e293b;">B2 中高级</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: 500; color: #d97706;">[数字]</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: 500; color: #d97706;">[百分比]%</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-style: italic; color: #64748b;">[3-5个词]</td>\n        </tr>\n        <tr>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: 500; color: #1e293b;">C1 高级</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: 500; color: #dc2626;">[数字]</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: 500; color: #dc2626;">[百分比]%</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-style: italic; color: #64748b;">[3-5个词]</td>\n        </tr>\n        <tr style="background: #f8fafc;">\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: 500; color: #1e293b;">C2 精通</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: 500; color: #991b1b;">[数字]</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: 500; color: #991b1b;">[百分比]%</td>\n          <td style="padding: 12px; border: 1px solid #e2e8f0; font-style: italic; color: #64748b;">[3-5个词]</td>\n        </tr>\n      </tbody>\n    </table>\n  </div>\n\n  <!-- 进阶词汇亮点 -->\n  <h3 style="color: #4b5563; font-size: 16px; margin-bottom: 12px; font-weight: 600;">三、进阶词汇亮点</h3>\n  <!-- 针对每个亮点词汇，重复以下这段 card 结构（生成2-3个即可） -->\n  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 12px;">\n    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">\n      <span style="font-size: 18px; font-weight: 700; color: #1e293b;">[单词]</span>\n      <span style="background: #fef3c7; color: #92400e; font-size: 12px; padding: 2px 8px; border-radius: 4px; font-weight: 600;">[CEFR等级]</span>\n    </div>\n    <div style="font-size: 14px; color: #475569; margin-bottom: 8px;">\n      <span style="font-style: italic; font-weight: 600; margin-right: 6px;">[词性].</span> [中文释义]\n    </div>\n    <div style="font-size: 13px; color: #64748b; background: #ffffff; padding: 8px 12px; border-left: 3px solid #cbd5e1; border-radius: 4px;">\n      💡 原文用法：<span style="color: #334155;">"[文中的原句]"</span>\n    </div>\n  </div>\n\n  <!-- 目标受众建议 -->\n  <h3 style="color: #4b5563; font-size: 16px; margin-top: 24px; margin-bottom: 12px; font-weight: 600;">四、学习者建议</h3>\n  <div style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 16px; border-radius: 8px; font-size: 14px;">\n    📌 <strong>适合谁学：</strong> [根据词汇分布判断适合什么水平的学习者，以及能从中学到什么]\n  </div>\n</div>',
	},
	{
		id: 'builtin-culture',
		name: 'builtin.culture',
		isBuiltIn: true,
		content: '你是一位深谙中西方文化差异的跨文化研究专家，同时也是一位高级语言教师，擅长为中国学生解码外语文本中"字面背后"的文化彩蛋。\n\n请分析以下字幕内容，深度挖掘 3-5 个涉及历史、政治体制、社会风俗或潜台词的文化背景知识点，并生成一份视觉惊艳、解析透彻、重点突出的文化解读报告。\n\n字幕内容：\n{{subtitles}}\n\n【输出与格式严厉约束】\n1. 请严格按照以下 HTML 模板输出完整报告。直接输出渲染后的 HTML 内容，不要将 HTML 包裹在 ```html 等任何代码块中，不要包含任何引导性客套话。输出必须以 "<div>" 开始，以 "</div>" 结束。\n2. 【绝对禁用 Markdown】：严禁输出任何 Markdown 语法（如 **, *, >, #, -, _ 等）。所有文本的加粗、段落、引用必须全部使用标准的 HTML 标签（如 <strong>, <p>, <blockquote>）包裹。\n3. 【智能高亮强调机制】：为了让文化解读重点突出，请在"概念透视"和"中国学生认知误区"的正文撰写中，有意识地对核心历史事件、核心官职/专有名词、关键文化盲区使用以下高亮样式进行局部强调：\n   - 黄色高亮强调标签：使用 `<span style="background: #fef08a; color: #a16207; font-weight: 700; padding: 1px 4px; border-radius: 4px; margin: 0 2px;">强调的重点词</span>` 包裹。\n\n【HTML 极致美学模板（插件视图专用）】\n<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 10px auto; padding: 24px; background: #f8fafc; border-radius: 16px; color: #1e293b; line-height: 1.6;">\n\n  <!-- 报告头部标题 -->\n  <div style="text-align: center; margin-bottom: 24px;">\n    <h2 style="margin: 0 0 6px 0; color: #0f172a; font-size: 24px; font-weight: 800;">🌍 跨文化视界 · 背景深度解读</h2>\n    <p style="margin: 0; color: #64748b; font-size: 13px;">解码地道潜台词，跨越英汉文化认知鸿沟</p>\n  </div>\n\n  <!-- 知识点卡片循环（针对每个知识点，完整复制下方这段 layout 结构） -->\n  <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); margin-bottom: 16px; overflow: hidden;">\n\n    <!-- 卡片头部（点击区域） -->\n    <details style="outline: none;" open>\n      <summary style="padding: 16px 20px; background: linear-gradient(to right, #ffffff, #f8fafc); border-bottom: 1px solid #f1f5f9; cursor: pointer; font-weight: 700; color: #0f172a; font-size: 16px; display: flex; align-items: center; justify-content: space-between; outline: none;">\n        <div>\n          <span style="background: #e0f2fe; color: #0369a1; font-size: 11px; padding: 2px 6px; border-radius: 4px; margin-right: 8px; font-weight: 600;">[类别：历史/社会/政治]</span>\n          <span>[知识点标题，如：Downing Street]</span>\n        </div>\n        <span style="font-size: 12px; color: #94a3b8;">▼ 展开/折叠</span>\n      </summary>\n\n      <!-- 卡片内页正文（全 HTML 渲染区） -->\n      <div style="padding: 20px; background: #ffffff; font-size: 14px; color: #334155; border-top: 1px dashed #e2e8f0;">\n\n        <!-- 字幕原文线索 -->\n        <div style="margin-bottom: 20px; padding: 12px 16px; background: #fafafa; border-left: 3px solid #cbd5e1; border-radius: 0 4px 4px 0;">\n          <span style="color: #94a3b8; font-weight: 600; font-size: 12px; display: block; margin-bottom: 4px;">🎬 字幕原文线索</span>\n          <p style="margin: 0; color: #475569; font-style: italic;">"[引用触发这个知识点的英文原句]"</p>\n        </div>\n\n        <!-- 概念透视 -->\n        <div style="margin-bottom: 16px;">\n          <strong style="color: #0f172a; display: block; margin-bottom: 6px; font-size: 15px;">📝 概念透视</strong>\n          <p style="margin: 0; color: #475569;">[详细解释这个现象是什么，其背后的历史或制度根源是什么。在此区域内，核心强调的核心机构名、专有名词、关键年份必须严格使用黄色高亮强调标签 `<span style="...">强调的重点词</span>` 包裹突出。]</p>\n        </div>\n\n        <!-- 心理联想与盲区 -->\n        <div style="margin-bottom: 16px;">\n          <strong style="color: #b45309; display: block; margin-bottom: 6px; font-size: 15px;">⚠️ 中国学生认知误区 / 潜台词</strong>\n          <p style="margin: 0; color: #475569;">[说明中国人容易望文生义的地方，或者这个词在母语者眼中的真实情感色彩。在此区域内，核心关键词可以使用传统的 `<strong>加粗</strong>`，也可以结合黄色高亮强调标签进行更细致的层级递进突出。]</p>\n        </div>\n\n        <!-- 汉化类比 -->\n        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px 16px; color: #166534; margin-top: 16px;">\n          <strong style="display: block; margin-bottom: 2px;">🤝 完美中文类比</strong>\n          <p style="margin: 0;">[寻找一个中国文化中神似的现象或历史事件进行接地气的类比，让中国学生秒懂]</p>\n        </div>\n\n      </div>\n    </details>\n\n  </div>\n  <!-- 循环结束 -->\n\n</div>',
	},
	{
		id: 'builtin-bilingual',
		name: 'builtin.bilingual',
		isBuiltIn: true,
		content: '## 角色设定\n你是一位极其挑剔的金牌多语种高级语言专家。你不仅关注学术核心词汇（如各语种高级证书、CEFR 高阶词汇），更关注母语使用者在高级口语和专业写作中使用的高阶搭配（Collocations）、惯用语（Idioms）及地道政论新闻文体。\n\n## 任务目标\n分析提供的外语字幕（可能包含英语、德语、法语、西班牙语等任意主流外语），将外语文本翻译成严谨的中文，并筛选出具备极高学习价值的词汇与地道表达，最后输出完整原文的双语对照标注和语言点解析报告。\n\n学习者目标外语水平：{{level}}\n\n字幕内容：\n{{subtitles}}\n\n一、文本预处理与筛选规则\n1. 标注优先级：\n   - 第一优先级：目标语种的核心学术词汇与学术短语。优先标注符合当前 CEFR（如 B2-C1）等级的动词、形容词及固定搭配。\n   - 第二优先级：新闻逻辑连接词与修辞表达。\n   - 第三优先级：地道新闻习惯用语/熟词僻义/特定语种的高级构词与变位特征。\n2. 负面清单：\n   - 禁止标注基础词汇。\n   - 禁止标注纯技术性/过于生僻的专有名词。\n   - 单块文本加粗标注数量控制在 1-3 处。若全文均为简单对话，则选择当前块中相对最具学习价值的 1 个表达进行标注。\n\n3. 【物理样式约束（极其重要）】：\n   - 【绝对禁用 Markdown】：由于输出嵌入在 HTML 容器中，严禁使用 **, *, >, # 等任何 Markdown 语法。\n   - 外语原文重点：必须严格使用 `<strong>重点内容</strong>` 标签进行加粗。\n   - 中文译文对应重点：必须严格使用 `<span style="text-decoration: underline dashed #F77F00; text-underline-offset: 4px; font-weight: bold;">橙色虚线重点</span>` 包裹。\n\n二、翻译与知识点讲解规范\n1. 翻译风格：贴合时事新闻外刊的严谨、严密、客观风格。\n2. 时间戳：100%复刻原字幕时间戳。\n3. 专家学堂知识点规范：每块字幕必须提炼 1-2 处语言知识点。讲解内容包含："核心释义 + 高级应用场景/同义替换/语种特有语法点拨"，语言要求专业、精准、干货。\n\n三、输出格式死律（格式红线）\n1. 核心格式红线：外语原文、翻译模块、知识点模块必须紧密衔接。单块内部严格禁止出现任何物理换行、严禁分段（大模型请将内容在一行内连续吐出，排版完全交给 HTML 块级标签）。\n2. 直接输出渲染后的 HTML 内容，不要将 HTML 包裹在 ```html 等任何代码块中，不要包含任何引导性客套话。\n3. 多块字幕按时间顺序依次排列，块与块之间空一行分隔。\n\n## 标准输出模板（单块内容）\n[时间戳]外语原文内容（重点用 <strong>加粗</strong>）<div style="border-left: 5px solid #84B179; padding: 10px; margin: 10px 0; background-color: #f8fafc; border-radius: 0 4px 4px 0; color: #355872;">翻译：中文翻译内容（重点用 <span style="text-decoration: underline dashed #F77F00; text-underline-offset: 4px; font-weight: bold;">橙色下划线样式</span> 标记）</div><div style="border-left: 5px solid #E36A6A; padding: 10px; margin: 10px 0; background-color: #FFFBF1; border-radius: 0 4px 4px 0; color: #69247C;">💡 高级学堂：[具体被标注词汇] —— [专业讲解内容，包含释义与目标语种的近义替换或写作/口语应用场景点拨]</div>',
	},
	{
		id: 'builtin-quiz',
		name: 'builtin.quiz',
		isBuiltIn: true,
		content: '你是资深专业第二外语测试命题专家，精通分级外语出题，严格贴合视频字幕原文出题，精准匹配学习者外语水平。\n\n学习者外语水平：{{level}}\n\n视频字幕原文内容：\n{{subtitles}}\n\n【出题硬性规则】\n1. 总共设计 10 道外语测试题，分为两大板块：\n   - Part1 单项选择题 共 5 道（题号 1-5）\n   - Part2 重点词义填空题 共 5 道（题号 6-10）\n2. 所有题目题干、解析、提示文字统一使用中文编写。\n3. 题目顺序严格按照字幕内容出现先后顺序排布，难度严格匹配填写的学习者外语等级。\n4. 所有题目素材、答案、依据全部取自给定字幕，严禁自创内容。选择题 4 个选项仅有唯一正确答案，干扰选项贴合语境具备合理性，解析必须引用字幕原句作为答题依据。\n5. 填空题优先选取字幕内高频地道搭配、学术词汇、实用短语、熟词僻义，并标注标准词性。\n\n【输出与格式严厉约束】\n1. 请严格按照以下 HTML 模板输出完整测验。直接输出渲染后的 HTML 内容，不要将 HTML 包裹在 ```html 等任何代码块中，不要包含任何引导性客套话。输出必须以 "<div>" 开始，以 "</div>" 结束。\n2. 【绝对禁用 Markdown】：严禁输出任何 Markdown 语法。所有文本必须全部使用标准的 HTML 标签包裹。\n3. 【智能高亮机制】：在解析内容、原文呈现或重点词汇解释中，请对核心关键词、答题切入点使用以下高亮样式进行局部强调：\n   - 核心强调文本（黄色高亮）：使用 `<span style="background: #fef08a; color: #a16207; font-weight: 700; padding: 1px 4px; border-radius: 4px; margin: 0 2px;">高亮词汇</span>` 包裹。\n\n【HTML 专项测验极致美学模板】\n<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 10px auto; padding: 28px; background: #f8fafc; border-radius: 16px; color: #1e293b; line-height: 1.6;">\n\n  <!-- 标题区 -->\n  <div style="text-align: center; margin-bottom: 32px; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px;">\n    <h2 style="margin: 0 0 6px 0; color: #0f172a; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">📝 外语字幕专项随堂测验</h2>\n    <p style="margin: 0; color: #64748b; font-size: 13px;">严格对齐字幕语境 · 匹配当前外语等级：<strong>{{level}}</strong></p>\n  </div>\n\n  <!-- Part1 选择题板块容器（高级雅致蓝） -->\n  <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); padding: 24px; margin-bottom: 28px;">\n    <h3 style="color: #2563eb; font-size: 18px; font-weight: 700; margin-top: 0; margin-bottom: 20px; padding-left: 12px; border-left: 4px solid #2563eb; display: flex; align-items: center; gap: 8px;">\n      <span>Part 1 单项选择题</span>\n      <span style="font-size: 12px; font-weight: normal; color: #64748b;">(每题均附带字幕原文依据)</span>\n    </h3>\n\n    <!-- 每道选择题卡片（严格循环5次） -->\n    <div style="background: #ffffff; border: 1px solid #f1f5f9; border-radius: 12px; padding: 18px; margin-bottom: 18px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.01);">\n      <p style="font-weight: 700; color: #0f172a; margin: 0 0 14px 0; font-size: 15px; display: flex; align-items: flex-start; gap: 10px;">\n        <span style="background: #2563eb; color: #ffffff; border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; flex-shrink: 0; margin-top: 1px;">[题号：1-5]</span>\n        <span>[选择题中文题干内容]</span>\n      </p>\n\n      <!-- 选项响应式网格布局 -->\n      <div style="padding-left: 34px; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-bottom: 16px;">\n        <div style="padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; color: #334155; font-size: 14px;"><strong>A.</strong> [选项A内容]</div>\n        <div style="padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; color: #334155; font-size: 14px;"><strong>B.</strong> [选项B内容]</div>\n        <div style="padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; color: #334155; font-size: 14px;"><strong>C.</strong> [选项C内容]</div>\n        <div style="padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; color: #334155; font-size: 14px;"><strong>D.</strong> [选项D内容]</div>\n      </div>\n\n      <!-- 答案交互折叠区 -->\n      <details style="outline: none;">\n        <summary style="padding: 8px 12px; font-size: 13px; color: #2563eb; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; outline: none; user-select: none; background: #eff6ff; border-radius: 6px;">\n          <span>💡 查看答案与原文依据</span>\n        </summary>\n        <div style="margin-top: 12px; padding: 16px; background: #f0f7ff; border-radius: 8px; border-left: 4px solid #2563eb; font-size: 14px;">\n          <p style="margin: 0 0 8px 0; color: #16a34a; font-weight: 800; font-size: 15px;">正确答案：[正确字母]</p>\n          <p style="margin: 0; color: #475569; line-height: 1.6;"><strong>解析依据：</strong>[解析内容。请注意对引用字幕中作为关键答题切入点的词汇或句子，使用黄色高亮强调标签 `<span style="...">高亮词</span>` 进行标注。]</p>\n        </div>\n      </details>\n    </div>\n    <!-- 选择题单体结束 -->\n\n  </div><!-- Part1 结束 -->\n\n  <!-- Part2 重点词义填空题板块容器（温暖活力橙） -->\n  <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); padding: 24px;">\n    <h3 style="color: #ea580c; font-size: 18px; font-weight: 700; margin-top: 0; margin-bottom: 20px; padding-left: 12px; border-left: 4px solid #ea580c; display: flex; align-items: center; gap: 8px;">\n      <span>Part 2 重点词义填空题</span>\n      <span style="font-size: 12px; font-weight: normal; color: #64748b;">(高频语境·主动回忆内化)</span>\n    </h3>\n\n    <!-- 每道填空题卡片（严格循环5次） -->\n    <div style="background: #ffffff; border: 1px solid #f1f5f9; border-radius: 12px; padding: 18px; margin-bottom: 18px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.01);">\n      <p style="font-weight: 700; color: #0f172a; margin: 0 0 12px 0; font-size: 15px; display: flex; align-items: flex-start; gap: 10px;">\n        <span style="background: #ea580c; color: #ffffff; border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; flex-shrink: 0; margin-top: 1px;">[题号：6-10]</span>\n        <span>[填空中文题干说明，核心关键词用 ______ 替换]</span>\n      </p>\n\n      <!-- 原文字句高亮块 -->\n      <div style="background: #fafafa; border-radius: 6px; padding: 10px 14px; margin-left: 34px; margin-bottom: 12px; font-family: Georgia, serif; font-style: italic; color: #475569; font-size: 14.5px; border-left: 2px solid #e2e8f0;">\n        "[挖空后的完整外语句段，挖空处统一用 <span style="color: #ea580c; font-weight: bold; border-bottom: 2px solid #ea580c; padding: 0 4px;">_______</span> 标记]"\n      </div>\n\n      <!-- 提示小标签 -->\n      <div style="padding-left: 34px; margin-bottom: 16px; display: flex; gap: 8px; flex-wrap: wrap;">\n        <span style="background: #f1f5f9; color: #475569; padding: 3px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">词性：[具体词性]</span>\n        <span style="background: #f1f5f9; color: #475569; padding: 3px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">释义：[核心中文释义]</span>\n      </div>\n\n      <!-- 答案交互折叠区 -->\n      <details style="outline: none;">\n        <summary style="padding: 8px 12px; font-size: 13px; color: #ea580c; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; outline: none; user-select: none; background: #fff7ed; border-radius: 6px;">\n          <span>💡 查看答案与词汇解析</span>\n        </summary>\n        <div style="margin-top: 12px; padding: 16px; background: #fef9ef; border-radius: 8px; border-left: 4px solid #ea580c; font-size: 14px;">\n          <p style="margin: 0 0 8px 0; color: #16a34a; font-weight: 800; font-size: 16px; font-family: monospace;">正确答案：[正确单词或短语]</p>\n          <p style="margin: 0; color: #475569; line-height: 1.6;"><strong>用法解析：</strong>[该词在语境中的核心要点。请记得在讲解中对核心搭配使用黄色高亮强调标签 `<span style="...">核心短语</span>` 进行再次突出。]</p>\n        </div>\n      </details>\n    </div>\n    <!-- 填空题单体结束 -->\n\n  </div><!-- Part2 结束 -->\n\n</div>',
	},
	{
		id: 'builtin-blindfill',
		name: 'builtin.blindfill',
		isBuiltIn: true,
		content: '你是一位精通认知心理学的高级语言教学专家，擅长利用主动回忆（Active Recall）和语境线索帮助学生内化地道外语短语。\n\n请分析以下字幕内容，精准挑选出 3 个最核心、最地道、最值得第二外语学生内化的"功能性动词短语"或"高级习语"，生成一套"盲记填空挑战"互动卡片。\n\n字幕内容：\n{{subtitles}}\n\n【输出与格式严格约束】\n1. 请严格按照以下 HTML 模板输出完整报告。直接输出渲染后的 HTML 内容，不要将 HTML 包裹在 ```html 等任何代码块中，不要包含任何引导性客套话。输出必须以 "<div>" 开始，以 "</div>" 结束。\n2. 【全量 HTML 化排版】：严禁输出任何 Markdown 语法（如 **, *, >, #）。所有文本排版必须全部使用标准的 HTML 标签（如 <div>, <strong>, <p>, <span>）包裹，充分利用内联 CSS 展现极致的排版细节。\n3. 【智能高亮机制】：在知识点正文中，请对核心高频词汇、关键年份/机构、或中国学生常错的核心概念，使用以下高亮样式进行局部强调：\n   - 局部高亮标签：使用 `<span style="background: #fef08a; color: #a16207; font-weight: 700; padding: 1px 4px; border-radius: 4px; margin: 0 2px;">高亮文本</span>` 包裹。\n\n【HTML 盲记挑战极致美学模板】\n<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 10px auto; padding: 24px; background: #f8fafc; border-radius: 16px; color: #1e293b; line-height: 1.6;">\n\n  <!-- 模块头部标题 -->\n  <div style="text-align: center; margin-bottom: 24px;">\n    <h2 style="margin: 0 0 6px 0; color: #1e3a8a; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">🧠 盲记填空 · 核心地道金句挑战</h2>\n    <p style="margin: 0; color: #64748b; font-size: 13px;">拒绝被动阅读！触发大脑主动检索，一秒内化地道表达</p>\n  </div>\n\n  <!-- 题目卡片循环（针对3道题，完整复制下方这段 layout 结构） -->\n  <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); margin-bottom: 20px; padding: 20px; overflow: hidden;">\n\n    <!-- 卡片头部：题号与地道指数 -->\n    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 10px;">\n      <span style="background: #eff6ff; color: #1d4ed8; font-size: 12px; padding: 3px 10px; border-radius: 6px; font-weight: 700;">Challenge [题号：01/02/03]</span>\n      <span style="font-size: 13px; color: #f59e0b; font-weight: 600;">🔥 地道指数：[★★★★★ / ★★★★☆]</span>\n    </div>\n\n    <!-- 核心题目区：语境挖空 -->\n    <div style="background: #f1f5f9; border-radius: 8px; padding: 16px; margin-bottom: 16px;">\n      <span style="color: #64748b; font-weight: 600; font-size: 11px; display: block; margin-bottom: 6px; letter-spacing: 0.5px;">🎬 语境挖空题目</span>\n      <p style="margin: 0; color: #0f172a; font-size: 16px; font-weight: 500; font-family: Georgia, serif; line-height: 1.5;">\n        "[挖空后的外文原句，如：The scandal has <span style="color: #3b82f6; font-weight: bold; border-bottom: 2px solid #3b82f6; padding: 0 8px;">_______</span> the country into political turmoil.]"\n      </p>\n    </div>\n\n    <!-- 辅助线索区：中文释义与场景 -->\n    <div style="margin-bottom: 20px; font-size: 14px; color: #475569; padding-left: 4px;">\n      <p style="margin: 0 0 6px 0;"><strong>💡 中文句意：</strong>[整句话的中文翻译，把对应被挖空部分的中文加粗]</p>\n      <p style="margin: 0;"><strong>🎯 核心用法：</strong>[简要说明这个被挖空的短语在什么场景下最常用，给学习者提供联想线索]</p>\n    </div>\n\n    <!-- 互动隐藏答案区（已移除 open 属性，默认保持折叠状态） -->\n    <details style="outline: none; background: #fafafa; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">\n      <summary style="padding: 12px 16px; font-size: 13px; color: #2563eb; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: space-between; outline: none; user-select: none; background: linear-gradient(to right, #ffffff, #fafafa);">\n        <span>👀 揭晓正确答案 & 跨文化微评</span>\n        <span style="font-size: 11px; color: #94a3b8;">展开/折叠 ▼</span>\n      </summary>\n\n      <!-- 答案内页全结构渲染画布 -->\n      <div style="padding: 16px; background: #ffffff; font-size: 14px; border-top: 1px dashed #e2e8f0;">\n\n        <!-- 正确答案高亮 -->\n        <div style="margin-bottom: 16px;">\n          <span style="color: #64748b; font-size: 12px; display: block; margin-bottom: 4px; font-weight: 600;">✅ 正确填空</span>\n          <strong style="font-size: 18px; color: #16a34a; font-family: monospace; background: #f0fdf4; padding: 4px 10px; border-radius: 6px; border: 1px solid #bbf7d0;">[正确录入的单词或短语，如：thrown]</strong>\n        </div>\n\n        <!-- 跨文化名师微评 -->\n        <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 14px; color: #14532d; font-size: 13.5px; border-radius: 0 8px 8px 0; margin-top: 10px;">\n          <strong style="color: #15803d; display: block; margin-bottom: 4px;">💡 老师划重点</strong>\n          <p style="margin: 0; line-height: 1.5;">[用一两句话点拨这个词的高级之处。在讲解中可以使用黄色高亮标签强调一些衍生表达。]</p>\n        </div>\n\n      </div>\n    </details>\n\n  </div>\n  <!-- 循环结束 -->\n\n</div>',
	},
];
export interface VocabularyEntry {
	id: string;              // UUID v4
    word: string;            // The word itself (lowercase)
    phonetic?: string;       // IPA phonetic string, e.g. /ˈwɜːrd/
    definition: string;      // Primary definition (plain text or HTML)
    partOfSpeech?: string;   // e.g. noun, verb, adj
    contextSnippet: string;  // Full sentence extracted from note
    contextTranslation?: string;  // Translation of the context sentence
    sourceNotePath: string;  // Vault-relative path to the source note
    addedTime: number;       // Unix timestamp (ms)
    fsrsData: FSRSData;
    masteredAt?: number;     // Unix timestamp when marked as mastered (for auto-cleanup)
}

/**
 * Review log stored in IndexedDB
 */
export interface ReviewLog {
    logId: string;
    vocabId: string;
    reviewTime: number;      // Unix timestamp (ms)
    rating: 1 | 2 | 3 | 4;  // 1=Again, 2=Hard, 3=Good, 4=Easy
    scheduledDays: number;
    stateBefore: number;
    language: string;       // Language tag for this review log
}

/**
 * Tombstone for a deleted flashcard — lets deletions propagate across devices
 * via sync. Keyed by the deleted card's UUID; also carries (language, word) so
 * a peer's independently-created card for the same word is removed too. A card
 * re-created after deletion (newer addedTime) is preserved — see import merge.
 */
export interface DeletedCardTombstone {
    id: string;             // UUID of the deleted card (primary key)
    language: string;       // language the card belonged to
    word: string;           // lowercase word of the deleted card
    deletedAt: number;      // ms epoch — last-write-wins on sync merge
}

/**
 * Vocabulary test result stored in IndexedDB
 */
export interface VocabTestResult {
    id: string;
    language: string;
    testTime: number;
    estimatedSize: number;
    bandResults: {
        band: string;
        hitRate: number;
        falseAlarmRate: number;
        estimatedSize: number;
        correctedRate: number;
    }[];
    pseudoHitRate: number;
    honestyIndex: number;
}

/**
 * Current vocabulary size state (single record per language)
 */
export interface VocabSizeState {
    id: string;              // '{language}-current'
    language: string;
    baseTestSize: number;
    learnedWordIds: string[];
    lastTestTime: number;
}

/**
 * Pet state for the gamified learning companion (one record per language).
 * Permanent progress (totalExp/totalReviews/streak) is persisted; derived
 * values (level/form/energy/mood) are computed on the fly to avoid double-writes.
 * Safe-guarded: permanent progress never regresses; energy 0 = sleeping (not death);
 * streak break resets to 1 with no penalty.
 */
export interface PetState {
    id: string;                        // '{language}-pet'
    language: string;
    totalExp: number;                  // cumulative exp, includes streak milestone bonuses
    totalReviews: number;              // cumulative review count
    species: string | null;            // null = still in egg; set on L3->L4 hatch (random)
    lastReviewTimestamp: number;       // ms; anchor for energy derivation
    lastReviewDayKey: string;          // local-day key 'YYYY-MM-DD'
    currentStreak: number;             // current consecutive review days
    longestStreak: number;
    awardedStreakMilestones: number[]; // idempotent dedup of milestone bonuses
    lastStreakDayKey: string;          // most recent active-day key for streak calc
    updatedAt: number;                 // ms; last-write-wins on sync merge
}

/**
 * A single item in the vocabulary test (real word or pseudoword)
 */
export interface VocabTestItem {
    word: string;
    isPseudo: boolean;
    band: string;
    bandIndex: number;
}


export interface LMESettings {
    // UI Language
    language: 'zh' | 'en';

    // Language Selection
    activeLanguage: 'english' | 'german' | 'french' | 'spanish' | 'korean' | 'russian' | 'japanese' | 'chinese';

    // Dictionary
    dictionaryProvider: 'youdao-free' | 'google-free' | 'bing-free' | 'local' | 'mdx';
    mdxPath: string;            // Absolute path to .mdx file (dict 1)
    mddPath: string;            // Absolute path to .mdd file (dict 1)
    mdxCssPath: string;         // Absolute path to .css file (dict 1, optional)
    mdxPath2: string;           // Absolute path to .mdx file (dict 2, optional)
    mddPath2: string;           // Absolute path to .mdd file (dict 2, optional)
    mdxCssPath2: string;        // Absolute path to .css file (dict 2, optional)

    // Language-specific MDX paths
    englishMdxPath: string;
    englishMddPath: string;
    englishMdxCssPath: string;
    englishMdxPath2: string;
    englishMddPath2: string;
    englishMdxCssPath2: string;


    // Language-specific vocab notebooks
    englishVocabNoteFolder: string;
    englishVocabNoteFileName: string;

    // Language-specific online dictionary fallback
    englishOnlineDictEnabled: boolean;
    englishOnlineDict: 'youdao-free' | 'google-free' | 'mymemory-free';




    // Batch Flashcard

    // Flashcard
    dailyReviewLimit: number;
    flashcardStudyMode: 'flip' | 'audio' | 'write';  // Study mode: 翻卡(单词面) / 听力 / 填空
    autoCleanupMastered: boolean;   // Auto-delete mastered cards after delay
    cleanupDelayDays: number;       // Days to wait before auto-cleanup (default 7)

    // Video
	    defaultPlaybackRate: number;
	    shadowingBufferMs: number;  // ms before next timestamp to pause (default 500)
	    videoDownloadFolder: string; // Vault-relative folder for Bilibili video downloads
	    videoNoteFolder: string; // Vault-relative folder for generated video notes
	    workshopCatalogFolder: string;      // 旧字段:已迁插件 sidecar workshop-catalog.json(3.6.0,防 data.json 被另一端旧快照覆写);仅作启动迁移源+旧版本 build 兼容镜像,读值走 plugin.getWorkshopFolder()
	    workshopCatalogSeeded: boolean;     // 自带 sample 是否已首次播种(只播一次,之后尊重用户删除,不重建)
	    workshopProgress: Record<string, { practiced: boolean; practiceCount: number; lastPracticedAt: number }>;  // 目录页练习追踪(键=vault 相对路径)
	    shadowingPlayerHeight: number; // Desktop custom player height, 0 = auto
    bilibiliSessdata: string;   // B站 SESSDATA cookie for subtitle access on mobile

    // YouTube 订阅三字段仅作一次性迁移源(旧 data.json 残留):3.6.0 起主存储为插件
    // 目录 sidecar youtube-rss.json(见 services/youtube-rss-store.ts 头注,防 data.json
    // 被同 vault 另一端的旧快照覆写丢订阅);启动时吸收后即清空。刷新间隔/通知仍存 data.json。
    youtubeSubscriptions: import('./services/youtube-rss').YouTubeSubscription[];
    youtubeFeedItems: import('./services/youtube-rss').YouTubeFeedItem[];
    youtubeSubscriptionCategories: string[];
    youtubeRssCheckIntervalMin: number;
    youtubeRssNotifications: boolean;

    // AI Integration
    aiProvider: string;  // 'deepseek' | 'gemini' | 'ark' | custom provider id
    deepseekApiKey: string;
    geminiApiKey: string;
    arkApiKey: string;
    customProviders: CustomAIProvider[];
    aiProviders: AIProviderConfig[];   // unified provider list (source of truth); legacy fields kept for migration

    // AI Analysis (shadowing view)
    aiAnalysisProvider: string;  // 'deepseek' | 'gemini' | custom provider id  (default AI)
    aiAnalysisApiKey: string;
    aiAnalysisModel: string;
    englishLevel: 'beginner' | 'intermediate' | 'advanced' | 'native';
    aiPrompts: PromptTemplate[];
    aiAnalysisHistory: AIAnalysisHistoryEntry[];   // recent AI analysis reports (max 50, newest first)

    // Per-feature AI provider override ('' = use default aiAnalysisProvider)
    aiDocAnalysisProvider: string;      // AI analysis
    aiFlashcardFillProvider: string;    // One-click flashcard auto-fill
    aiScoringProvider: string;          // AI scoring

    // Audio transcription (Whisper-compatible /audio/transcriptions endpoint)
    transcriptionBaseUrl: string;       // e.g. 'https://api.openai.com/v1'
    transcriptionApiKey: string;
    transcriptionModel: string;         // e.g. 'whisper-1', 'whisper-large-v3'

    // Workshop catalog seeding: 0/absent = never; 1 = legacy (2 samples); 2 = +8 TED-Ed notes
    workshopCatalogSeedVersion?: number;
    // YouTube subscriptions default-channel seeding: 0/absent = not yet; 1 = TED-Ed + BBC Learning English
    youtubeSubsSeedVersion?: number;

    // SRT → subtitle note conversion
    subtitleNoteFolder: string;         // default output folder for generated subtitle notes ('' = ask each run)
    autoOpenSubtitleNote: boolean;      // auto-open the generated note after conversion

    // UI
    ribbonDictIcon: boolean;
    ribbonFlashcardIcon: boolean;
    ribbonShadowingIcon: boolean;


    // Flashcard Sync (bidirectional via per-device vault files)

    // Video Bookmarks (Shadowing Workshop) — keyed by sourceNotePath

    // UI Theme
    uiStyle: 'paper-ink' | 'coral-warmth' | 'candy-pop' | 'lavender-dream' | 'mint-coach' | 'rose-blush' | 'mindful-oasis' | 'ocean-glass' | 'aurora-prism' | 'neon-lime';

    // Vocab Size Test
    vocabTestCompleted: boolean;
    vocabTestReminderShown: boolean;

    navigationPanelOpened: boolean;

    // 社区免费版:首次加载欢迎弹窗(基础版vs高级版对照)是否已展示过
    welcomeModalShown: boolean;

    // Double-click word lookup (desktop only; mobile unaffected)
    doubleClickLookupEnabled: boolean;

    // Flashcard review reminder (per-language; English default on, others off)
    englishFlashcardReminderEnabled: boolean;
    englishFlashcardReminderTime: string;
    flashcardReminderLastShown: Record<string, string>;  // lang -> YYYY-MM-DD (once-per-day dedup)

    // Pet (gamified learning-progress companion)
    petEnabled: boolean;

    // Graded vocabulary annotation (English CEFR + CN exam word lists)
}

export const DEFAULT_SETTINGS: LMESettings = {
    // UI Language
    language: 'zh',

    // Language
    activeLanguage: 'english',

    // Dictionary
    dictionaryProvider: 'youdao-free',
    mdxPath: '',
    mddPath: '',
    mdxCssPath: '',
    mdxPath2: '',
    mddPath2: '',
    mdxCssPath2: '',

    // Language-specific MDX paths
    englishMdxPath: '',
    englishMddPath: '',
    englishMdxCssPath: '',
    englishMdxPath2: '',
    englishMddPath2: '',
    englishMdxCssPath2: '',

    // Language-specific vocab notebooks
    englishVocabNoteFolder: '',
    englishVocabNoteFileName: '英语生词本',

    // Language-specific online dictionary fallback
    englishOnlineDictEnabled: true,
    englishOnlineDict: 'youdao-free',
    dailyReviewLimit: 50,
    flashcardStudyMode: 'flip',
    autoCleanupMastered: false,
    cleanupDelayDays: 7,
	    defaultPlaybackRate: 1.0,
	    shadowingBufferMs: 500,
	    videoDownloadFolder: '',
	    videoNoteFolder: '',
	    workshopCatalogFolder: '',
	    workshopCatalogSeeded: false,
	    workshopProgress: {},
	    shadowingPlayerHeight: 0,
	    bilibiliSessdata: '',
	    youtubeSubscriptions: [],
	    youtubeFeedItems: [],
	    youtubeSubscriptionCategories: [],
	    youtubeRssCheckIntervalMin: 60,
	    youtubeRssNotifications: true,
    aiProvider: 'deepseek',
    deepseekApiKey: '',
    geminiApiKey: '',
    arkApiKey: '',
    customProviders: [],
    aiProviders: [],
    aiAnalysisProvider: 'deepseek',
    aiAnalysisApiKey: '',
    aiAnalysisModel: '',
    englishLevel: 'intermediate',
    aiPrompts: [],
    aiAnalysisHistory: [],

    // Per-feature AI provider override ('' = default)
    aiDocAnalysisProvider: '',
    aiFlashcardFillProvider: '',
    aiScoringProvider: '',

    // Audio transcription (Whisper-compatible)
    transcriptionBaseUrl: 'https://api.openai.com/v1',
    transcriptionApiKey: '',
    transcriptionModel: 'whisper-1',
    subtitleNoteFolder: '',
    autoOpenSubtitleNote: true,
    ribbonDictIcon: true,
    ribbonFlashcardIcon: true,
    ribbonShadowingIcon: true,

    // Flashcard Sync

    // UI Theme
    uiStyle: 'paper-ink',

    // Vocab Size Test
    vocabTestCompleted: false,
    vocabTestReminderShown: false,

    // First-run navigation
    // First-run navigation
    navigationPanelOpened: false,

    welcomeModalShown: false,

    // Double-click word lookup
    doubleClickLookupEnabled: true,

    // Flashcard review reminder (English default on, others off)
    englishFlashcardReminderEnabled: true,
    englishFlashcardReminderTime: '09:00',
    flashcardReminderLastShown: {},

    // Video Bookmarks

    // Pet
    petEnabled: true,

    // Graded vocabulary annotation
};

/**
 * Dictionary result (from API or local lookup)
 */
export interface DictResult {
    word: string;
    phonetic?: string;
    partOfSpeech?: string;
    definition: string;
    explains?: string[];   // Additional explanations
    examples?: Array<{ en: string; zh: string }>; // Bilingual example sentences
    webPhrases?: string[]; // Common phrases / collocations
    srcMdx?: string;       // Path to source MDX (if local)
    srcMyMemory?: boolean; // Flag for MyMemory API source
    srcYoudao?: boolean;   // Flag for Youdao API source
    srcGoogle?: boolean;   // Flag for Google Translate source
    srcJisho?: boolean;    // Flag for Jisho.org API source (Japanese)
    style?: string;        // Optional CSS for MDX
    lemma?: string;        // Lemmatized form (if different from word)
    inflectionInfo?: string; // Information about inflection (e.g., "irregular", "separable")
    originalWord?: string; // Original user input (if lemmatized)
    dictionaryIndex?: number; // Which dictionary provided the result (1 or 2)
    dictId?: string;       // Dictionary ID for MDX resource lookup
    dictName?: string;     // Display name of the source dictionary
}

/**
 * A timestamp block parsed from a subtitle note
 */
export interface TimestampBlock {
    startSec: number;    // Start time in seconds
    endSec: number;      // End time in seconds (inferred from next block)
    text: string;        // The text content of this block
    lineIndex: number;   // Line index in the document
    teaching?: string;   // Optional inline teaching note (::teach block) — key language point
}

/**
 * Result of AI pronunciation scoring
 */
export interface PronunciationScore {
    overall: number;          // 0-100
    accuracy: number;         // 0-100 word accuracy
    fluency: number;          // 0-100 rhythm/smoothness
    completeness: number;     // 0-100 how much of original was spoken
    recognizedText: string;   // what the AI heard
    summary: string;          // brief one-line comment for interactive feel
    wordComparison: Array<{
        word: string;
        status: 'correct' | 'missing' | 'wrong' | 'extra';
    }>;
    tips: string[];           // 1-3 improvement tips
}
