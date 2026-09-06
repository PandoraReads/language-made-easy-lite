// @ts-nocheck

/**
 * Language Made Easy — 多语言学习增强插件
 * Copyright (c) 2024-2026 PandoraReads
 * Author: PandoraReads (WeChat) | panrunrun@gmail.com
 */
import {
	Plugin,
	TFile,
	WorkspaceLeaf,
	Notice,
	Platform,
	ItemView,
	setIcon,
	getIcon,
	App,
	TextComponent,
	Modal,
	StatusBarItem,
	Menu,
	MarkdownView
} from 'obsidian';
import { LMESettingTab, DEFAULT_SETTINGS } from './Settings';
import type { LMESettings, PromptTemplate, MdxDictionary } from './models';
import { BUILTIN_PROMPTS, BUILTIN_PROVIDERS } from './models';
import { AIService } from './core/AIService';
import { DictView, DICT_VIEW_TYPE } from './views/dict-view';
import { FlashcardView, FLASHCARD_VIEW_TYPE, AddFlashcardModal } from './views/flashcard-view';
import { ShadowingView, SHADOWING_VIEW_TYPE, PromptSelectModal, FileSelectModal } from './views/shadowing-view';
import { WorkshopCatalogView, WORKSHOP_CATALOG_VIEW_TYPE, DEFAULT_WORKSHOP_FOLDER } from './views/workshop-catalog-view';
import { YouTubeSubscriptionsView, YOUTUBE_SUBSCRIPTIONS_VIEW_TYPE } from './views/youtube-subscriptions-view';
import { YouTubePlayerView, YOUTUBE_PLAYER_VIEW_TYPE } from './views/youtube-player-view';
import { YouTubeRssService, showRefreshNotice } from './services/youtube-rss-service';
import {
    WORKSHOP_FOLDER_STORE_VERSION,
    WorkshopFolderState,
    emptyFolderState,
    parseFolderState,
    serializeFolderState,
    mergeFolderState,
} from './services/workshop-folder-store';
import { AIReportCatalogView, AI_REPORT_CATALOG_VIEW_TYPE } from './views/ai-report-catalog-view';
import sampleEveryday from '../samples/sample-everyday-english.md';
import sampleMiniTalk from '../samples/sample-mini-talk.md';
import { AIAnalysisView, AI_ANALYSIS_VIEW_TYPE } from './views/ai-analysis-view';
import { NavigationPanelView, NAVIGATION_VIEW_TYPE } from './views/navigation-panel-view';
import { HtmlGuideView, HTML_GUIDE_VIEW_TYPE } from './views/html-guide-view';
import { FlashcardReminderModal } from './views/flashcard-reminder-modal';
import { MediaFileSelectModal } from './views/media-file-select-modal';
import { SrtFileSelectModal } from './views/srt-file-select-modal';
import { SrtBatchSelectModal } from './views/srt-batch-select-modal';
import { TextInputModal } from './views/text-input-modal';
import { parseSrt, buildSubtitleNoteBody, segmentsToTimestampLines } from './utils/srt';
import { db } from './core/Database';
import { FlashcardManagerModal } from './ui/flashcard-manager-modal';
import { UpgradeModal } from './ui/upgrade-modal';
import { checkSubtitleWeeklyQuota } from './core/free-quota';
import { WelcomeModal } from './ui/welcome-modal';
import { randomUUID } from './mocks/crypto';
import { initI18n, t } from './i18n';

// PandoraReads — 插件核心入口
export default class LanguageMadeEasyPlugin extends Plugin {
	settings: LMESettings;
	public youtubeRssService: YouTubeRssService;
	private languageStatusBar: StatusBarItem | null = null;
	private lookupMenuEl: HTMLElement | null = null;
	private reminderTimer: number | null = null;
	private featuresInitialized = false;
	private lastKnownObsidianDarkMode = false;
	/**
	 * 工坊目录文件夹的内存态:主存储在插件目录 sidecar workshop-catalog.json
	 * (data.json 的 workshopCatalogFolder 字段会被同 vault 另一端的旧快照覆写,
	 * 桌面端设置的路径被手机端高频写盘抹回默认,与词典/aiPrompts/YouTube 订阅
	 * 同一根因)。settings 字段仅作启动迁移源与旧版本 build 的兼容镜像。
	 */
	private workshopFolderState: WorkshopFolderState = emptyFolderState();

	async onload() {
		await this.loadSettings();
		this.youtubeRssService = new YouTubeRssService(this);
		// 订阅数据主存储在插件目录 sidecar youtube-rss.json(防 data.json 被 iCloud 旧快照覆写);
		// 内部吸收旧 data.json 三字段并清空,失败只降级不阻断启动
		await this.youtubeRssService.initialize();
		await db.configureVault(this.getVaultStorageKey());
		// Initialize i18n with saved language preference
		initI18n('zh-CN');
		this.applyUiTheme();
		this.watchObsidianThemeChanges();

		// 1. Register Views
		this.registerView(DICT_VIEW_TYPE, (leaf) => new DictView(leaf, this));
		this.registerView(FLASHCARD_VIEW_TYPE, (leaf) => new FlashcardView(leaf, this));
		this.registerView(SHADOWING_VIEW_TYPE, (leaf) => new ShadowingView(leaf, this));
		this.registerView(WORKSHOP_CATALOG_VIEW_TYPE, (leaf) => new WorkshopCatalogView(leaf, this));
		this.registerView(YOUTUBE_SUBSCRIPTIONS_VIEW_TYPE, (leaf) => new YouTubeSubscriptionsView(leaf, this));
		this.registerView(YOUTUBE_PLAYER_VIEW_TYPE, (leaf) => new YouTubePlayerView(leaf, this));
		this.registerView(AI_ANALYSIS_VIEW_TYPE, (leaf) => new AIAnalysisView(leaf, this));
		this.registerView(AI_REPORT_CATALOG_VIEW_TYPE, (leaf) => new AIReportCatalogView(leaf, this));
		this.registerView(NAVIGATION_VIEW_TYPE, (leaf) => new NavigationPanelView(leaf, this));
		this.registerView(HTML_GUIDE_VIEW_TYPE, (leaf) => new HtmlGuideView(leaf));

		// 2. Initial UI — 社区免费版:所有功能视图直接初始化,无激活门禁
		this.initializeFeatures();

		// Settings Tab (Always available)
		this.addSettingTab(new LMESettingTab(this.app, this));
	}

	private getVaultStorageKey(): string {
		const adapter = this.app.vault.adapter as any;
		try {
			if (typeof adapter.getBasePath === 'function') {
				const basePath = adapter.getBasePath();
				if (basePath) return String(basePath);
			}
		} catch {
			// Fall back below.
		}
		return this.app.vault.getName();
	}

	/**
	 * Initialize actual workspace features
	 */
	private initializeFeatures() {
		if (this.featuresInitialized) return;
		this.featuresInitialized = true;

		this.app.workspace.onLayoutReady(() => this.openNavigationOnFirstRun());
		// 0a. 社区免费版:首次加载弹欢迎窗(基础版 vs 高级版对照 + 微信引导)
		this.app.workspace.onLayoutReady(() => this.showWelcomeOnFirstLoad());
		// 0b. Flashcard review reminder (once/day, per-language, time-gated)
		this.app.workspace.onLayoutReady(() => this.maybeShowFlashcardReminder());

		// 1. Status Bar
		this.languageStatusBar = this.addStatusBarItem();
		this.updateLanguageStatusBar();

		// 2. Ribbon Icons
		this.addRibbonIcon('graduation-cap', t('ribbon.navigation'), () => this.activateView(NAVIGATION_VIEW_TYPE, 'main'));
		this.addRibbonIcon('brain', t('ribbon.flashcard'), () => this.activateView(FLASHCARD_VIEW_TYPE));
		this.addRibbonIcon('play-circle', t('ribbon.shadowing'), () => this.activateView(SHADOWING_VIEW_TYPE, 'main'));

		// 3b. 社区免费版:分级词汇标注引擎已随完整版移除。这里仅保留对老笔记中
		// 已烘焙标注 span(data-lme-gv-baked)的查词挂载,让它们仍可点击查词。
		this.registerMarkdownPostProcessor((el) => {
			el.querySelectorAll('span[data-lme-gv-baked="1"][data-word]').forEach((node) => {
				const host = node as HTMLElement;
				if (host.dataset.lmeGvWired === '1') return;
				host.dataset.lmeGvWired = '1';
				host.onclick = () => {
					const word = host.getAttribute('data-word') || '';
					if (word) void this.triggerLookup(word);
				};
			});
		});

		// 4. Commands
		this.addCommand({
			id: 'open-navigation-panel',
			name: t('commands.openNavigation'),
			callback: () => this.activateView(NAVIGATION_VIEW_TYPE, 'main'),
		});
		this.addCommand({
			id: 'open-dict-view',
			name: t('commands.openDict'),
			callback: () => this.activateView(DICT_VIEW_TYPE, 'right'),
		});
		this.addCommand({
			id: 'open-flashcard-view',
			name: t('commands.openFlashcard'),
			callback: () => this.activateView(FLASHCARD_VIEW_TYPE, 'main'),
		});
		this.addCommand({
			id: 'open-flashcard-manager',
			name: t('commands.manageFlashcard'),
			callback: () => {
				new FlashcardManagerModal(this.app, this).open();
			},
		});
		this.addCommand({
			id: 'add-flashcard',
			name: t('commands.addFlashcard'),
			callback: () => {
				new AddFlashcardModal(this.app, this).open();
			},
		});
		// 社区免费版:分级词汇标注(开启/清除/烘焙)为完整版功能,弹付费引导
		this.addCommand({
			id: 'open-graded-vocab',
			name: t('commands.openGradedVocab'),
			callback: () => {
				new UpgradeModal(this.app, t('commands.openGradedVocab')).open();
			},
		});
		this.addCommand({
			id: 'clear-graded-vocab',
			name: t('commands.clearGradedVocab'),
			callback: () => {
				new UpgradeModal(this.app, t('commands.clearGradedVocab')).open();
			},
		});
		this.addCommand({
			id: 'bake-graded-vocab',
			name: t('commands.bakeGradedVocab'),
			callback: () => {
				new UpgradeModal(this.app, t('commands.bakeGradedVocab')).open();
			},
		});
		// 社区免费版:闪卡多端同步为完整版功能,弹付费引导(命令保留)
		this.addCommand({
			id: 'sync-flashcards',
			name: t('commands.syncFlashcard'),
			callback: () => {
				new UpgradeModal(this.app, t('commands.syncFlashcard')).open();
			}
		});

		// AI Analyze Current Document Command
		this.addCommand({
			id: 'ai-analyze-document',
			name: t('commands.aiAnalyze'),
			callback: () => {
				const settings = this.settings;
				if (!AIService.resolveProvider(settings, 'docAnalysis').apiKey) {
					new Notice(t('errors.aiKeyNotSet'));
					return;
				}
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					new Notice(t('errors.docEmpty'));
					return;
				}
				(async () => {
					try {
						const content = await this.app.vault.read(activeFile);
						const blocks = contentToBlocks(content);
						if (blocks.length === 0) {
							new Notice(t('errors.docEmpty'));
							return;
						}
						const allPrompts: PromptTemplate[] = [...BUILTIN_PROMPTS, ...(settings.aiPrompts || [])];
						if (allPrompts.length === 1) {
							await executeDocAnalysis(this, blocks, allPrompts[0].content, { name: allPrompts[0].name, isBuiltIn: !!allPrompts[0].isBuiltIn });
						} else {
							const promptModal = new PromptSelectModal(this.app, allPrompts, async (selected) => {
								await executeDocAnalysis(this, blocks, selected.content, { name: selected.name, isBuiltIn: !!selected.isBuiltIn });
							});
							promptModal.open();
						}
					} catch (err) {
						console.error('[LME] ai-analyze-document failed:', err);
						new Notice(t('errors.docReadFailed'));
					}
				})();
			},
		});


		// Open AI Analysis sidebar with most recent report
		this.addCommand({
			id: 'open-ai-analysis',
			name: t('commands.openAiPanel'),
			callback: async () => {
				await this.activateView(AI_ANALYSIS_VIEW_TYPE, 'right');
				const leaves = this.app.workspace.getLeavesOfType(AI_ANALYSIS_VIEW_TYPE);
				if (leaves.length > 0) {
					const aiView = leaves[0].view as any;
					if (aiView.loadMostRecent) {
						const loaded = aiView.loadMostRecent();
						if (!loaded) {
							new Notice(t('errors.noHistory'));
						}
					}
				}
			},
		});

		// Batch Flashcard Command — 社区免费版:完整版功能,弹付费引导
		this.addCommand({
			id: 'batch-flashcard',
			name: t('commands.batchFlashcard'),
			callback: () => {
				new UpgradeModal(this.app, t('commands.batchFlashcard')).open();
			},
		});

		// Language Switching Commands
		const languages = [
			{ id: 'english', name: 'English' },
			{ id: 'german', name: 'Deutsch' },
			{ id: 'french', name: 'Français' },
			{ id: 'spanish', name: 'Español' },
				{ id: 'korean', name: '한국어' },
				{ id: 'russian', name: 'Русский' },
				{ id: 'japanese', name: '日本語' },
				{ id: 'chinese', name: '中文' }
		];

		languages.forEach(lang => {
			this.addCommand({
				id: 'switch-to-' + lang.id,
				name: t('commands.switchLang', { lang: lang.name }),
				callback: () => {
					// 社区免费版:仅英语可切换,其他语种弹付费引导
					if (lang.id === 'english') {
						this.switchLanguage('english');
					} else {
						new UpgradeModal(this.app, lang.name).open();
					}
				}
			});
		});

			// Theme Cycling Command — 社区免费版:仅经典纸墨可用,轮换到其他主题弹付费引导
			this.addCommand({
				id: 'cycle-theme',
				name: t('commands.cycleTheme'),
				callback: () => {
					const themes = ['paper-ink', 'coral-warmth', 'candy-pop', 'lavender-dream', 'mint-coach', 'rose-blush', 'mindful-oasis', 'ocean-glass', 'aurora-prism', 'neon-lime'];
					const themeNames: Record<string, string> = {
						'paper-ink': 'Paper Ink (经典纸墨)',
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
					const current = this.settings.uiStyle || 'paper-ink';
					const idx = themes.indexOf(current);
					const next = themes[(idx + 1) % themes.length];
					if (next !== 'paper-ink') {
						new UpgradeModal(this.app, themeNames[next] || next).open();
						return;
					}
					this.settings.uiStyle = next as any;
					this.applyUiTheme();
					void this.saveSettings();
					new Notice(t('notifications.themeSwitched', { name: themeNames[next] || next }));
				}
			});

			this.addCommand({
				id: 'toggle-double-click-lookup',
				name: t('commands.toggleDoubleClickLookup'),
				callback: async () => {
					this.settings.doubleClickLookupEnabled = !this.settings.doubleClickLookupEnabled;
					await this.saveSettings();
					new Notice(this.settings.doubleClickLookupEnabled
						? t('notifications.doubleClickLookupOn')
						: t('notifications.doubleClickLookupOff'));
				}
			});

			// 社区免费版:视频标注为完整版功能,弹付费引导
			this.addCommand({
				id: 'open-bookmark-view',
				name: t('commands.openBookmark'),
				callback: () => {
					new UpgradeModal(this.app, t('commands.openBookmark')).open();
				}
			});

			this.addCommand({
				id: 'open-youtube-subscriptions',
				name: t('commands.openYouTubeSubscriptions'),
				callback: () => this.activateView(YOUTUBE_SUBSCRIPTIONS_VIEW_TYPE, 'main'),
			});

			this.addCommand({
				id: 'ai-transcribe-media',
				name: t('commands.transcribeMedia'),
				callback: () => this.transcribeMediaFlow(),
			});

			// Convert an .srt subtitle file into a Markdown subtitle note.
			this.addCommand({
				id: 'srt-to-subtitle-note',
				name: t('commands.srtToNote'),
				callback: () => this.convertSrtToNoteFlow(),
			});

			// Batch-convert several .srt files into subtitle notes at once.
			this.addCommand({
				id: 'srt-to-subtitle-note-batch',
				name: t('commands.srtToNoteBatch'),
				callback: () => this.convertSrtToNoteBatchFlow(),
			});

		// 5. Context Menu
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				const selection = editor.getSelection()?.trim() || '';
				if (selection && selection.length > 0 && selection.length < 2000) {
					menu.addItem((item) => {
						item.setTitle(t('commands.lookupSelection'))
							.setIcon('search')
							.onClick(async () => {
								console.log('[LME] editor-menu lookup trigger: "' + selection + '"');
								const containerEl = (view as any)?.containerEl || (document.activeElement as HTMLElement);
								const leaf = (view as any)?.leaf;
								const context = await this.captureContext(selection, containerEl, leaf);
								this.triggerLookup(selection, context.lineText, context.sourcePath, context.lineIndex);
							});
					});

					return;
				}
			})
		);

		// 6. Platform Specific Selection Logic
		// isTablet covers iPad (Obsidian treats it as desktop but it has no mouse)
		// NOTE: Do NOT use navigator.maxTouchPoints — many desktop devices (touchscreen
		// laptops, Force Touch trackpads, external touch monitors) report maxTouchPoints > 0,
		// which incorrectly routes them to the mobile (magnifier-icon) lookup path.
		try {
			if (Platform.isMobile || (Platform as any).isTablet) {
				this.initMobileSupport();
			} else {
				this.initDesktopSupport();
			}
		} catch (err) {
			console.error('[LME] Platform-specific selection init failed:', err);
		}



		// Global events
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			const target = evt.target as HTMLElement;
			const text = (target.innerText || '').trim();
			if (target.hasClass('cm-timestamp') || (text && text.match(/^\[\d{1,2}:\d{2}\]$/))) {
				this.handleTimestampClick(text);
			}
		});

		// Auto-cleanup mastered flashcards on load
		if (this.settings.autoCleanupMastered) {
			this.app.workspace.onLayoutReady(() => this.runAutoCleanup());
		}


		// Feed polling runs only while Obsidian is loaded; startup refresh catches up.
		this.app.workspace.onLayoutReady(() => {
			this.youtubeRssService.refreshAll().then((result) => {
				void this.refreshYouTubeSubscriptions();
				if (result.added > 0 && this.settings.youtubeRssNotifications) showRefreshNotice(result);
			}).catch(() => { /* per-channel errors are retained by the service */ });
		});
		this.registerInterval(window.setInterval(() => {
			this.youtubeRssService.refreshAll().then((result) => {
				void this.refreshYouTubeSubscriptions();
				if (result.added > 0 && this.settings.youtubeRssNotifications) showRefreshNotice(result);
			}).catch(() => { /* keep periodic checks silent */ });
		}, Math.max(15, this.settings.youtubeRssCheckIntervalMin || 60) * 60 * 1000));
	}

	public async refreshYouTubeSubscriptions(): Promise<void> {
		for (const leaf of this.app.workspace.getLeavesOfType(YOUTUBE_SUBSCRIPTIONS_VIEW_TYPE)) {
			const view = leaf.view as any;
			if (typeof view.refresh === 'function') {
				try { await view.refresh(); } catch (e) { console.warn('[LME] YouTube RSS view refresh failed:', e); }
			}
		}
	}


	/** 社区免费版:首次加载弹欢迎窗(基础版 vs 高级版对照 + 微信引导),仅一次。 */
	private showWelcomeOnFirstLoad(): void {
		if ((this.settings as any).welcomeModalShown) return;
		try {
			(this.settings as any).welcomeModalShown = true;
			void this.saveSettings();
			new WelcomeModal(this.app).open();
		} catch (e) {
			console.warn('[LME] Failed to show welcome modal:', e);
		}
	}

	private async openNavigationOnFirstRun(): Promise<void> {
		if ((this.settings as any).navigationPanelOpened) return;
		try {
			await this.activateView(NAVIGATION_VIEW_TYPE, 'main');
			(this.settings as any).navigationPanelOpened = true;
			await this.saveSettings();
		} catch (e) {
			console.warn('[LME] Failed to open navigation panel on first run:', e);
		}
	}

	public async createVideoNoteFromUrl(url: string, options?: { openNote?: boolean }): Promise<TFile | null> {
		// 社区免费版:视频笔记每周配额——满额时先弹引导,不创建空笔记
		if (!checkSubtitleWeeklyQuota(this.app)) return null;
		const normalizedUrl = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;
		// 不再把跟读工坊切到前台:后台复用已有工坊叶做创建/下载,
		// 没有工坊叶时在右侧边栏静默建一个(不聚焦),最终只弹出笔记自己的标签页。
		let leaf = this.app.workspace.getLeavesOfType(SHADOWING_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = this.app.workspace.getRightLeaf(false);
			if (!leaf) { new Notice(t('nav.videoNoteFailed')); return null; }
			await leaf.setViewState({ type: SHADOWING_VIEW_TYPE, active: false });
		}
		const view = leaf.view as any;
		if (view?.createVideoNoteAndParse) {
			return await view.createVideoNoteAndParse(normalizedUrl, true, options);
		}
		new Notice(t('nav.videoNoteFailed'));
		return null;
	}

	public async openBundledGuide(): Promise<void> {
		await this.activateView(HTML_GUIDE_VIEW_TYPE, 'main');
	}

	public async transcribeMediaToNewNote(): Promise<void> {
		const { TFile } = require('obsidian') as typeof import('obsidian');
		const folder = this.settings.subtitleNoteFolder || this.app.workspace.getActiveFile()?.parent?.path || '';
		const title = this.buildGeneratedNoteTitle(t('nav.audioNoteTitle'));
		const notePath = await this.getAvailableGeneratedPath(folder, title, 'md');
		const note = await this.app.vault.create(notePath, `# ${title}\n\n## Subtitles\n\n`);
		await this.app.workspace.getLeaf('tab').openFile(note);

		new MediaFileSelectModal(this.app, async (media) => {
			if (!(media instanceof TFile)) return;
			const content = await this.app.vault.read(note);
			const embed = `![[${media.path}]]`;
			await this.app.vault.modify(note, content.replace('\n## Subtitles', `\n${embed}\n\n## Subtitles`));
			await this.runTranscription(note, media);
		}).open();
	}

	public async pickDocumentForAIAnalysis(): Promise<void> {
		if (!AIService.resolveProvider(this.settings, 'docAnalysis').apiKey) {
			new Notice(t('errors.aiKeyNotSet'));
			return;
		}
		new FileSelectModal(this.app, async (file) => {
			try {
				const content = await this.app.vault.read(file);
				const blocks = contentToBlocks(content);
				if (blocks.length === 0) {
					new Notice(t('errors.docEmpty'));
					return;
				}
				const allPrompts: PromptTemplate[] = [...BUILTIN_PROMPTS, ...(this.settings.aiPrompts || [])];
				if (allPrompts.length === 1) {
					await executeDocAnalysis(this, blocks, allPrompts[0].content, { name: allPrompts[0].name, isBuiltIn: !!allPrompts[0].isBuiltIn });
				} else {
					new PromptSelectModal(this.app, allPrompts, async (selected) => {
						await executeDocAnalysis(this, blocks, selected.content, { name: selected.name, isBuiltIn: !!selected.isBuiltIn });
					}).open();
				}
			} catch (err) {
				console.error('[LME] pickDocumentForAIAnalysis failed:', err);
				new Notice(t('errors.docReadFailed'));
			}
		}).open();
	}

	public async setUiTheme(theme: string): Promise<void> {
		this.settings.uiStyle = theme as any;
		await this.saveSettings();
		this.applyUiTheme();
		const names: Record<string, string> = {
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
		new Notice(t('notifications.themeSwitched', { name: names[theme] || theme }));
	}

	private buildGeneratedNoteTitle(prefix: string): string {
		const now = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${prefix}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
	}

	private async getAvailableGeneratedPath(folder: string, baseName: string, ext: string): Promise<string> {
		const { normalizePath } = require('obsidian') as typeof import('obsidian');
		let index = 0;
		while (true) {
			const suffix = index === 0 ? '' : `-${index + 1}`;
			const path = normalizePath(folder ? `${folder}/${baseName}${suffix}.${ext}` : `${baseName}${suffix}.${ext}`);
			if (!this.app.vault.getAbstractFileByPath(path)) return path;
			index++;
		}
	}

	/**
	 * Flashcard review reminder: once/day, per-language, time-gated.
	 * Fires on Obsidian open; if opened before a language's reminder time,
	 * schedules a one-shot timer to fire when the app stays open past it.
	 */
	private async maybeShowFlashcardReminder(): Promise<void> {
		const now = new Date();
		const todayKey = this.todayKey(now);
		const langs = ['english', 'german', 'french', 'spanish', 'korean', 'russian', 'japanese', 'chinese'];
		const lastShown = this.settings.flashcardReminderLastShown || {};
		const past: string[] = [];
		const futureMs: number[] = [];

		for (const lang of langs) {
			const enabled = this.settings[`${lang}FlashcardReminderEnabled` as keyof LMESettings] as boolean;
			if (!enabled || lastShown[lang] === todayKey) continue;
			const time = (this.settings[`${lang}FlashcardReminderTime` as keyof LMESettings] as string) || '09:00';
			const target = this.timeToTodayMs(time, now);
			if (now.getTime() >= target) past.push(lang);
			else futureMs.push(target);
		}

		if (past.length > 0) {
			// Mark past-time languages as evaluated for today (immutable copy)
			const updated = { ...lastShown };
			past.forEach(l => { updated[l] = todayKey; });
			const lines: { lang: string; count: number }[] = [];
			for (const lang of past) {
				try {
					const count = await db.getTodayDueCount(lang);
					if (count > 0) lines.push({ lang, count });
				} catch (e) {
					console.warn(`[LME] Reminder due count failed for ${lang}:`, e);
				}
			}
			this.settings.flashcardReminderLastShown = updated;
			await this.saveSettings();
			if (lines.length > 0) {
				new FlashcardReminderModal(this.app, this, lines).open();
			}
		}

		// If opened before some language's reminder time today, schedule a one-shot
		// re-evaluation at the earliest upcoming time (only fires if app stays open).
		if (this.reminderTimer !== null) {
			clearTimeout(this.reminderTimer);
			this.reminderTimer = null;
		}
		if (futureMs.length > 0) {
			const delay = Math.min(...futureMs) - now.getTime();
			if (delay > 0 && delay < 24 * 3600 * 1000) {
				this.reminderTimer = window.setTimeout(() => {
					this.reminderTimer = null;
					this.maybeShowFlashcardReminder();
				}, delay) as unknown as number;
			}
		}
	}

	private todayKey(d: Date): string {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	private timeToTodayMs(hhmm: string, base: Date): number {
		const parts = hhmm.split(':').map(n => parseInt(n, 10) || 0);
		const h = parts[0] || 0;
		const m = parts[1] || 0;
		return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0).getTime();
	}

	/**
	 * Auto-cleanup mastered flashcards past the delay threshold
	 */
	private async runAutoCleanup() {
		const languages: string[] = ['english', 'german', 'french', 'spanish', 'korean', 'russian', 'japanese', 'chinese'];
		let totalDeleted = 0;
		const beforeTime = Date.now() - this.settings.cleanupDelayDays * 86400000;

		for (const lang of languages) {
			await db.syncMasteredStatus(lang);
			const toDelete = await db.getMasteredBefore(lang, beforeTime);
			if (toDelete.length > 0) {
				await db.batchDeleteVocabulary(toDelete.map(e => e.id));
				totalDeleted += toDelete.length;
			}
		}

		if (totalDeleted > 0) {
			console.log(`[LME] Auto-cleaned ${totalDeleted} mastered flashcards`);
		}
	}

	/** Whisper transcription size limit (OpenAI: 25 MB). */
	private static readonly TRANSCRIBE_MAX_BYTES = 25 * 1024 * 1024;
	private static readonly MEDIA_EMBED_REGEX = /!\[\[([^\]]+\.(?:mp3|wav|m4a|ogg|flac|aac|webm|mp4|mov|mkv|m4v))\]\]/i;

	/**
	 * Transcribe an audio/video file into timestamped subtitles via Whisper,
	 * write `[MM:SS] text` into the active note's `## Subtitles` section,
	 * and export a `.srt` next to the note.
	 */
	private async transcribeMediaFlow(): Promise<void> {
		const { TFile } = require('obsidian') as typeof import('obsidian');
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== 'md') {
			new Notice(t('transcribe.noActiveNote'));
			return;
		}

		// 1. Resolve the media file: try an embedded media link in the note first,
		//    otherwise let the user pick an audio/video file.
		const pickMedia = async (): Promise<{ TFile } | null> => {
			const content = await this.app.vault.read(file);
			const m = content.match(LanguageMadeEasyPlugin.MEDIA_EMBED_REGEX);
			if (m) {
				const dest = this.app.metadataCache.getFirstLinkpathDest(m[1], file.path);
				if (dest instanceof TFile) return { TFile: dest } as any;
			}
			return null;
		};
		const embedded = await pickMedia();
		const resolveAndRun = async (media: any) => {
			await this.runTranscription(file, media);
		};
		if (embedded) {
			await resolveAndRun((embedded as any).TFile);
		} else {
			new Notice(t('transcribe.noMediaFound'));
			new MediaFileSelectModal(this.app, async (media) => {
				await resolveAndRun(media);
			}).open();
		}
	}

	private async runTranscription(noteFile: any, mediaFile: any): Promise<void> {
		const { TFile } = require('obsidian') as typeof import('obsidian');
		try {
			if (!(mediaFile instanceof TFile)) {
				new Notice(t('transcribe.noMediaFound'));
				return;
			}
			// Size guard
			const size = mediaFile.stat?.size ?? 0;
			if (size > LanguageMadeEasyPlugin.TRANSCRIBE_MAX_BYTES) {
				new Notice(t('transcribe.fileTooLarge', { size: Math.round(size / 1024 / 1024) }));
				return;
			}
			if (!(this.settings.transcriptionApiKey || '').trim()) {
				new Notice(t('transcribe.noApiKey'));
				return;
			}

			const notice = new Notice(t('transcribe.progress'), 0);
			const buf = await this.app.vault.readBinary(mediaFile);
			const segs = await AIService.transcribeAudio(buf, mediaFile.name, this.settings);
			notice.hide();

			if (segs.length === 0) {
				new Notice(t('transcribe.failed'));
				return;
			}

			// Write [MM:SS] lines into the note's ## Subtitles section
			const formatted = AIService.segmentsToTimestampLines(segs);
			await this.insertSubtitlesIntoActiveNote(noteFile, formatted);

			// Export .srt next to the note (same basename)
			const srtPath = this.srtPathFor(noteFile);
			const srtContent = AIService.segmentsToSrt(segs);
			const existing = this.app.vault.getAbstractFileByPath(srtPath);
			if (existing instanceof TFile) {
				await this.app.vault.modify(existing, srtContent);
			} else {
				await this.app.vault.create(srtPath, srtContent);
			}

			new Notice(t('transcribe.done', { count: segs.length }) + ' ' + t('transcribe.srtSaved', { path: srtPath }));

			// Refresh shadowing view if open so blocks reload
			const leaf = this.app.workspace.getLeavesOfType(SHADOWING_VIEW_TYPE)[0];
			if (leaf) (leaf.view as any).parseActiveNoteTimestamps?.();
		} catch (e: any) {
			console.error('[LME] Transcription failed:', e);
			new Notice((e?.message || t('transcribe.failed')));
		}
	}

	/** Insert timestamped lines into the note's `## Subtitles` section (replace or append). */
	private async insertSubtitlesIntoActiveNote(noteFile: any, formatted: string): Promise<void> {
		const content = await this.app.vault.read(noteFile);
		const lines = content.split('\n');
		const header = '## Subtitles';
		const idx = lines.findIndex(l => l.trim() === header);
		if (idx !== -1) {
			let end = idx + 1;
			while (end < lines.length) {
				const l = lines[end].trim();
				if (l.startsWith('## ') || l.startsWith('# ')) break;
				end++;
			}
			const newLines = [...lines.slice(0, idx), header, '', ...formatted.split('\n'), ...lines.slice(end)];
			await this.app.vault.modify(noteFile, newLines.join('\n'));
		} else {
			const block = `\n${header}\n\n${formatted}\n`;
			await this.app.vault.modify(noteFile, content + (content.endsWith('\n') ? '' : '\n') + block);
		}
	}

	/** `.srt` path alongside the note, same basename. */
	private srtPathFor(noteFile: any): string {
		const path: string = noteFile.path;
		const slash = path.lastIndexOf('/');
		const dir = slash >= 0 ? path.slice(0, slash) : '';
		const base = slash >= 0 ? path.slice(slash + 1) : path;
		const stem = base.replace(/\.md$/i, '');
		return dir ? `${dir}/${stem}.srt` : `${stem}.srt`;
	}

	/** Parent directory of a vault path, or '' if none. */
	private parentVaultDir(path: string): string {
		const slash = path.lastIndexOf('/');
		return slash >= 0 ? path.slice(0, slash) : '';
	}

	/**
	 * Convert a user-picked .srt file into a Markdown subtitle note, preserving
	 * every cue's start timestamp as `[MM:SS] text`. Writes to the configured
	 * default folder; if none is set, prompts for the destination path.
	 */
	private convertSrtToNoteFlow(): void {
		const { TFile } = require('obsidian') as typeof import('obsidian');

		// Bail early with a clear message if there are no SRT files to pick from.
		const hasSrt = this.app.vault.getFiles().some(f => f.extension?.toLowerCase() === 'srt');
		if (!hasSrt) {
			new Notice(t('srtToNote.noSrtFiles'));
			return;
		}

		new SrtFileSelectModal(this.app, async (srtFile) => {
			try {
				const content = await this.app.vault.read(srtFile);
				const segs = parseSrt(content);
				if (segs.length === 0) {
					new Notice(t('srtToNote.noSegments'));
					return;
				}

				const stem = srtFile.basename || 'subtitles';
				const destPath = await this.resolveSubtitleNotePath(srtFile.path, stem);
				if (!destPath) {
					new Notice(t('srtToNote.emptyPath'));
					return;
				}

				const lines = segmentsToTimestampLines(segs);
				const fullBody = buildSubtitleNoteBody(
					t('srtToNote.title', { name: stem }),
					t('srtToNote.hint', { count: segs.length }),
					segs
				);
				await this.writeSubtitleNote(destPath, lines, fullBody);

				new Notice(t('srtToNote.done', { count: segs.length, path: destPath }));
				if (this.settings.autoOpenSubtitleNote !== false) {
					await this.openNoteInTab(destPath);
				}
			} catch (e: any) {
				console.error('[LME] SRT → subtitle note failed:', e);
				new Notice(e?.message ? `${t('srtToNote.writeFailed')} (${e.message})` : t('srtToNote.writeFailed'));
			}
		}).open();
	}

	/**
	 * Resolve the destination note path. Uses the configured default folder when
	 * set; otherwise prompts the user (prefilled with the SRT's sibling .md path).
	 * Resolves to '' if the user submits an empty path.
	 */
	private resolveSubtitleNotePath(srtPath: string, stem: string): Promise<string> {
		const { normalizePath } = require('obsidian') as typeof import('obsidian');

		const folder = (this.settings.subtitleNoteFolder || '').trim();
		if (folder) {
			return Promise.resolve(normalizePath(`${folder}/${stem}.md`));
		}

		const srtDir = this.parentVaultDir(srtPath);
		const initial = normalizePath(srtDir ? `${srtDir}/${stem}.md` : `${stem}.md`);
		return new Promise<string>((resolve) => {
			new TextInputModal(this.app, {
				title: t('srtToNote.promptTitle'),
				body: t('srtToNote.promptBody'),
				placeholder: t('srtToNote.promptPlaceholder'),
				value: initial,
				confirmText: t('srtToNote.confirm'),
			}, (value) => {
				resolve(value ? normalizePath(value) : '');
			}).open();
		});
	}

	/**
	 * Write the subtitle note. For an existing note, only the `## Subtitles`
	 * section is refreshed (other content preserved); for a new note the full
	 * body (title + hint + section) is created, creating the parent folder if
	 * needed.
	 */
	private async writeSubtitleNote(notePath: string, lines: string, fullBody: string): Promise<void> {
		const { TFile } = require('obsidian') as typeof import('obsidian');
		const existing = this.app.vault.getAbstractFileByPath(notePath);
		if (existing instanceof TFile) {
			await this.insertSubtitlesIntoActiveNote(existing, lines);
			return;
		}
		try {
			await this.app.vault.create(notePath, fullBody);
		} catch (e) {
			// Parent folder may be missing — create it and retry once.
			const dir = this.parentVaultDir(notePath);
			if (!dir) throw e;
			try { await this.app.vault.createFolder(dir); } catch { /* already exists */ }
			await this.app.vault.create(notePath, fullBody);
		}
	}

	/** Open a vault note by path in a new tab. No-op if the file isn't found. */
	private async openNoteInTab(notePath: string): Promise<void> {
		const { TFile } = require('obsidian') as typeof import('obsidian');
		const file = this.app.vault.getAbstractFileByPath(notePath);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf('tab').openFile(file);
		}
	}

	/**
	 * Batch-convert several user-picked .srt files into subtitle notes under one
	 * output folder (the configured default, or a folder the user confirms once
	 * when no default is set). Files with no cues are skipped (counted), not
	 * written. The generated note is auto-opened only when exactly one note is
	 * produced, to avoid opening many tabs.
	 */
	private convertSrtToNoteBatchFlow(): void {
		const srtFiles = this.app.vault.getFiles().filter(f => f.extension?.toLowerCase() === 'srt');
		if (srtFiles.length === 0) {
			new Notice(t('srtToNote.noSrtFiles'));
			return;
		}

		new SrtBatchSelectModal(this.app, srtFiles, async (selected) => {
			if (selected.length === 0) {
				new Notice(t('srtToNote.noSelection'));
				return;
			}

			const folder = await this.resolveSubtitleNoteFolder();
			if (!folder) {
				new Notice(t('srtToNote.emptyPath'));
				return;
			}

			const notice = new Notice(t('srtToNote.batchConfirm') + '…', 0);
			let ok = 0;
			let skipped = 0;
			let failed = 0;
			let lastPath = '';

			for (const srtFile of selected) {
				try {
					const content = await this.app.vault.read(srtFile);
					const segs = parseSrt(content);
					if (segs.length === 0) {
						skipped++;
						continue;
					}
					const stem = srtFile.basename || 'subtitles';
					const notePath = this.normalizeSubtitlePath(`${folder}/${stem}.md`);
					const lines = segmentsToTimestampLines(segs);
					const fullBody = buildSubtitleNoteBody(
						t('srtToNote.title', { name: stem }),
						t('srtToNote.hint', { count: segs.length }),
						segs
					);
					await this.writeSubtitleNote(notePath, lines, fullBody);
					lastPath = notePath;
					ok++;
				} catch (e: any) {
					console.error('[LME] batch SRT → subtitle note failed:', srtFile.path, e);
					failed++;
				}
			}

			notice.hide();
			if (ok === 0) {
				new Notice(t('srtToNote.batchNone'));
				return;
			}
			new Notice(t('srtToNote.batchDone', { ok, skipped, failed, folder }));

			// Auto-open only when a single note is produced (avoids tab flood).
			if (this.settings.autoOpenSubtitleNote !== false && ok === 1) {
				await this.openNoteInTab(lastPath);
			}
		}).open();
	}

	/**
	 * Resolve the output folder for batch conversion: the configured default
	 * folder when set, otherwise prompt the user once. Resolves to '' if the
	 * user submits an empty folder.
	 */
	private resolveSubtitleNoteFolder(): Promise<string> {
		const { normalizePath } = require('obsidian') as typeof import('obsidian');

		const folder = (this.settings.subtitleNoteFolder || '').trim();
		if (folder) {
			return Promise.resolve(normalizePath(folder));
		}

		return new Promise<string>((resolve) => {
			new TextInputModal(this.app, {
				title: t('srtToNote.promptFolderTitle'),
				body: t('srtToNote.promptFolderBody'),
				placeholder: t('srtToNote.promptFolderPlaceholder'),
				value: '',
				confirmText: t('srtToNote.confirm'),
			}, (value) => {
				resolve(value ? normalizePath(value) : '');
			}).open();
		});
	}

	/** Thin wrapper to normalize a vault path (keeps `require('obsidian')` local). */
	private normalizeSubtitlePath(path: string): string {
		const { normalizePath } = require('obsidian') as typeof import('obsidian');
		return normalizePath(path);
	}

	/**
	 * Switch active language
	 */
	async switchLanguage(language: 'english' | 'german' | 'french' | 'spanish' | 'korean' | 'russian' | 'japanese' | 'chinese') {
		const oldLang = this.getCurrentLanguageName();
		this.settings.activeLanguage = language;
		await this.saveSettings();

		// Update status bar
		this.updateLanguageStatusBar();

		const newLang = this.getCurrentLanguageName();
		new Notice(t('notifications.langSwitched', { old: oldLang, new: newLang }));
		console.log('[LME] Language switched to ' + language);

		// Refresh open views
		this.app.workspace.iterateAllLeaves((leaf) => {
			const viewType = leaf.view.getViewType();
			if (viewType === DICT_VIEW_TYPE) {
				(leaf.view as any).render?.();
			} else if (viewType === FLASHCARD_VIEW_TYPE) {
				(leaf.view as any).render?.();
			}
		});
	}

	/**
	 * Get current language display name
	 */
	private getCurrentLanguageName(): string {
		const names: Record<string, string> = {
			english: 'English',
			german: 'Deutsch',
			french: 'Français',
			spanish: 'Español',
				korean: '한국어',
				russian: 'Русский',
				japanese: '日本語',
				chinese: '中文'
		};
		return names[this.settings.activeLanguage] || 'English';
	}

	/**
	 * Get language display info (name and icon)
	 */
	private getLanguageDisplay(): { name: string; icon: string; emoji: string } {
		const displays: Record<string, { name: string; icon: string; emoji: string }> = {
			english: { name: 'English', icon: 'languages', emoji: '🇬🇧' },
			german: { name: 'Deutsch', icon: 'languages', emoji: '🇩🇪' },
			french: { name: 'Français', icon: 'languages', emoji: '🇫🇷' },
			spanish: { name: 'Español', icon: 'languages', emoji: '🇪🇸' },
				korean: { name: '한국어', icon: 'languages', emoji: '🇰🇷' },
				russian: { name: 'Русский', icon: 'languages', emoji: '🇷🇺' },
				japanese: { name: '日本語', icon: 'languages', emoji: '🇯🇵' },
				chinese: { name: '中文', icon: 'languages', emoji: '🇨🇳' }
		};
		return displays[this.settings.activeLanguage] || displays.english;
	}

	/**
	 * Update language status bar
	 */
	private updateLanguageStatusBar() {
		if (!this.languageStatusBar) return;

		const display = this.getLanguageDisplay();
		this.languageStatusBar.setText(display.emoji + ' ' + display.name);
		this.languageStatusBar.onClickEvent = () => {
			// Quick switch menu when clicking status bar
			this.showLanguageSwitchMenu();
		};
	}

	/**
	 * Show quick language switch menu
	 */
	private showLanguageSwitchMenu() {
		const languages = [
			{ id: 'english', name: 'English', emoji: '🇬🇧' },
			{ id: 'german', name: 'Deutsch', emoji: '🇩🇪' },
			{ id: 'french', name: 'Français', emoji: '🇫🇷' },
			{ id: 'spanish', name: 'Español', emoji: '🇪🇸' },
				{ id: 'korean', name: '한국어', emoji: '🇰🇷' },
				{ id: 'russian', name: 'Русский', emoji: '🇷🇺' },
				{ id: 'japanese', name: '日本語', emoji: '🇯🇵' },
				{ id: 'chinese', name: '中文', emoji: '🇨🇳' }
		];

		const menu = new Menu(this.app);

		languages.forEach(lang => {
			const isActive = this.settings.activeLanguage === lang.id;
			menu.addItem((item) => {
				item.setTitle(lang.emoji + ' ' + lang.name + (isActive ? ' ' + t('langMenu.current') : ''));
				item.setChecked(isActive);
				item.onClick(() => {
					// 社区免费版:仅英语可切换,其他语种弹付费引导
					if (isActive) return;
					if (lang.id === 'english') {
						this.switchLanguage('english');
					} else {
						new UpgradeModal(this.app, lang.name).open();
					}
				});
			});
		});

		menu.showAtPosition({
			x: window.innerWidth - 200,
			y: window.innerHeight - 200
		});
	}

	async onunload() {
		// Clear pending flashcard reminder timer
		if (this.reminderTimer !== null) {
			clearTimeout(this.reminderTimer);
			this.reminderTimer = null;
		}

		// Remove status bar item
		if (this.languageStatusBar) {
			this.languageStatusBar.remove();
			this.languageStatusBar = null;
		}
	}

	private initDesktopSupport() {
		// Debounce flag to prevent rapid-fire triggers
		let isProcessing = false;
		const registeredDocs = new WeakSet<Document>();

		const handleDoubleClick = async (evt: MouseEvent) => {
			// Honor the global double-click lookup toggle (desktop only; mobile is unaffected)
			if (!this.settings.doubleClickLookupEnabled) return;
			// Direct double-click lookup (no modifier key needed)
			const target = evt.target as HTMLElement;
			const doc = target.ownerDocument || document;
			let selection = '';
			try {
				selection = doc.getSelection()?.toString().trim() || '';
			} catch (err) {
				return;
			}

			if (!selection || selection.length === 0 || selection.length > 2000) {
				return;
			}

			// Only trigger if selection is outside dictionary view
			if (target.closest('.lme-dict-view')) return;

			console.log('[LME] Desktop: Double-click detected: "' + selection + '"');

			// Debounce check
			if (isProcessing) {
				console.log('[LME] Already processing, skipping duplicate trigger');
				return;
			}

			isProcessing = true;
			try {
				// Find the leaf containing this target
				let leaf: WorkspaceLeaf | null = null;
				this.app.workspace.iterateAllLeaves(l => {
					if (l.view.containerEl.contains(target)) leaf = l;
				});

				// Capture state before async operations
				const capturedState = { selection };

				// Trigger lookup directly
				const context = await this.captureContext(capturedState.selection, target, leaf);
				this.triggerLookup(capturedState.selection, context.lineText, context.sourcePath, context.lineIndex);
			} catch (error) {
				console.error('[LME] Double-click lookup failed:', error);
				new Notice(t('dict.lookupFailed', { error: error.message }));
			} finally {
				setTimeout(() => {
					isProcessing = false;
				}, 300);
			}
		};

		const handleMouseUp = async (evt: MouseEvent) => {
			// Check if Ctrl key is pressed (for manual selection)
			if (!(evt.ctrlKey || evt.metaKey) || !evt.shiftKey) return;

			// Debounce: prevent rapid-fire triggers
			if (isProcessing) {
				console.log('[LME] Already processing, skipping duplicate trigger');
				return;
			}

			const target = evt.target as HTMLElement;
			const doc = target.ownerDocument || document;
			let selection = '';
			try {
				selection = doc.getSelection()?.toString().trim() || '';
			} catch (err) {
				return;
			}

			if (!selection || selection.length === 0 || selection.length > 2000) {
				return;
			}

			// Only trigger if selection is outside dictionary view
			if (target.closest('.lme-dict-view')) return;

			console.log('[LME] Desktop: Ctrl/Cmd+Shift + mouseup detected: "' + selection + '"');

			// CRITICAL: Capture all necessary state BEFORE any async operations
			// This prevents issues when user releases Ctrl key during async processing
			const capturedState = {
				selection,
				target,
			};

			// Trigger dictionary lookup
			isProcessing = true;
			try {
				// Find the leaf containing this target
				let leaf: WorkspaceLeaf | null = null;
				this.app.workspace.iterateAllLeaves(l => {
					if (l.view.containerEl.contains(target)) leaf = l;
				});

				// Use captured state instead of accessing potentially stale objects
				const context = await this.captureContext(capturedState.selection, target, leaf);
				this.triggerLookup(capturedState.selection, context.lineText, context.sourcePath, context.lineIndex);
			} catch (error) {
				console.error('[LME] Dictionary lookup failed:', error);
				new Notice(t('dict.lookupFailed', { error: error.message }));
			} finally {
				// Reset flag after a short delay to prevent rapid-fire triggers
				setTimeout(() => {
					isProcessing = false;
				}, 300);
			}
		};

		const setupDocument = (doc: Document) => {
			if (registeredDocs.has(doc)) return;
			registeredDocs.add(doc);
			this.registerDomEvent(doc as any, 'dblclick', (evt: MouseEvent) => handleDoubleClick(evt));
			this.registerDomEvent(doc as any, 'mouseup', (evt: MouseEvent) => handleMouseUp(evt));
		};

		const setupSameOriginFrames = (doc: Document) => {
			const frames = Array.from(doc.querySelectorAll('iframe, webview')) as HTMLElement[];
			for (const frame of frames) {
				try {
					const frameDoc = (frame as HTMLIFrameElement).contentDocument || (frame as HTMLIFrameElement).contentWindow?.document;
					if (frameDoc) setupDocument(frameDoc);
				} catch (err) {
					// Cross-origin HTML/webviews cannot expose their selection to plugins.
				}
			}
		};

		const setupWindow = (win: Window) => {
			setupDocument(win.document);
			setupSameOriginFrames(win.document);
		};

		setupWindow(window);
		this.registerEvent(this.app.workspace.on('window-open', (win) => setupWindow(win as any)));
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			setupWindow(window);
			for (const leaf of this.app.workspace.getLeavesOfType('html')) {
				setupSameOriginFrames(leaf.view.containerEl.ownerDocument || document);
			}
		}));
			if (!Platform.isMobile && !(Platform as any).isTablet) {
				this.registerInterval(window.setInterval(() => setupSameOriginFrames(document), 2000));
			}
		}

	private initMobileSupport() {
		const hideMenu = () => {
			if (!this.lookupMenuEl) return;
			this.lookupMenuEl.style.display = 'none';
		};

		const applyFixedMenuLayout = (doc: Document) => {
			if (!this.lookupMenuEl || this.lookupMenuEl.ownerDocument !== doc) return;
			this.lookupMenuEl.style.position = 'fixed';
			this.lookupMenuEl.style.zIndex = '2147483647';
			this.lookupMenuEl.style.left = '0';
			this.lookupMenuEl.style.right = '0';
			this.lookupMenuEl.style.top = '20vh';
			this.lookupMenuEl.style.bottom = 'auto';
			this.lookupMenuEl.style.transform = 'none';
			this.lookupMenuEl.style.justifyContent = 'center';
			this.lookupMenuEl.style.pointerEvents = 'auto';
		};

		const applyAnchoredMenuLayout = (doc: Document, x: number, y: number, placement: 'above' | 'below') => {
			if (!this.lookupMenuEl || this.lookupMenuEl.ownerDocument !== doc) return;
			this.lookupMenuEl.style.position = 'fixed';
			this.lookupMenuEl.style.zIndex = '2147483647';
			this.lookupMenuEl.style.left = `${x}px`;
			this.lookupMenuEl.style.right = 'auto';
			this.lookupMenuEl.style.top = `${y}px`;
			this.lookupMenuEl.style.bottom = 'auto';
			this.lookupMenuEl.style.transform = placement === 'above' ? 'translate(-50%, -100%)' : 'translate(-50%, 12px)';
			this.lookupMenuEl.style.justifyContent = 'center';
			this.lookupMenuEl.style.pointerEvents = 'auto';
		};

		const ensureMenu = (doc: Document) => {
			if (this.lookupMenuEl && this.lookupMenuEl.ownerDocument !== doc) {
				this.lookupMenuEl.remove();
				this.lookupMenuEl = null;
			}

			if (!this.lookupMenuEl) {
				this.lookupMenuEl = doc.body.createDiv('lme-lookup-menu');
				const btn = this.lookupMenuEl.createEl('button', {
					cls: 'lme-mobile-lookup-btn',
					attr: { type: 'button', 'aria-label': t('commands.lookupSelection') },
				});
				setIcon(btn, 'search');

				const handle = async (e: Event) => {
					e.preventDefault();
					e.stopPropagation();
					const lookupText = this.lookupMenuEl?.dataset.text?.trim() || '';
					hideMenu();
					if (!lookupText) return;
					try {
						const context = await this.captureContext(lookupText, document.activeElement as HTMLElement);
						this.triggerLookup(lookupText, context.lineText, context.sourcePath, context.lineIndex);
					} catch (err) {
						console.error('[LME] Mobile lookup failed:', err);
					}
				};

				btn.addEventListener('pointerdown', handle);
				btn.addEventListener('touchstart', handle);
				btn.addEventListener('mousedown', handle);
			}

			applyFixedMenuLayout(doc);
			return this.lookupMenuEl;
		};

		const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

		const updateMenuPosition = (doc: Document) => {
			if (!this.lookupMenuEl || this.lookupMenuEl.ownerDocument !== doc) return;
			if (this.lookupMenuEl.style.display === 'none') return;
			const win = doc.defaultView;
			if (!win) return;

			applyFixedMenuLayout(doc);
		};

		const showMenuForSelection = (doc: Document) => {
			try {
				const sel = (doc.getSelection && doc.getSelection()) || doc.defaultView?.getSelection?.();
				const selection = sel?.toString().trim() || '';
				if (!selection || selection.length >= 2000) {
					hideMenu();
					return;
				}

				const active = doc.activeElement as HTMLElement | null;
				if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT' || active.closest('textarea, input'))) {
					hideMenu();
					return;
				}

				if (sel && sel.rangeCount > 0) {
					const range = sel.getRangeAt(0);
					let container = range.commonAncestorContainer as any;
					if (container && container.nodeType === Node.TEXT_NODE) container = container.parentElement;
					const containerEl = container as HTMLElement | null;
					if (containerEl) {
						const input = containerEl.closest('textarea, input');
						if (input) {
							hideMenu();
							return;
						}
					}
				}

				const menu = ensureMenu(doc);
				menu.dataset.text = selection;
				menu.style.display = 'flex';

				const win = doc.defaultView || window;
				const padding = 12;
				const vv = (win as any).visualViewport as VisualViewport | undefined;
				const hasVV = !!(vv && Number.isFinite(vv.width) && vv.width > 0 && Number.isFinite(vv.height) && vv.height > 0);
				const viewportWidth = hasVV ? vv!.width : win.innerWidth;
				const viewportTop = hasVV && Number.isFinite(vv!.offsetTop) ? vv!.offsetTop : 0;
				const viewportHeight = hasVV ? vv!.height : win.innerHeight;
				const safeBottom = viewportTop + viewportHeight - padding;

				let anchored = false;
				if (sel && sel.rangeCount > 0) {
					const rect = sel.getRangeAt(0).getBoundingClientRect();
					const hasRect = Number.isFinite(rect.left) && Number.isFinite(rect.top) && (rect.width > 0 || rect.height > 0);
					if (hasRect) {
						const menuRect = menu.getBoundingClientRect();
						const menuWidth = Math.max(1, menuRect.width);
						const menuHeight = Math.max(1, menuRect.height);

						const minX = padding + menuWidth / 2;
						const maxX = viewportWidth - padding - menuWidth / 2;
						const x = clamp(rect.left + rect.width / 2, minX, maxX);

						let placement: 'above' | 'below' = 'above';
						if (rect.top < menuHeight + padding) placement = 'below';
						let y = placement === 'above' ? rect.top - 8 : rect.bottom + 8;

						if (placement === 'below' && y + menuHeight > safeBottom) {
							placement = 'above';
							y = rect.top - 8;
						}
						if (placement === 'above' && y < viewportTop + padding) {
							placement = 'below';
							y = rect.bottom + 8;
						}

						applyAnchoredMenuLayout(doc, x, y, placement);
						anchored = true;
					}
				}

				if (!anchored) {
					applyFixedMenuLayout(doc);
				}

				requestAnimationFrame(() => {
					if (anchored) return;
					updateMenuPosition(doc);
				});
			} catch (err) { }
		};

		const setupDoc = (doc: Document) => {
			let selectionChangeTimer: number | null = null;
			this.registerDomEvent(doc as any, 'selectionchange', () => {
				const win = doc.defaultView || window;
				if (selectionChangeTimer !== null) win.clearTimeout(selectionChangeTimer);
				selectionChangeTimer = win.setTimeout(() => showMenuForSelection(doc), 450);
			});

			this.registerDomEvent(doc as any, 'pointerup', () => {
				const win = doc.defaultView || window;
				win.setTimeout(() => showMenuForSelection(doc), 450);
				win.setTimeout(() => showMenuForSelection(doc), 900);
			}, { capture: true });
			this.registerDomEvent(doc as any, 'touchend', () => {
				const win = doc.defaultView || window;
				win.setTimeout(() => showMenuForSelection(doc), 450);
				win.setTimeout(() => showMenuForSelection(doc), 900);
			}, { capture: true });

			const win = doc.defaultView;
			if (win) {
				this.registerDomEvent(win as any, 'resize', () => updateMenuPosition(doc));
				this.registerDomEvent(win as any, 'scroll', () => updateMenuPosition(doc), { capture: true });
				const vv = win.visualViewport;
				if (vv) {
					this.registerDomEvent(vv as any, 'resize', () => updateMenuPosition(doc));
					this.registerDomEvent(vv as any, 'scroll', () => updateMenuPosition(doc));
				}
			}
		};

		setupDoc(document);
		this.registerEvent(this.app.workspace.on('window-open', (win) => setupDoc((win as any).document)));

		this.register(() => {
			this.lookupMenuEl?.remove();
			this.lookupMenuEl = null;
		});
	}

	private async captureContext(selection: string, target?: HTMLElement, leaf?: WorkspaceLeaf): Promise<{ lineText: string, sourcePath: string, lineIndex: number }> {
		let lineText = '';
		let sourcePath = '';
		let lineIndex = 0;
		try {
			console.log('[LME] captureContext triggered for: "' + selection + '"');

			// 1. Identify valid leaf and view
			let activeLeaf = leaf;
			if (!activeLeaf && target) {
				this.app.workspace.iterateAllLeaves(l => {
					if (l.view.containerEl.contains(target)) activeLeaf = l;
				});
			}
			if (!activeLeaf) activeLeaf = this.app.workspace.activeLeaf;

			const view = activeLeaf?.view!;
			const isMarkdown = view?.getViewType() === 'markdown';
			const mode = (view as any)?.getMode?.();
			console.log('[LME] captureContext view: ' + (view?.getViewType() || '') + ' | mode: ' + mode);

			// 2. Resolve target file path
			const activeFile = this.app.workspace.getActiveFile();
			const file = (view as any)?.file || activeFile;
			sourcePath = file ? file.path : '';

			// 3. Mode-specific extraction
			if (isMarkdown && mode === 'source') {
				// SOURCE MODE (Source / Live Preview)
				const editor = (view as any).editor;
				const cursor = editor.getCursor?.('from') || { line: 0, ch: 0 };
				const currentLine = cursor.line;

				const startLine = Math.max(0, currentLine - 1);
				const endLine = Math.min(editor.lineCount() - 1, currentLine + 1);

				const lines: string[] = [];
				for (let i = startLine; i <= endLine; i++) {
					lines.push(editor.getLine(i));
				}

				lineText = lines.join('\n');
				lineIndex = currentLine;
				console.log('[LME] captureContext (Source) captured ' + lines.length + ' lines');
			} else {
				// READING MODE / DOM Fallback
				// Skip Range API entirely on mobile to avoid RangeError
				if (!Platform.isMobile) {
					const doc = target?.ownerDocument || document;
					const sel = doc.getSelection();
					if (sel && sel.rangeCount > 0) {
						try {
							const range = sel.getRangeAt(0);
							let container = range.commonAncestorContainer as HTMLElement;
							if (container && container.nodeType === Node.TEXT_NODE) {
								container = container.parentElement!;
							}
							if (!container) {
								return { lineText: '', sourcePath, lineIndex: 0 };
							}

							let current: HTMLElement | null = container;
							for (let i = 0; i < 15 && current; i++) {
								const text = (current.textContent || '').trim();
								if (text.toLowerCase().indexOf(selection.toLowerCase()) !== -1) {
									lineText = text;
									if (current.matches('p, li, h1, h2, h3, h4, h5, h6, .textLayer, .lme-shadowing-item, .markdown-rendered')) {
										console.log('[LME] captureContext (DOM) matched block: ' + current.tagName);
										break;
									}
								}
								current = current.parentElement;
							}
						} catch (rangeError) {
							console.error('[LME] Range error in captureContext:', rangeError);
							return { lineText: '', sourcePath, lineIndex: 0 };
						}
					}
				}
			}

			// 4. ULTIMATE GLOBAL FALLBACK: Async scan file content if still empty
			if (!lineText && sourcePath) {
				console.log('[LME] Local capture failed. Initiating global scan for "' + sourcePath + '"...');
				try {
					const content = await this.app.vault.adapter.read(sourcePath);
					const lines = content.split('\n');
					const selectionLower = selection.toLowerCase();

					for (let i = 0; i < lines.length; i++) {
						if (lines[i].toLowerCase().indexOf(selectionLower) !== -1) {
							const start = Math.max(0, i - 1);
							const end = Math.min(lines.length - 1, i + 1);
							lineText = lines.slice(start, end + 1).join('\n');
							lineIndex = i;
							console.log('[LME] captureContext (Global Fallback) found match at line ' + i);
							break;
						}
					}
				} catch (fileErr) {
					console.error('[LME] Global scan error', fileErr);
				}
			}
		} catch (e) {
			console.error('[LME] Capture error', e);
		}

		lineText = (lineText || '').trim();
		if (lineText.length > 8000) lineText = lineText.slice(0, 8000);
		return { lineText, sourcePath, lineIndex };
	}

	public async triggerLookup(word: string, lineText?: string, sourcePath?: string, lineIndex?: number) {
		if (!word) return;
		await this.activateView(DICT_VIEW_TYPE, 'right');
		const leaf = this.app.workspace.getLeavesOfType(DICT_VIEW_TYPE)[0];
		if (leaf && leaf.view instanceof DictView) {
			leaf.view.lookup(word, lineText, sourcePath, lineIndex);
		}
	}

	// ── Shadowing Workshop 目录页 ── 自带 sample(seeding 用,仅缺时写入,绝不覆盖)
	private static readonly BUNDLED_WORKSHOP_SAMPLES: { name: string; content: string }[] = [
		{ name: 'Sample - Everyday English.md', content: sampleEveryday },
		{ name: 'Sample - Mini Talk.md', content: sampleMiniTalk },
	];

	/** 目录页点卡片:打开笔记 + 启动跟读工坊(autoDetectVideo 自动读取该笔记)。 */
	public async openWorkshopWithFile(file: TFile): Promise<void> {
		await this.app.workspace.getLeaf('tab').openFile(file);
		await this.activateView(SHADOWING_VIEW_TYPE, 'main');
		this.recordWorkshopPractice(file);
	}

	/** 标记目录页笔记为已练习(次数+1 / 记录时间),持久化到 settings.workshopProgress。 */
	private recordWorkshopPractice(file: TFile): void {
		const progress = this.settings.workshopProgress || (this.settings.workshopProgress = {});
		const entry = progress[file.path] || { practiced: false, practiceCount: 0, lastPracticedAt: 0 };
		entry.practiced = true;
		entry.practiceCount = (entry.practiceCount || 0) + 1;
		entry.lastPracticedAt = Date.now();
		progress[file.path] = entry;
		void this.saveSettings();
		void this.refreshWorkshopCatalog();
	}

	/**
	 * 首次播种:创建默认文件夹并写入自带 sample。只执行一次(workshopCatalogSeeded)。
	 * 之后即使用户删除 sample 或整个文件夹也不重建——把删除自由交给用户。
	 * 升级路径:文件夹已存在(老用户/自建)时直接标记已播种,不补任何文件,保留其既有内容。
	 */
	public async ensureWorkshopSamples(folder: string): Promise<void> {
		if (this.settings.workshopCatalogSeeded) return;
		const adapter = this.app.vault.adapter as any;
		try {
			if (await adapter.exists(folder)) {
				this.settings.workshopCatalogSeeded = true;
				await this.saveSettings();
				return;
			}
			await adapter.mkdir(folder);
			for (const s of LanguageMadeEasyPlugin.BUNDLED_WORKSHOP_SAMPLES) {
				await adapter.write(`${folder}/${s.name}`, s.content);
			}
			this.settings.workshopCatalogSeeded = true;
			await this.saveSettings();
		} catch (e) {
			console.warn('[LME] ensureWorkshopSamples failed:', e);
		}
	}

	// ── 工坊目录文件夹:sidecar workshop-catalog.json(读-合-写) ──

	private get workshopFolderStorePath(): string {
		return `${this.app.vault.configDir}/plugins/${this.manifest.id}/workshop-catalog.json`;
	}

	/** 目录文件夹原始值('' = 未设置,用默认)。 */
	public getWorkshopFolderRaw(): string {
		return this.workshopFolderState.folder.trim();
	}

	/** 目录文件夹(已应用默认值),目录页渲染用。 */
	public getWorkshopFolder(): string {
		return this.getWorkshopFolderRaw() || DEFAULT_WORKSHOP_FOLDER;
	}

	/**
	 * 启动装载:sidecar 优先;sidecar 缺失而旧 data.json 字段有值时播种迁移
	 * (updatedAt 用 0,保证磁盘上任何真实的对端写入都能压过本地播种值)。
	 */
	private async loadWorkshopFolderStore(): Promise<void> {
		await this.refreshWorkshopFolderFromDisk();
		const legacy = (this.settings.workshopCatalogFolder || '').trim();
		if (!this.workshopFolderState.updatedAt && legacy) {
			this.workshopFolderState = { version: WORKSHOP_FOLDER_STORE_VERSION, folder: legacy, updatedAt: 0 };
			await this.writeWorkshopFolderStore();
		}
	}

	/**
	 * 读 sidecar → 内存(磁盘新者胜)。启动与目录页 render 时调用,吸收对端
	 * 经同步落地的更新——手机端不必重启即可看到桌面端刚改的路径。
	 */
	public async refreshWorkshopFolderFromDisk(): Promise<boolean> {
		try {
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(this.workshopFolderStorePath))) return false;
			const file = parseFolderState(await adapter.read(this.workshopFolderStorePath));
			if (!file) return false;
			const merged = mergeFolderState(file, this.workshopFolderState);
			if (merged.updatedAt === this.workshopFolderState.updatedAt && merged.folder === this.workshopFolderState.folder) return false;
			this.workshopFolderState = merged;
			return true;
		} catch (e) {
			console.warn('[LME] workshop-catalog.json 读取失败', e);
			return false;
		}
	}

	/** 设置页改路径:更新内存态 → read-merge-write 落盘 → 刷新目录页。 */
	public async setWorkshopFolder(folder: string): Promise<void> {
		const trimmed = folder.trim();
		this.workshopFolderState = { version: WORKSHOP_FOLDER_STORE_VERSION, folder: trimmed, updatedAt: Date.now() };
		// 兼容镜像:尚未升级的旧版本 build 仍读 data.json 字段
		if (this.settings.workshopCatalogFolder !== trimmed) {
			this.settings.workshopCatalogFolder = trimmed;
			await this.saveSettings();
		}
		await this.writeWorkshopFolderStore();
		await this.refreshWorkshopCatalog();
	}

	/** read-merge-write:落盘前重读,磁盘上更新的对端值(同步刚落地)不被本端旧值覆盖。 */
	private async writeWorkshopFolderStore(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			let file: WorkshopFolderState | null = null;
			try {
				if (await adapter.exists(this.workshopFolderStorePath)) {
					file = parseFolderState(await adapter.read(this.workshopFolderStorePath));
				}
			} catch { /* 读失败按无文件处理,继续写入 */ }
			const merged = file ? mergeFolderState(file, this.workshopFolderState) : this.workshopFolderState;
			this.workshopFolderState = merged;
			await adapter.write(this.workshopFolderStorePath, serializeFolderState(merged));
		} catch (e) {
			console.warn('[LME] workshop-catalog.json 写入失败', e);
		}
	}

	/** 目录页/外部刷新用:重新渲染已打开的目录视图(如设置改了文件夹后)。 */
	public async refreshWorkshopCatalog(): Promise<void> {
		for (const leaf of this.app.workspace.getLeavesOfType(WORKSHOP_CATALOG_VIEW_TYPE)) {
			const view = leaf.view as any;
			if (typeof view.refresh === 'function') {
				try { await view.refresh(); } catch (e) { console.warn('[LME] catalog refresh failed:', e); }
			}
		}
	}

	/** 新报告生成后刷新已打开的 AI 报告管理目录页。 */
	public async refreshAiReportCatalog(): Promise<void> {
		for (const leaf of this.app.workspace.getLeavesOfType(AI_REPORT_CATALOG_VIEW_TYPE)) {
			const view = leaf.view as any;
			if (typeof view.refresh === 'function') {
				try { await view.refresh(); } catch (e) { console.warn('[LME] ai report catalog refresh failed:', e); }
			}
		}
	}

	async activateView(type: string, side: 'main' | 'right' = 'right') {
		console.log('[LME] activateView called for type:', type, 'on side:', side);
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(type)[0];
		console.log('[LME] Existing leaf:', !!leaf);
		if (!leaf) {
			console.log('[LME] Creating new leaf');
			leaf = (side === 'main') ? workspace.getLeaf('tab') : workspace.getRightLeaf(false);
			console.log('[LME] Leaf created:', !!leaf);
			if (leaf) {
				await leaf.setViewState({ type, active: true });
				console.log('[LME] View state set');
			}
		}

		// Force reveal sidebars on mobile/tablet
		if (side === 'right' && this.app.workspace.rightSplit) {
			console.log('[LME] Expanding right sidebar');
			this.app.workspace.rightSplit.expand();
		} else if (side === 'left' && this.app.workspace.leftSplit) {
			this.app.workspace.leftSplit.expand();
		}

		workspace.revealLeaf(leaf);
		console.log('[LME] Leaf revealed');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		if (!Array.isArray(this.settings.youtubeSubscriptions)) this.settings.youtubeSubscriptions = [];
		if (!Array.isArray(this.settings.youtubeFeedItems)) this.settings.youtubeFeedItems = [];
		if (!Array.isArray(this.settings.youtubeSubscriptionCategories)) this.settings.youtubeSubscriptionCategories = [];
		this.settings.youtubeRssCheckIntervalMin = Number.isFinite(Number(this.settings.youtubeRssCheckIntervalMin))
			? Math.max(15, Number(this.settings.youtubeRssCheckIntervalMin)) : 60;
		if (typeof this.settings.youtubeRssNotifications !== 'boolean') this.settings.youtubeRssNotifications = true;
		await this.migrateToLocalDictionaries();
		this.migrateBuiltinApiKeys();
		this.migrateAiProviders();
		this.migrateSyncWatermark();
		await this.checkAiPromptsBackup();
		await this.loadWorkshopFolderStore();
	}


	/**
	 * Sync watermark migration: the old schema stored a single number
	 * (the last imported exportTime); the new bidirectional schema tracks a
	 * per-sourceDevice watermark. A scalar (or missing) value resets to {},
	 * which simply means "ingest every peer file once" — safe because the
	 * merge is idempotent / last-write-wins.
	 */
	private migrateSyncWatermark(): void {
		const s = this.settings as any;
		if (typeof s.flashcardSyncLastTime === 'number' || !s.flashcardSyncLastTime) {
			s.flashcardSyncLastTime = {};
		}
	}

	/**
	 * Migrate the default built-in provider's key from the shared aiAnalysisApiKey
	 * field into its dedicated field (deepseekApiKey/geminiApiKey), so per-feature
	 * AI provider assignment resolves the correct key. Idempotent.
	 */
	private migrateBuiltinApiKeys(): void {
		const s = this.settings;
		if (s.aiAnalysisProvider === 'deepseek' && !s.deepseekApiKey && s.aiAnalysisApiKey) {
			s.deepseekApiKey = s.aiAnalysisApiKey;
		}
		if (s.aiAnalysisProvider === 'gemini' && !s.geminiApiKey && s.aiAnalysisApiKey) {
			s.geminiApiKey = s.aiAnalysisApiKey;
		}
	}

	/**
	 * Migrate legacy provider config into the unified aiProviders list.
	 * Seeds the two original built-ins (deepseek/gemini, with any legacy key/model)
	 * and ingests legacy customProviders. Other catalog presets are NOT auto-seeded —
	 * users add them on-demand from the settings UI. Idempotent (skips once populated).
	 */
	private migrateAiProviders(): void {
		const s = this.settings as any;
		if (Array.isArray(s.aiProviders) && s.aiProviders.length > 0) return;

		const providers: any[] = [];

		// 1. legacy custom providers → openai-compatible records
		(s.customProviders || []).forEach((cp: any) => {
			if (!cp || providers.some(p => p.id === cp.id)) return;
			providers.push({
				id: cp.id, name: cp.name, baseUrl: cp.baseUrl,
				model: cp.model, apiKey: cp.apiKey, kind: 'openai', isBuiltIn: false,
			});
		});

		// 2. seed the original two built-ins, carrying any legacy key/model
		const dsKey = s.deepseekApiKey || (s.aiAnalysisProvider === 'deepseek' ? s.aiAnalysisApiKey : '');
		const gmKey = s.geminiApiKey || (s.aiAnalysisProvider === 'gemini' ? s.aiAnalysisApiKey : '');
		(['deepseek', 'gemini'] as const).forEach(id => {
			if (providers.some(p => p.id === id)) return;
			const builtin = BUILTIN_PROVIDERS.find(p => p.id === id);
			if (!builtin) return;
			const key = id === 'deepseek' ? dsKey : gmKey;
			const model = (s.aiAnalysisProvider === id && s.aiAnalysisModel) ? s.aiAnalysisModel : builtin.model;
			providers.push({ ...builtin, apiKey: key || '', model });
		});

		s.aiProviders = providers;
	}
	async saveSettings() {
		await this.saveData(this.settings);
		void this.backupAiPrompts();
	}

	/** Path of the aiPrompts backup sidecar, sibling of data.json. */
	private get aiPromptsBackupPath(): string {
		return `${this.app.vault.configDir}/plugins/${this.manifest.id}/aiPrompts-backup.json`;
	}

	/**
	 * Write aiPrompts to a standalone backup file on every save. data.json can be
	 * clobbered by an iCloud-sync overwrite (leaving aiPrompts=[]); this sidecar
	 * survives that and lets checkAiPromptsBackup() restore it on next load.
	 */
	private async backupAiPrompts(): Promise<void> {
		try {
			const prompts = this.settings.aiPrompts;
			if (!Array.isArray(prompts) || prompts.length === 0) return;
			await this.app.vault.adapter.write(this.aiPromptsBackupPath, JSON.stringify(prompts));
		} catch (e) {
			console.warn('[LME] aiPrompts 备份失败', e);
		}
	}

	/**
	 * On load, if data.json's aiPrompts is empty but the backup sidecar has entries,
	 * auto-restore them (the typical iCloud-overwrite scenario) and notify.
	 */
	private async checkAiPromptsBackup(): Promise<void> {
		try {
			const current = this.settings.aiPrompts;
			if (Array.isArray(current) && current.length > 0) return;
			if (!(await this.app.vault.adapter.exists(this.aiPromptsBackupPath))) return;
			const backup = JSON.parse(await this.app.vault.adapter.read(this.aiPromptsBackupPath));
			if (!Array.isArray(backup) || backup.length === 0) return;
			this.settings.aiPrompts = backup;
			await this.saveData(this.settings);
			new Notice(`检测到 ${backup.length} 条提示词备份(data.json 的提示词为空,可能因同步覆盖丢失),已自动恢复`, 8000);
		} catch (e) {
			console.warn('[LME] aiPrompts 备份检查失败', e);
		}
	}

	private async migrateToLocalDictionaries(): Promise<void> {
		if (this.settings.localDictionaries && Object.keys(this.settings.localDictionaries).length > 0) {
			return;
		}

		const languages = ['english', 'german', 'french', 'spanish', 'korean', 'russian', 'japanese', 'chinese'];
		const migrated: Record<string, MdxDictionary[]> = {};

		for (const lang of languages) {
			const dicts: MdxDictionary[] = [];

			const mdxPath = this.settings[`${lang}MdxPath` as keyof LMESettings] as string;
			const mddPath = this.settings[`${lang}MddPath` as keyof LMESettings] as string;
			const cssPath = this.settings[`${lang}MdxCssPath` as keyof LMESettings] as string;
			if (mdxPath) {
				dicts.push({
					id: `${lang}_dict1_${Date.now()}`,
					name: mdxPath.split('/').pop()?.replace(/\.mdx$/i, '') || 'Dictionary 1',
					mdxPath,
					mddPath: mddPath || '',
					cssPath: cssPath || '',
				});
			}

			const mdxPath2 = this.settings[`${lang}MdxPath2` as keyof LMESettings] as string;
			const mddPath2 = this.settings[`${lang}MddPath2` as keyof LMESettings] as string;
			const cssPath2 = this.settings[`${lang}MdxCssPath2` as keyof LMESettings] as string;
			if (mdxPath2) {
				dicts.push({
					id: `${lang}_dict2_${Date.now()}`,
					name: mdxPath2.split('/').pop()?.replace(/\.mdx$/i, '') || 'Dictionary 2',
					mdxPath: mdxPath2,
					mddPath: mddPath2 || '',
					cssPath: cssPath2 || '',
				});
			}

			if (dicts.length > 0) {
				migrated[lang] = dicts;
			}
		}

		this.settings.localDictionaries = migrated;
		await this.saveSettings();
	}

	public applyUiTheme(): void {
		// 社区免费版:仅经典纸墨(paper-ink);其余主题为完整版功能,旧设置值回退。
		const theme = 'paper-ink';
		const isObsidianDark = document.body.classList.contains('theme-dark');

		// Remove existing lme-style-* classes
		for (let i = document.body.classList.length - 1; i >= 0; i--) {
			const cls = document.body.classList[i];
			if (cls.startsWith('lme-style-')) {
				document.body.classList.remove(cls);
			}
		}
		document.body.classList.add(`lme-style-${theme}`);

		// Apply theme variables directly via inline style (bypasses CSS file caching).
		// These inline variables outrank stylesheet .theme-dark tokens, so dark mode
		// needs an explicit variable set instead of relying on Obsidian's body class.
		const s = document.body.style;
		const themes: Record<string, Record<string, string>> = {
			'paper-ink': {},
		};

		const darkBase: Record<string, string> = {
			'--lme-paper-cream': '#121416',
			'--lme-paper-mist': '#191c20',
			'--lme-paper-aged': '#20242a',
			'--lme-paper-edge': 'rgba(255,255,255,0.10)',
			'--lme-ink-black': '#f3f6f8',
			'--lme-ink-brown': '#c6ced6',
			'--lme-spine-brown': '#8d98a5',
			'--lme-gold-accent': '#d8c56b',
			'--lme-seal-red': '#d98f7e',
			'--lme-academic-green': '#7db88a',
			'--lme-classic-blue': '#7aa7d9',
			'--lme-accent': '#d8c56b',
			'--lme-accent-rgb': '216, 197, 107',
			'--lme-accent-secondary': '#7aa7d9',
			'--lme-text-primary': '#f3f6f8',
			'--lme-text-secondary': '#c6ced6',
			'--lme-text-muted': '#8d98a5',
			'--lme-bg-deep': '#0d0f12',
			'--lme-bg-universe': '#090b0e',
			'--lme-bg-nebula': '#15181d',
			'--lme-paper-shadow': '0 14px 36px rgba(0,0,0,0.42)',
			'--lme-ink-glow': '0 0 20px rgba(216,197,107,0.14)',
			'--lme-gold-glow': '0 0 22px rgba(216,197,107,0.20)',
			'--lme-glass-bg': 'rgba(28,32,38,0.88)',
			'--lme-glass-border': 'rgba(255,255,255,0.10)',
		};


		// Clear all --lme-* custom properties first
		for (let i = s.length - 1; i >= 0; i--) {
			const prop = s[i];
			if (prop.startsWith('--lme-')) {
				s.removeProperty(prop);
			}
		}

		// Apply new theme variables(防御兜底:未知主题时回退空表)
		const vars = isObsidianDark ? darkBase : (themes[theme] || {});
		for (const [prop, value] of Object.entries(vars)) {
			s.setProperty(prop, value);
		}

		// Inject element-specific styles via <style> tag
		this.injectThemeStyles(theme);
	}

	private watchObsidianThemeChanges(): void {
		this.lastKnownObsidianDarkMode = document.body.classList.contains('theme-dark');

		const observer = new MutationObserver(() => {
			const isDark = document.body.classList.contains('theme-dark');
			if (isDark === this.lastKnownObsidianDarkMode) return;
			this.lastKnownObsidianDarkMode = isDark;
			this.applyUiTheme();
		});

		observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
		this.register(() => observer.disconnect());
	}

	private injectThemeStyles(theme: string): void {
		let el = document.getElementById('lme-dynamic-theme') as HTMLStyleElement | null;
		if (!el) {
			el = document.createElement('style');
			el.id = 'lme-dynamic-theme';
			document.head.appendChild(el);
		}

		if (theme === 'paper-ink') {
			el.textContent = this.getThemeDarkModeGuardrails();
			return;
		}

		// 社区免费版:非 paper-ink 主题的注入样式已随完整版移除;
		// 此分支理论不可达(applyUiTheme 已收敛为 paper-ink),兜底仅注入暗色护栏。
		el.textContent = this.getThemeDarkModeGuardrails();
	}

	private getThemeDarkModeGuardrails(): string {
		return `
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) {
				color-scheme: dark;
				--lme-dark-surface: var(--lme-paper-aged, #20242a);
				--lme-dark-surface-soft: var(--lme-paper-mist, #191c20);
				--lme-dark-surface-glass: var(--lme-glass-bg, rgba(28,32,38,0.88));
				--lme-dark-border: var(--lme-glass-border, rgba(255,255,255,0.10));
				--lme-dark-text: var(--lme-text-primary, var(--text-normal));
				--lme-dark-text-soft: var(--lme-text-secondary, var(--text-muted));
				--lme-dark-text-muted: var(--lme-text-muted, var(--text-faint));
				--lme-dark-accent: var(--lme-accent, var(--interactive-accent));
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-dict-view,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-flashcard-view,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-shadowing-view,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-navigation-view {
				background-color: var(--lme-bg-universe, #090b0e) !important;
				background-image:
					radial-gradient(circle at 12% 8%, rgba(var(--lme-accent-rgb, 216,197,107), 0.10) 0%, transparent 34%),
					radial-gradient(circle at 88% 18%, rgba(var(--lme-accent-rgb, 216,197,107), 0.07) 0%, transparent 36%),
					linear-gradient(180deg, var(--lme-bg-deep, #0d0f12) 0%, var(--lme-bg-universe, #090b0e) 100%) !important;
				color: var(--lme-dark-text) !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-dict-card,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-card-face,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-shadowing-item,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-settings-tabcontent > div,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-dict-search-wrapper,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .modal:has(.lme-add-flashcard-modal) {
				background: var(--lme-dark-surface-glass) !important;
				border-color: var(--lme-dark-border) !important;
				color: var(--lme-dark-text) !important;
				box-shadow: var(--lme-paper-shadow, 0 14px 36px rgba(0,0,0,0.42)) !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-card-face::before,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-dict-card::before,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-rating-btn-v2::after,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-btn::after,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-playback-btn::after,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-sidebar-btn::after {
				opacity: 0.08 !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) :where(
				.lme-dict-empty-title,
				.lme-card-word,
				.lme-card-word-sm,
				.lme-section-title,
				.lme-shadowing-item .text,
				.lme-shadowing-item .text *,
				.lme-dict-definition-container,
				.lme-dict-definition,
				.lme-dict-definition-container p,
				.lme-dict-definition-container span,
				.lme-dict-definition-container div,
				.lme-nav-title,
				.lme-nav-action,
				.lme-nav-action-label
			) {
				color: var(--lme-dark-text) !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) :where(
				.lme-dict-empty-desc,
				.lme-card-definition,
				.lme-card-context,
				.lme-card-hint,
				.lme-card-phonetic,
				.lme-text-muted,
				.lme-dict-phonetic,
				.lme-dict-pos,
				.lme-dict-context-label,
				.lme-nav-subtitle,
				.lme-nav-action-description
			) {
				color: var(--lme-dark-text-soft) !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) :where(input, textarea, select, .lme-search-box, .lme-dict-search-input),
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-add-flashcard-modal input[type="text"],
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-add-flashcard-modal textarea,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-nav-lookup-row input,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-nav-video-row input {
				background: var(--lme-dark-surface-soft) !important;
				border-color: var(--lme-dark-border) !important;
				color: var(--lme-dark-text) !important;
				box-shadow: none !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) :where(input, textarea, .lme-dict-search-input)::placeholder {
				color: var(--lme-dark-text-muted) !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) :where(
				.lme-btn,
				.lme-btn-subtle,
				.lme-open-note-btn-footer,
				.lme-open-note-btn-minimal,
				.lme-rating-btn-v2,
				.lme-playback-btn,
				.lme-sidebar-btn,
				.lme-audio-btn,
				.lme-add-flashcard-subtle,
				.lme-nav-language-badge,
				.lme-tag,
				.lme-filter-btn
			) {
				background: rgba(var(--lme-accent-rgb, 216,197,107), 0.12) !important;
				border-color: rgba(var(--lme-accent-rgb, 216,197,107), 0.22) !important;
				color: var(--lme-dark-text) !important;
				box-shadow: none !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) :where(
				.lme-btn:hover,
				.lme-btn-subtle:hover,
				.lme-open-note-btn-footer:hover,
				.lme-open-note-btn-minimal:hover,
				.lme-rating-btn-v2:hover,
				.lme-playback-btn:hover,
				.lme-sidebar-btn:hover,
				.lme-audio-btn:hover,
				.lme-add-flashcard-subtle:hover,
				.lme-nav-language-badge:hover
			) {
				background: rgba(var(--lme-accent-rgb, 216,197,107), 0.20) !important;
				border-color: rgba(var(--lme-accent-rgb, 216,197,107), 0.34) !important;
				color: var(--lme-dark-text) !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) :where(
				.lme-btn.mod-cta,
				.lme-btn.is-active,
				.lme-playback-btn.is-active,
				.lme-sidebar-btn.is-active,
				.lme-shadowing-item.active .time,
				.lme-heatmap-cell.active,
				.lme-heatmap-cell.is-today
			) {
				background: var(--lme-dark-accent) !important;
				border-color: var(--lme-dark-accent) !important;
				color: #101214 !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-shadowing-item:not(.active) {
				color: var(--lme-dark-text-soft) !important;
				opacity: 0.86 !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-shadowing-item .time {
				background: rgba(var(--lme-accent-rgb, 216,197,107), 0.12) !important;
				color: var(--lme-dark-text-soft) !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .is-dictation .lme-shadowing-item {
				background: transparent !important;
				border-color: transparent !important;
				box-shadow: none !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .is-dictation .lme-shadowing-item.active {
				background: rgba(var(--lme-accent-rgb, 216,197,107), 0.08) !important;
				border-left-color: var(--lme-dark-accent) !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-dictation-workbench {
				--lme-dictation-surface: var(--lme-dark-surface-glass) !important;
				--lme-dictation-surface-soft: rgba(var(--lme-accent-rgb, 216,197,107), 0.09) !important;
				--lme-dictation-border: var(--lme-dark-border) !important;
				--lme-dictation-rule: rgba(var(--lme-accent-rgb, 216,197,107), 0.16) !important;
				--lme-dictation-text: var(--lme-dark-text) !important;
				--lme-dictation-muted: var(--lme-dark-text-muted) !important;
				--lme-dictation-soft: var(--lme-dark-text-soft) !important;
				--lme-success: #69d58b !important;
				--lme-warning: #f5bd4f !important;
				--lme-danger: #ff8f86 !important;
				background: transparent !important;
				color: var(--lme-dark-text) !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-dictation-workbench :where(
				.lme-dictation-stage,
				.lme-dictation-summary,
				.lme-dictation-main-input,
				.lme-dictation-result-body
			) {
				background-color: var(--lme-dictation-surface) !important;
				border-color: var(--lme-dictation-border) !important;
				color: var(--lme-dictation-text) !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-dictation-workbench :where(
				.lme-dictation-action-btn,
				.lme-dictation-reveal-btn,
				.lme-dictation-finish-btn,
				.lme-dictation-token,
				.lme-dictation-summary-metrics div,
				.lme-dictation-original-flow
			) {
				background-color: var(--lme-dictation-surface-soft) !important;
				border-color: var(--lme-dictation-border) !important;
				color: var(--lme-dictation-text) !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-dictation-workbench :where(
				.lme-dictation-panel-label,
				.lme-dictation-time,
				.lme-dictation-mini-stats,
				.lme-dictation-history-meta,
				.lme-dictation-summary-label,
				.lme-dictation-empty-note,
				.lme-dictation-live-preview.is-empty,
				.lme-dictation-empty-answer
			) {
				color: var(--lme-dictation-muted) !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-heatmap-cell {
				background: rgba(var(--lme-accent-rgb, 216,197,107), 0.10) !important;
				border-color: rgba(var(--lme-accent-rgb, 216,197,107), 0.16) !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-dict-definition-container :where(a) {
				color: var(--lme-dark-accent) !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-navigation-view .lme-nav-section,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-navigation-view .lme-nav-stats-section,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-navigation-view .lme-nav-actions-section,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-navigation-view .lme-nav-stat {
				background: transparent !important;
				border: 0 !important;
				box-shadow: none !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-navigation-view .lme-nav-action {
				background: transparent !important;
				border: 0 !important;
				box-shadow: none !important;
				color: var(--lme-dark-accent) !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-navigation-view .lme-nav-action-icon {
				background: rgba(var(--lme-accent-rgb, 216,197,107), 0.10) !important;
			}

			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-navigation-view .lme-nav-action:hover,
			body.theme-dark[class*="lme-style-"]:not(.lme-style-neon-lime) .lme-navigation-view .lme-nav-action.is-pressed {
				background: rgba(var(--lme-accent-rgb, 216,197,107), 0.10) !important;
				box-shadow: none !important;
				color: var(--lme-dark-text) !important;
			}
		`;
	}


	private handleTimestampClick(ts: string) {
		const m = ts.match(/\[(\d{1,2}):(\d{2})\]/);
		if (m) {
			const sec = parseInt(m[1]) * 60 + parseInt(m[2]);
			const leaf = this.app.workspace.getLeavesOfType(SHADOWING_VIEW_TYPE)[0];
			if (leaf) (leaf.view as any).seekTo(sec);
		}
	}

	p
	p}

function contentToBlocks(content: string): { startSec: number; text: string }[] {
	const timestampRegex = /\[(\d{1,2}):(\d{2})\]/;
	if (timestampRegex.test(content)) {
		const lines = content.split('\n');
		const blocks: { startSec: number; text: string }[] = [];
		for (const line of lines) {
			const m = line.match(/\[(\d{1,2}):(\d{2})\]/);
			if (m) {
				blocks.push({ startSec: parseInt(m[1]) * 60 + parseInt(m[2]), text: line.trim() });
			}
		}
		return blocks;
	}
	return content.split(/\n\n+/)
		.filter(p => p.trim())
		.map((p, i) => ({ startSec: i * 10, text: p.trim() }));
}

async function executeDocAnalysis(plugin: LanguageMadeEasyPlugin, blocks: { startSec: number; text: string }[], promptContent: string, promptMeta?: { name: string; isBuiltIn: boolean }) {
	const settings = plugin.settings;
	const notice = new Notice(t('notifications.analyzing'), 0);
	try {
		const ai = AIService.resolveProvider(settings, 'docAnalysis');
		let failedChunks = 0;
		const markdown = await AIService.analyzeSubtitles(
			blocks,
			ai.provider,
			ai.apiKey,
			ai.model,
			settings.englishLevel,
			promptContent,
			settings.aiProviders,
			(done, total) => {
				if (total > 1 && notice.messageEl) {
					const current = Math.min(done + 1, total);
					notice.messageEl.setText(`${t('notifications.analyzing')} (${current}/${total})`);
				}
			},
			() => { failedChunks++; }
		);
		await plugin.activateView(AI_ANALYSIS_VIEW_TYPE, 'right');
		const leaves = plugin.app.workspace.getLeavesOfType(AI_ANALYSIS_VIEW_TYPE);
		if (leaves.length > 0) {
			const aiView = leaves[0].view as any;
			if (aiView.setResult) aiView.setResult(markdown, undefined, promptMeta);
		}
		notice.hide();
		if (failedChunks > 0) {
			new Notice(`⚠️ ${failedChunks} 段分析失败,已返回成功部分(详见控制台)`, 8000);
		} else {
			new Notice(t('notifications.aiDone'));
		}
	} catch (error) {
		notice.hide();
		new Notice(error instanceof Error ? error.message : t('aiAnalysis.failed'));
	}
}
