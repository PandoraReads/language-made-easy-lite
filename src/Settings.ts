// ============================================================
// Language Made Easy - Settings Tab with Language-Specific Tabs
// ============================================================

import { App, PluginSettingTab, Setting, Platform, Notice, FuzzySuggestModal, Modal, setIcon } from 'obsidian';
import type LanguageMadeEasyPlugin from './main-unified-full';
import { DEFAULT_SETTINGS, type LMESettings, BUILTIN_PROMPTS, type PromptTemplate, type MdxDictionary, type AIProviderConfig, type LanguageId, BUILTIN_PROVIDERS } from './models';
import { DICT_VIEW_TYPE } from './views/dict-view';
import { FLASHCARD_VIEW_TYPE } from './views/flashcard-view';
import { SHADOWING_VIEW_TYPE } from './views/shadowing-view';
import { FlashcardManagerModal } from './ui/flashcard-manager-modal';
import { UpgradeModal } from './ui/upgrade-modal';
import { db } from './core/Database';
import { randomUUID } from './mocks/crypto';
import { t } from './i18n';
import { showNativeOpenDialog } from './utils/electron-remote';
import { FREE_MDX_DICT_LIMIT } from './config/free-limits';

export { DEFAULT_SETTINGS };
export type { LMESettings };

export class LMESettingTab extends PluginSettingTab {
	plugin: LanguageMadeEasyPlugin;
	currentSettingsTab: 'general' | 'english' | 'german' | 'french' | 'spanish' | 'korean' | 'russian' | 'japanese' | 'chinese' = 'general';

	constructor(app: App, plugin: LanguageMadeEasyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('lme-settings');

		new Setting(containerEl).setName("").setHeading();

		// ── Tab Navigation ─────────────────────────────────────
		const tabNav = containerEl.createDiv('lme-settings-tabnav');

		const tabs = [
			{ id: 'general', name: t('settings.generalTab'), icon: '⚙️' },
			{ id: 'english', name: '🇬🇧 English', icon: '' },
			{ id: 'german', name: '🇩🇪 Deutsch', icon: '' },
			{ id: 'french', name: '🇫🇷 Français', icon: '' },
			{ id: 'spanish', name: '🇪🇸 Español', icon: '' },
			{ id: 'korean', name: '🇰🇷 한국어', icon: '' },
			{ id: 'russian', name: '🇷🇺 Русский', icon: '' },
			{ id: 'japanese', name: '🇯🇵 日本語', icon: '' },
			{ id: 'chinese', name: '🇨🇳 中文', icon: '' }
		];

		tabs.forEach(tab => {
			const btn = tabNav.createEl('button', {
				cls: `lme-tab-btn ${this.currentSettingsTab === tab.id ? 'active' : ''}`,
				text: tab.name
			});
			btn.onclick = () => {
				// 社区免费版:仅英语设置 tab 可进入,其他语种 tab 弹付费引导
				if (tab.id !== 'general' && tab.id !== 'english') {
					new UpgradeModal(this.app, tab.name.replace(/^\S+\s/, '')).open();
					return;
				}
				this.currentSettingsTab = tab.id;
				this.display();
			};
		});

		// ── Tab Content ─────────────────────────────────────────
		const contentEl = containerEl.createDiv('lme-settings-tabcontent');

		switch (this.currentSettingsTab) {
			case 'general':
				this.renderGeneralSettings(contentEl);
				break;
			case 'english':
				this.renderLanguageSettings(contentEl, 'english');
				break;
			case 'german':
				this.renderLanguageSettings(contentEl, 'german');
				break;
			case 'french':
				this.renderLanguageSettings(contentEl, 'french');
				break;
			case 'spanish':
				this.renderLanguageSettings(contentEl, 'spanish');
				break;
			case 'korean':
				this.renderLanguageSettings(contentEl, 'korean');
				break;
			case 'russian':
				this.renderLanguageSettings(contentEl, 'russian');
				break;
			case 'japanese':
				this.renderLanguageSettings(contentEl, 'japanese');
				break;
			case 'chinese':
				this.renderLanguageSettings(contentEl, 'chinese');
				break;
		}

		this.groupSettingsSections(contentEl);
	}

	/**
	 * 把 contentEl 内每个 h3 标题及其后续兄弟(直到下一个 h3)收进一张
	 * .lme-settings-section 卡片;h4 子组天然落在所属 h3 卡片内。
	 * 纯视图变换,不改各 render 方法里的 Setting 构建逻辑。
	 */
	private groupSettingsSections(contentEl: HTMLElement): void {
		const nodes = Array.from(contentEl.childNodes);
		let section: HTMLElement | null = null;
		for (const node of nodes) {
			if (node.instanceOf(HTMLElement) && node.tagName === 'H3') {
				section = createDiv();
				section.className = 'lme-settings-section';
				contentEl.insertBefore(section, node);
				section.appendChild(node);
			} else if (section) {
				section.appendChild(node);
			}
		}
	}

	private addToggleWithStatus(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		getValue: () => boolean,
		onChange: (v: boolean) => Promise<void>,
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addDropdown(drop => {
				drop.addOption('on', t('common.on'))
					.addOption('off', t('common.off'))
					.setValue(getValue() ? 'on' : 'off')
					.onChange(async (v) => {
						await onChange(v === 'on');
					});
			});
	}

	private addFeatureProviderDropdown(
		containerEl: HTMLElement,
		labelKey: string,
		field: keyof LMESettings
	): void {
		const providers = (this.plugin.settings.aiProviders || []).filter(p => p.apiKey);
		new Setting(containerEl)
			.setName(t(labelKey))
			.addDropdown(drop => {
				drop.addOption('', t('settings.aiFeatureDefault'));
				providers.forEach(p => drop.addOption(p.id, p.name));
				const cur = (this.plugin.settings[field] as string) || '';
				drop.setValue(providers.some(p => p.id === cur) ? cur : '');
				drop.onChange(async (v) => {
					(this.plugin.settings[field] as unknown) = v;
					await this.plugin.saveSettings();
				});
			});
	}

	private renderGeneralSettings(containerEl: HTMLElement) {
		// ── Current Language Selection ─────────────────────────
		new Setting(containerEl).setName("").setHeading();

		new Setting(containerEl)
			.setName(t('settings.currentLanguageName'))
			.setDesc(`${t('settings.currentLanguageDesc')}
${t('settings.fullEditionNote')}`)
			.addDropdown(drop => {
				// 社区免费版:语种入口固定为英语,不再逐次弹付费引导
				drop.addOption('english', '🇬🇧 English')
					.setValue('english')
					.onChange(async () => {
						await this.plugin.switchLanguage('english');
						this.display();
					});
			});


		// ── UI Style Theme ─────────────────────────────────────
		new Setting(containerEl).setName("").setHeading();

		new Setting(containerEl)
			.setName(t('settings.uiStyleName'))
			.setDesc(`${t('settings.uiStyleDesc')}
${t('settings.fullEditionNote')}`)
			.addDropdown(drop => {
				// 社区免费版:主题入口固定为经典纸墨,不再逐次弹付费引导
				drop.addOption('paper-ink', 'Paper & Ink (经典纸墨)')
					.setValue('paper-ink')
					.onChange(async () => {
						this.plugin.settings.uiStyle = 'paper-ink';
						await this.plugin.saveSettings();
						this.plugin.applyUiTheme();
					});
			});

		// ── Double-click Lookup ───────────────────────────────
		new Setting(containerEl).setName("").setHeading();

		this.addToggleWithStatus(
			containerEl,
			t('settings.doubleClickLookup'),
			t('settings.doubleClickLookupDesc'),
			() => this.plugin.settings.doubleClickLookupEnabled,
			async (v) => { this.plugin.settings.doubleClickLookupEnabled = v; await this.plugin.saveSettings(); },
		);

		// ── Flashcard Settings ─────────────────────────────────
		new Setting(containerEl).setName("").setHeading();

		new Setting(containerEl)
			.setName(t('settings.dailyLimit'))
			.setDesc(t('settings.dailyLimitDesc'))
			.addText(t => {
				t.setPlaceholder('0-200')
					.setValue(String(this.plugin.settings.dailyReviewLimit))
				.onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!isNaN(n) && n >= 0 && n <= 200) {
						this.plugin.settings.dailyReviewLimit = n;
						await this.plugin.saveSettings();
					}
				});
				t.inputEl.type = 'number';
				t.inputEl.style.width = '80px';
			});

		new Setting(containerEl)
			.setName(t('settings.flashcardStudyMode'))
			.setDesc(`${t('settings.flashcardStudyModeDesc')}
${t('settings.fullEditionNote')}`)
			.addDropdown(drop => {
				// 社区免费版:学习模式入口固定为翻卡,不再逐次弹付费引导
				drop.addOption('flip', t('settings.flashcardStudyModeFlip'))
					.setValue('flip')
					.onChange(async () => {
						this.plugin.settings.flashcardStudyMode = 'flip';
						await this.plugin.saveSettings();
					});
			});
			});

		// ── Auto Cleanup ───────────────────────
		new Setting(containerEl).setName("").setHeading();

		this.addToggleWithStatus(
			containerEl,
			t('settings.autoCleanup'),
			t('settings.autoCleanupDesc'),
			() => this.plugin.settings.autoCleanupMastered,
			async (v) => { this.plugin.settings.autoCleanupMastered = v; await this.plugin.saveSettings(); },
		);

		new Setting(containerEl)
			.setName(t('settings.cleanupDelay'))
			.setDesc(t('settings.cleanupDelayDesc'))
			.addText(t => {
				t.setPlaceholder('1-30')
					.setValue(String(this.plugin.settings.cleanupDelayDays))
				.onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!isNaN(n) && n >= 1 && n <= 30) {
						this.plugin.settings.cleanupDelayDays = n;
						await this.plugin.saveSettings();
					}
				});
				t.inputEl.type = 'number';
				t.inputEl.style.width = '80px';
			});

		new Setting(containerEl)
			.setName(t('settings.cleanupManual'))
			.setDesc(t('settings.cleanupManualDesc'))
			.addButton(btn => btn
				.setButtonText(t('settings.cleanupNow'))
				.onClick(async () => {
					const languages: LanguageId[] = ['english', 'german', 'french', 'spanish', 'korean', 'russian', 'japanese', 'chinese'];
					let totalDeleted = 0;
					const beforeTime = Date.now() - this.plugin.settings.cleanupDelayDays * 86400000;

					for (const lang of languages) {
						await db.syncMasteredStatus(lang);
						const toDelete = await db.getMasteredBefore(lang, beforeTime);
						if (toDelete.length > 0) {
							const ids = toDelete.map(e => e.id);
							await db.batchDeleteVocabulary(ids);
							totalDeleted += ids.length;
						}
					}

					if (totalDeleted > 0) {
						new Notice(t('settings.cleanupResult', { count: totalDeleted }));
					} else {
						new Notice(t('settings.cleanupNone'));
					}
				}));

		// ── Flashcard Manager Button ─────────────────────
		new Setting(containerEl).setName("").setHeading();

		new Setting(containerEl)
			.setName(t('settings.flashcardManageAll'))
			.setDesc(t('settings.flashcardManageAllDesc'))
			.addButton(btn => btn
				.setButtonText(t('settings.openFlashcardManager'))
				.onClick(() => {
					new FlashcardManagerModal(this.app, this.plugin).open();
				}));

		// ── Video Download Path ──────────────────────────────────
		new Setting(containerEl).setName("").setHeading();
		containerEl.createEl('p', {
			text: t('settings.videoDownloadDesc'),
			cls: 'lme-settings-hint'
		});

		new Setting(containerEl)
			.setName(t('settings.videoFolder'))
			.setDesc(t('settings.videoFolderDesc'))
			.addText(t => {
				t.setPlaceholder('Videos/Bilibili')
					.setValue(this.plugin.settings.videoDownloadFolder || '')
					.onChange(async (v) => {
						this.plugin.settings.videoDownloadFolder = v.trim();
						await this.plugin.saveSettings();
					});
				})
				.addButton(btn => btn
					.setButtonText(t('common.browse'))
					.onClick(() => {
						const folders = this.getAllFolders();
						const suggestions = folders.length > 0 ? folders : [];

						const contentEl = btn.buttonEl.closest('.setting-item')?.querySelector('input');
						if (contentEl && suggestions.length > 0) {
							this.showFolderSuggest(contentEl, suggestions);
						}
					}));

			new Setting(containerEl)
				.setName(t('settings.videoNoteFolder'))
				.setDesc(t('settings.videoNoteFolderDesc'))
				.addText(text => {
					text.setPlaceholder(t('settings.videoNoteFolderPlaceholder'))
						.setValue(this.plugin.settings.videoNoteFolder || '')
						.onChange(async (v) => {
							this.plugin.settings.videoNoteFolder = v.trim();
							await this.plugin.saveSettings();
						});
					text.inputEl.style.width = '100%';
				});

			new Setting(containerEl)
				.setName(t('settings.workshopFolder'))
				.setDesc(t('settings.workshopFolderDesc'))
				.addText(text => {
					// 走 sidecar 存储(setWorkshopFolder 内部会镜像回 data.json 兼容旧版并刷新目录页):
					// 直接读写 settings.workshopCatalogFolder 会被另一端的旧快照覆写,
					// 手机端目录页就会一直回落到默认 LME Workshop
					text.setPlaceholder('LME Workshop')
						.setValue(this.plugin.getWorkshopFolderRaw())
						.onChange(async (v) => {
							await this.plugin.setWorkshopFolder(v);
						});
					text.inputEl.style.width = '100%';
				});

			new Setting(containerEl).setName("").setHeading();
			new Setting(containerEl)
				.setName(t('settings.youtubeRssInterval'))
				.setDesc(t('settings.youtubeRssIntervalDesc'))
				.addDropdown(drop => {
					for (const minutes of [15, 30, 60, 120]) drop.addOption(String(minutes), String(minutes));
					drop.setValue(String(this.plugin.settings.youtubeRssCheckIntervalMin || 30))
						.onChange(async (value) => { this.plugin.settings.youtubeRssCheckIntervalMin = Number(value); await this.plugin.saveSettings(); });
				});
			this.addToggleWithStatus(
				containerEl,
				t('settings.youtubeRssNotifications'),
				t('settings.youtubeRssNotificationsDesc'),
				() => this.plugin.settings.youtubeRssNotifications,
				async (value) => { this.plugin.settings.youtubeRssNotifications = value; await this.plugin.saveSettings(); },
			);

			// ── B站登录 (mobile only - desktop works without cookie) ────
		// Note: Mobile subtitle download works without login via multi-strategy fallback.
		// Login/cookie is no longer required.

		// ── AI Analysis ────────────────────────────────────────
		new Setting(containerEl).setName("").setHeading();
		containerEl.createEl('p', {
			text: t('settings.aiSectionDesc'),
			cls: 'lme-settings-hint'
		});

		// -- AI Analysis Prompt Management --
			new Setting(containerEl).setName("").setHeading();
			containerEl.createEl('p', {
				text: t('settings.aiPromptsDesc'),
				cls: 'setting-item-description'
			});

			const promptListEl = containerEl.createDiv('lme-prompt-list');

			const renderPromptList = () => {
				promptListEl.empty();
				const customIds = new Set((this.plugin.settings.aiPrompts || []).map(p => p.id));
					const prompts = [...BUILTIN_PROMPTS.filter(b => !customIds.has(b.id)), ...(this.plugin.settings.aiPrompts || [])];
				prompts.forEach((p) => {
					const item = promptListEl.createDiv('lme-prompt-item');
					item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;margin:4px 0;border:1px solid var(--background-modifier-border);border-radius:6px;';

					const info = item.createDiv();
					info.style.cssText = 'flex:1;';
					info.createSpan({ text: p.isBuiltIn ? t('prompts.' + p.name) : p.name });
					if (p.isBuiltIn) {
						const badge = info.createSpan({ text: ' ' + t('settings.builtin') });
						badge.style.cssText = 'margin-left:8px;font-size:0.75em;background:var(--interactive-accent);color:var(--text-on-accent);padding:1px 6px;border-radius:3px;';
					}

					const actions = item.createDiv();
					actions.style.cssText = 'display:flex;gap:6px;';

					const viewBtn = actions.createEl('button', { text: t('common.view') });
					viewBtn.style.cssText = 'font-size:0.8em;';
					viewBtn.onclick = () => new PromptViewModal(this.app, p).open();

					const editBtn = actions.createEl('button', { text: t('common.edit') });
						editBtn.style.cssText = 'font-size:0.8em;';
						// 社区免费版:编辑提示词为完整版功能,按钮禁用,不再逐次弹付费引导
						editBtn.disabled = true;
						editBtn.setAttr('title', t('settings.fullEditionNote'));

						if (!p.isBuiltIn) {
							const delBtn = actions.createEl('button', { text: t('common.delete') });
							delBtn.style.cssText = 'font-size:0.8em;color:var(--text-error);';
							delBtn.onclick = async () => {
								this.plugin.settings.aiPrompts = (this.plugin.settings.aiPrompts || []).filter(x => x.id !== p.id);
								await this.plugin.saveSettings();
								renderPromptList();
							};
						}
				});
			};

			renderPromptList();

			new Setting(containerEl)
				.setName(t('settings.addPrompt'))
				.setDesc(t('settings.fullEditionNote'))
				.addButton(btn => {
					// 社区免费版:添加自定义提示词为完整版功能,按钮禁用,不再逐次弹付费引导
					btn.setButtonText(t('settings.newPrompt'))
						.setDisabled(true);
				});


		this.renderAiProvidersSection(containerEl);

		new Setting(containerEl)
			.setName(t('settings.languageLevel'))
			.setDesc(t('settings.languageLevelDesc'))
			.addDropdown(drop => {
				drop.addOption('beginner', t('settings.levelBeginner'))
					.addOption('intermediate', t('settings.levelIntermediate'))
					.addOption('advanced', t('settings.levelAdvanced'))
					.addOption('native', t('settings.levelNative'))
					.setValue(this.plugin.settings.englishLevel || 'intermediate')
					.onChange(async (v) => {
						this.plugin.settings.englishLevel = v;
						await this.plugin.saveSettings();
					});
			});


			// ── Per-feature AI provider assignment (advanced, collapsed by default) ──
		const adv = containerEl.createEl('details', { cls: 'lme-ai-advanced' });
		adv.createEl('summary', { text: t('settings.aiFeatureAssignment') });
		adv.createEl('p', {
			text: t('settings.aiFeatureAssignmentDesc'),
			cls: 'lme-settings-hint'
		});
		this.addFeatureProviderDropdown(adv, 'settings.aiFeatureDocAnalysis', 'aiDocAnalysisProvider');
		this.addFeatureProviderDropdown(adv, 'settings.aiFeatureFlashcardFill', 'aiFlashcardFillProvider');
		this.addFeatureProviderDropdown(adv, 'settings.aiFeatureAiScoring', 'aiScoringProvider');

		// ── Audio Transcription (Whisper) ─────────────────────
		new Setting(containerEl).setName("").setHeading();
		containerEl.createEl('p', {
			text: t('settings.transcriptionSectionDesc'),
			cls: 'lme-settings-hint'
		});

		new Setting(containerEl)
			.setName(t('settings.transcriptionBaseUrl'))
			.setDesc(t('settings.transcriptionBaseUrlDesc'))
			.addText(t => {
				t.setPlaceholder('https://api.openai.com/v1')
					.setValue(this.plugin.settings.transcriptionBaseUrl || '')
					.onChange(async (v) => {
						this.plugin.settings.transcriptionBaseUrl = v.trim();
						await this.plugin.saveSettings();
					});
				t.inputEl.style.width = '100%';
			});

		new Setting(containerEl)
			.setName(t('settings.transcriptionApiKey'))
			.setDesc(t('settings.transcriptionApiKeyDesc'))
			.addText(t => {
				t.setPlaceholder('sk-...')
					.setValue(this.plugin.settings.transcriptionApiKey || '')
					.onChange(async (v) => {
						this.plugin.settings.transcriptionApiKey = v.trim();
						await this.plugin.saveSettings();
					});
				t.inputEl.type = 'password';
			});

		new Setting(containerEl)
			.setName(t('settings.transcriptionModel'))
			.setDesc(t('settings.transcriptionModelDesc'))
			.addText(t => {
				t.setPlaceholder('whisper-1')
					.setValue(this.plugin.settings.transcriptionModel || '')
					.onChange(async (v) => {
						this.plugin.settings.transcriptionModel = v.trim();
						await this.plugin.saveSettings();
					});
				t.inputEl.style.width = '100%';
			});

		new Setting(containerEl)
			.setName(t('settings.subtitleNoteFolder'))
			.setDesc(t('settings.subtitleNoteFolderDesc'))
			.addText(text => {
				text.setPlaceholder(t('settings.subtitleNoteFolderPlaceholder'))
					.setValue(this.plugin.settings.subtitleNoteFolder || '')
					.onChange(async (v) => {
						this.plugin.settings.subtitleNoteFolder = v.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.style.width = '100%';
			});

		new Setting(containerEl)
			.setName(t('settings.autoOpenSubtitleNote'))
			.setDesc(t('settings.autoOpenSubtitleNoteDesc'))
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.autoOpenSubtitleNote !== false)
					.onChange(async (v) => {
						this.plugin.settings.autoOpenSubtitleNote = v;
						await this.plugin.saveSettings();
					});
			});

	}

	private renderLanguageSettings(containerEl: HTMLElement, language: LanguageId) {
		const langNames: Record<LanguageId, string> = {
			english: 'English',
			german: 'Deutsch',
			french: 'Français',
			spanish: 'Español',
			korean: '한국어',
			russian: 'Русский',
			japanese: '日本語',
				chinese: '中文'
		};
		const langFlags: Record<LanguageId, string> = {
			english: '🇬🇧',
			german: '🇩🇪',
			french: '🇫🇷',
			spanish: '🇪🇸',
			korean: '🇰🇷',
			russian: '🇷🇺',
			japanese: '🇯🇵',
				chinese: '🇨🇳'
		};
		const langNamesEn: Record<LanguageId, string> = {
			english: 'English',
			german: 'German',
			french: 'French',
			spanish: 'Spanish',
			korean: 'Korean',
			russian: 'Russian',
			japanese: 'Japanese',
			chinese: 'Chinese'
		};
		const langName = langNames[language];
		const langFlag = langFlags[language];
		const langNameEn = langNamesEn[language];

		// Title
		new Setting(containerEl).setName("").setHeading();

		// ── Vocabulary Notebook ────────────────────────────────
		new Setting(containerEl).setName("").setHeading();

		const vocabFolderKey = `${language}VocabNoteFolder` as keyof LMESettings;
		const vocabFileNameKey = `${language}VocabNoteFileName` as keyof LMESettings;

		new Setting(containerEl)
			.setName(t('settings.vocabFolder'))
			.setDesc(t('settings.vocabFolderDesc'))
			.addText(t => t
				.setPlaceholder(`${langNameEn}/Vocabulary`)
				.setValue(this.plugin.settings[vocabFolderKey] as string || '')
				.onChange(async (v) => {
					(this.plugin.settings[vocabFolderKey] as string) = v.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('settings.vocabFileName'))
			.addText(text => text
				.setPlaceholder(t('settings.vocabFileName'))
				.setValue(this.plugin.settings[vocabFileNameKey] as string || '')
				.onChange(async (v) => {
					(this.plugin.settings[vocabFileNameKey] as string) = v.trim() || `${langNameEn} Vocabulary`;
					await this.plugin.saveSettings();
				}));

		// ── Online Dictionary ─────────────────────────────────
		new Setting(containerEl).setName("").setHeading();

		const onlineDictKey = `${language}OnlineDict` as keyof LMESettings;
		const youdaoLanguages = new Set(['english', 'french', 'korean', 'japanese', 'spanish', 'russian', 'german']);
		const defaultOnlineDict = youdaoLanguages.has(language) ? 'youdao-free' : 'google-free';

		containerEl.createEl('p', {
			text: t('settings.onlineDictHint', { lang: language === 'english' ? 'English' : langName, default: youdaoLanguages.has(language) ? t('settings.youdaoDict') : t('settings.googleTranslate') }),
			cls: 'lme-settings-hint'
		});

		const onlineDictEnabledKey = `${language}OnlineDictEnabled` as keyof LMESettings;
		this.addToggleWithStatus(
			containerEl,
			t('settings.onlineDictEnabled'),
			t('settings.onlineDictEnabledDesc'),
			() => this.plugin.settings[onlineDictEnabledKey] !== false,
			async (v) => {
				(this.plugin.settings[onlineDictEnabledKey] as unknown) = v;
				await this.plugin.saveSettings();
			},
		);

		new Setting(containerEl)
			.setName(t('settings.onlineDictProvider'))
			.setDesc(t('settings.onlineDictDesc'))
			.addDropdown(drop => {
				if (language === 'japanese') {
					drop.addOption('jisho-free', t('settings.jishoDict'));
				}
				if (youdaoLanguages.has(language)) {
					drop.addOption('youdao-free', t('settings.youdaoDict'));
				}
				drop.addOption('google-free', t('settings.googleTranslate'))
					.addOption('mymemory-free', t('settings.mymemoryTranslate'))

				drop.setValue((this.plugin.settings[onlineDictKey] as string) || defaultOnlineDict)
					.onChange(async (v) => {
						(this.plugin.settings[onlineDictKey] as unknown) = v;
						await this.plugin.saveSettings();
					});
			});

		// ── Local MDX Dictionary ───────────────────────────────
		new Setting(containerEl).setName("").setHeading();

		if (!Platform.isMobile) {
			containerEl.createEl('p', {
				text: t('settings.localMdxDesc'),
				cls: 'lme-settings-hint'
			});

			const dictListEl = containerEl.createDiv('lme-mdx-dict-list');

			const renderDictList = () => {
				dictListEl.empty();
				if (!this.plugin.settings.localDictionaries) {
					this.plugin.settings.localDictionaries = {};
				}
				const dicts = this.plugin.settings.localDictionaries[language] || [];

				if (dicts.length === 0) {
					dictListEl.createEl('p', {
						text: t('settings.localMdxNone'),
						cls: 'lme-settings-hint'
					});
				}

				let draggingId: string | null = null;

				const reorderDictionary = async (sourceId: string, targetId: string) => {
					if (sourceId === targetId) return;
					const current = this.plugin.settings.localDictionaries[language] || [];
					const from = current.findIndex(d => d.id === sourceId);
					const to = current.findIndex(d => d.id === targetId);
					if (from === -1 || to === -1) return;
					const [moved] = current.splice(from, 1);
					current.splice(to, 0, moved);
					this.plugin.settings.localDictionaries[language] = current;
					await this.plugin.saveSettings();
					renderDictList();
				};

				dicts.forEach((dict) => {
					const item = dictListEl.createDiv('lme-mdx-dict-item');
					item.draggable = true;
					item.dataset.dictId = dict.id;

					const handle = item.createDiv('lme-mdx-dict-drag-handle');
					handle.setAttr('aria-label', t('settings.localMdxDrag'));
					handle.setAttr('title', t('settings.localMdxDrag'));
					handle.textContent = '☰';

					const info = item.createDiv();
					info.addClass('lme-mdx-dict-info');
					info.createSpan({ text: dict.name || t('mdxEdit.unnamedDict') });
					const pathHint = info.createDiv();
					pathHint.addClass('lme-mdx-dict-path');
					// store 条目(移动端导入,经同步流过来)无 mdxPath,退显名称防渲染崩溃
					pathHint.textContent = dict.mdxPath?.split('/').pop() || dict.name || '';

					const actions = item.createDiv();
					actions.addClass('lme-mdx-dict-actions');

					const editBtn = actions.createEl('button', { text: t('common.edit') });
					editBtn.onclick = () => {
						new MdxDictEditModal(this.app, this.plugin, language, dict, () => renderDictList()).open();
					};

					const delBtn = actions.createEl('button', { text: t('common.delete') });
					delBtn.addClass('lme-mdx-dict-delete');
					delBtn.onclick = async () => {
						const current = this.plugin.settings.localDictionaries[language] || [];
						this.plugin.settings.localDictionaries[language] = current.filter(d => d.id !== dict.id);
						await this.plugin.saveSettings();
						renderDictList();
					};

					item.addEventListener('dragstart', (event) => {
						draggingId = dict.id;
						item.addClass('is-dragging');
						event.dataTransfer?.setData('text/plain', dict.id);
						if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
					});
					item.addEventListener('dragend', () => {
						draggingId = null;
						item.removeClass('is-dragging');
						dictListEl.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
					});
					item.addEventListener('dragover', (event) => {
						if (!draggingId || draggingId === dict.id) return;
						event.preventDefault();
						item.addClass('is-drop-target');
						if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
					});
					item.addEventListener('dragleave', () => {
						item.removeClass('is-drop-target');
					});
					item.addEventListener('drop', async (event) => {
						event.preventDefault();
						item.removeClass('is-drop-target');
						const sourceId = event.dataTransfer?.getData('text/plain') || draggingId;
						if (sourceId) await reorderDictionary(sourceId, dict.id);
					});
				});
			};

			renderDictList();

			// 社区免费版:本地词典上限(路径式+移动端导入合计),触顶加锁并弹付费引导
			{
				const dictCount = (this.plugin.settings.localDictionaries?.[language] || []).length;
				const atLimit = dictCount >= FREE_MDX_DICT_LIMIT;
				const addSetting = new Setting(containerEl)
					.setName(t('settings.addLocalDict'));
				if (atLimit) {
					addSetting.setDesc(t('freeLimit.mdxLocked', { count: String(dictCount), limit: String(FREE_MDX_DICT_LIMIT) }));
				}
				addSetting.addButton(btn => {
					if (atLimit) setIcon(btn.buttonEl, 'lock');
					btn.setButtonText(atLimit ? '' : t('settings.selectMdx'))
						.onClick(() => {
							if (atLimit) {
								new UpgradeModal(this.app, t('freeLimit.mdxFeature')).open();
								return;
							}
							new MdxDictEditModal(this.app, this.plugin, language, null, () => renderDictList()).open();
						});
				});
			}
		} else {
			// 移动端:导入式本地词典(欧路模式),见 renderMobileDictSection
			this.renderMobileDictSection(containerEl, language);
		}

		// ── Flashcard Review Reminder ─────────────────────────
		new Setting(containerEl).setName("").setHeading();
		const reminderEnabledKey = `${language}FlashcardReminderEnabled` as keyof LMESettings;
		const reminderTimeKey = `${language}FlashcardReminderTime` as keyof LMESettings;

		this.addToggleWithStatus(
			containerEl,
			t('settings.flashcardReminder'),
			t('settings.flashcardReminderDesc'),
			() => this.plugin.settings[reminderEnabledKey] as boolean,
			async (v) => { (this.plugin.settings[reminderEnabledKey] as unknown) = v; await this.plugin.saveSettings(); },
		);

		new Setting(containerEl)
			.setName(t('settings.flashcardReminderTime'))
			.setDesc(t('settings.flashcardReminderTimeDesc'))
			.addText(text => {
				text.inputEl.type = 'time';
				text.setValue((this.plugin.settings[reminderTimeKey] as string) || '09:00');
				text.onChange(async (v) => {
					if (/^\d{2}:\d{2}$/.test(v.trim())) {
						(this.plugin.settings[reminderTimeKey] as unknown) = v.trim();
						await this.plugin.saveSettings();
					}
				});
				text.inputEl.style.width = '110px';
			});
	}


	// ── 移动端本地词典(导入式,欧路模式)──────────────────────
	// 桌面走「绝对路径 + fs」;移动端无文件系统权限,改为文件选择器导入到
	// 应用私有存储(OPFS)/内存降级,查词走 Worker。见 PLAN-mobile-mdx.md。
	// ── 移动端本地词典(导入式)——社区免费版:高级版功能,仅展示入口并弹付费引导 ──
	private renderMobileDictSection(containerEl: HTMLElement, _language: string): void {
		containerEl.createEl('p', {
			text: t('settings.mobileDictPremium'),
			cls: 'lme-settings-hint'
		});
		const importSetting = new Setting(containerEl)
			.setName(t('settings.addLocalDict'));
		importSetting.addButton(btn => {
			// 社区免费版:移动端词典导入为完整版功能,按钮禁用,不再逐次弹付费引导
			setIcon(btn.buttonEl, 'lock');
			btn.setButtonText(t('settings.mobileDictImport'))
				.setDisabled(true);
		});
	}


	private getAllFolders(): string[] {
		const folders = new Set<string>();
		this.app.vault.getAllFolders().forEach(f => {
			if (f.path !== '/') folders.add(f.path);
		});
		return Array.from(folders).sort();
	}

	private showFolderSuggest(inputEl: HTMLInputElement, folders: string[]): void {
		const modal = new class extends FuzzySuggestModal<string> {
			private parent: LMESettingTab;
			private input: HTMLInputElement;
			private allFolders: string[];

			constructor(parent: LMESettingTab, input: HTMLInputElement, allFolders: string[]) {
				super(parent.app);
				this.parent = parent;
				this.input = input;
				this.allFolders = allFolders;
				this.setPlaceholder(t('common.search'));
			}

			getItems(): string[] {
				return this.allFolders;
			}

			getItemText(item: string): string {
				return item;
			}

			onChooseItem(item: string): void {
				this.input.value = item;
				this.input.dispatchEvent(new Event('input'));
				this.parent.plugin.settings.videoDownloadFolder = item;
				this.parent.plugin.saveSettings();
			}
		}(this, inputEl, folders);
		modal.open();
	}

		// ── Custom AI Provider Modals ─────────────────────────

		private renderAiProvidersSection(containerEl: HTMLElement): void {
			const s = this.plugin.settings;
			const providers = s.aiProviders || [];

			// Models list. No separate "default" dropdown — the default is marked with ★
			// and managed right on the row (set-as-default button) so models aren't shown twice.
			// Every model is editable + deletable, including built-ins (deleted ones return to
			// the catalog and can be re-added).
			new Setting(containerEl).setName("").setHeading();
			if (providers.length === 0) {
				containerEl.createEl('p', { text: t('settings.providerListEmpty'), cls: 'lme-settings-hint' });
			}
			providers.forEach(p => {
				const isDefault = s.aiAnalysisProvider === p.id;
				const status = p.apiKey ? t('settings.configured') : t('settings.notConfigured');
				const row = new Setting(containerEl)
					.setName((isDefault ? '★ ' : '') + p.name)
					.setDesc(`${p.model || '—'}  ·  ${status}`)
					.addButton(btn => btn
						.setButtonText(t('common.edit'))
						.setIcon('pencil')
						.onClick(() => this.openEditProviderModal(p)))
					.addButton(btn => btn
						.setButtonText(t('common.delete'))
						.setIcon('trash-2')
						.setWarning()
						.onClick(async () => {
							s.aiProviders = providers.filter(x => x.id !== p.id);
							if (s.aiAnalysisProvider === p.id) {
								const next = (s.aiProviders || []).find(x => x.apiKey);
								s.aiAnalysisProvider = next ? next.id : '';
							}
							await this.plugin.saveSettings();
							this.display();
							new Notice(t('customProvider.customModelDeleted', { name: p.name }));
						}));
				if (!p.apiKey) row.settingEl.addClass('lme-provider-unconfigured');
				if (p.apiKey && !isDefault) {
					row.addButton(btn => btn
						.setButtonText(t('settings.setAsDefault'))
						.onClick(async () => {
							s.aiAnalysisProvider = p.id;
							await this.plugin.saveSettings();
							this.display();
						}));
				}
			});

			// Single Add Model button → unified picker (built-in presets + a "custom" entry)
			new Setting(containerEl)
				.addButton(btn => btn
					.setButtonText(t('settings.addModel'))
					.setIcon('plus')
					.setCta()
					.onClick(() => this.openAddModelModal()));
		}

		private openAddModelModal(): void {
			const existing = this.plugin.settings.aiProviders || [];
			const available = BUILTIN_PROVIDERS.filter(b => !existing.some(p => p.id === b.id));
			// Append a synthetic "custom" entry so one picker covers both preset + custom.
			const CUSTOM_MARKER: AIProviderConfig = {
				id: '__custom__', name: t('settings.addCustomModel'),
				model: '', baseUrl: '', apiKey: '', kind: 'openai', isBuiltIn: false
			};
			const items = [...available, CUSTOM_MARKER];
			const modal = new CatalogPickerModal(this.app, items, async (picked) => {
				if (picked.id === '__custom__') {
					this.openAddCustomProviderModal();
					return;
				}
				const entry: AIProviderConfig = { ...picked, apiKey: '' };
				const list = [...existing, entry];
				this.plugin.settings.aiProviders = list;
				// If the current default lacks a key, make the new one the default.
				const curRec = list.find(p => p.id === this.plugin.settings.aiAnalysisProvider);
				if (!curRec || !curRec.apiKey) {
					this.plugin.settings.aiAnalysisProvider = picked.id;
				}
				await this.plugin.saveSettings();
				this.display();
				this.openEditProviderModal(entry);
			});
			modal.open();
		}

		private openAddCustomProviderModal() {
			const modal = new CustomProviderModal(this.app, null, async (data) => {
				this.plugin.settings.aiProviders = [...(this.plugin.settings.aiProviders || []), data];
				this.plugin.settings.aiAnalysisProvider = data.id;
				await this.plugin.saveSettings();
				this.display();
				new Notice(t('customProvider.customModelAdded', { name: data.name }));
			});
			modal.open();
		}

		private openEditProviderModal(p: AIProviderConfig) {
			const modal = new CustomProviderModal(this.app, p, async (data) => {
				this.plugin.settings.aiProviders = (this.plugin.settings.aiProviders || []).map(x =>
					x.id === data.id ? data : x
				);
				await this.plugin.saveSettings();
				this.display();
				new Notice(t('customProvider.customModelUpdated', { name: data.name }));
			});
			modal.open();
		}

}




// ============================================================
// Custom AI Provider Modal
// ============================================================

class CustomProviderModal extends Modal {
	private data: AIProviderConfig;
	private onSubmit: (data: AIProviderConfig) => void;

	constructor(
		app: App,
		existing: AIProviderConfig | null,
		onSubmit: (data: AIProviderConfig) => void
	) {
		super(app);
		this.data = existing ? { ...existing } : {
			id: 'custom-' + Date.now(),
			name: '',
			baseUrl: '',
			model: '',
			apiKey: '',
			kind: 'openai',
			isBuiltIn: false
		};
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		const isEdit = this.data.isBuiltIn || !!this.data.name;
		contentEl.createEl('h2', { text: isEdit ? t('customProvider.editTitle') : t('customProvider.addTitle') });

		contentEl.createEl('p', {
			text: t('customProvider.desc'),
			cls: 'lme-settings-hint'
		});

		new Setting(contentEl)
			.setName(t('mdxEdit.displayName'))
			.setDesc(t('customProvider.displayNameDesc'))
			.addText(text => text
				.setPlaceholder(t('customProvider.displayNamePlaceholder'))
				.setValue(this.data.name)
				.onChange(v => { this.data.name = v.trim(); }));

		new Setting(contentEl)
			.setName('Base URL')
			.setDesc(t('customProvider.baseUrlDesc'))
			.addText(t => {
				t.setPlaceholder('https://api.openai.com/v1')
					.setValue(this.data.baseUrl)
					.onChange(v => { this.data.baseUrl = v.trim(); });
				t.inputEl.style.width = '100%';
				// Preset endpoints are fixed — lock to prevent breaking the provider.
				if (this.data.isBuiltIn) t.setDisabled(true);
			});

		new Setting(contentEl)
			.setName(t('customProvider.modelName'))
			.setDesc(t('customProvider.modelNameDesc'))
			.addText(t => t
				.setPlaceholder('gpt-4o')
				.setValue(this.data.model)
				.onChange(v => { this.data.model = v.trim(); }));

		new Setting(contentEl)
			.setName('API Key')
			.setDesc(t('customProvider.apiKeyDesc'))
			.addText(t => {
				t.setPlaceholder('sk-...')
					.setValue(this.data.apiKey)
					.onChange(v => { this.data.apiKey = v.trim(); });
				t.inputEl.type = 'password';
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText(t('common.save'))
				.setCta()
				.onClick(() => {
					// Built-in presets already carry name/baseUrl; custom must fill all.
					const needIdentity = !this.data.isBuiltIn;
					if ((needIdentity && (!this.data.name || !this.data.baseUrl)) || !this.data.model || !this.data.apiKey) {
						new Notice(t('customProvider.allFieldsRequired'));
						return;
					}
					this.onSubmit(this.data);
					this.close();
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// ============================================================
// Catalog Picker Modal (add a built-in preset not yet configured)
// ============================================================

class CatalogPickerModal extends FuzzySuggestModal<AIProviderConfig> {
	private readonly items: AIProviderConfig[];
	private readonly onPick: (p: AIProviderConfig) => void;

	constructor(app: App, items: AIProviderConfig[], onPick: (p: AIProviderConfig) => void) {
		super(app);
		this.items = items;
		this.onPick = onPick;
		this.setPlaceholder(t('settings.catalogTitle'));
	}

	getItems(): AIProviderConfig[] {
		return this.items;
	}

	getItemText(p: AIProviderConfig): string {
		return p.model ? `${p.name} · ${p.model}` : p.name;
	}

	onChooseItem(p: AIProviderConfig): void {
		this.onPick(p);
	}
}

// ============================================================
// Prompt View Modal (read-only)
// ============================================================

class PromptViewModal extends Modal {
    constructor(app: unknown, private prompt: PromptTemplate) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lme-prompt-modal');

        contentEl.createEl('h2', { text: this.prompt.isBuiltIn ? t('prompts.' + this.prompt.name) : this.prompt.name });

        const textarea = contentEl.createEl('textarea', {
            cls: 'lme-prompt-view-textarea'
        });
        textarea.value = this.prompt.content;
        textarea.readOnly = true;
        textarea.style.cssText = 'width:100%;min-height:400px;font-family:monospace;font-size:0.85em;padding:12px;border:1px solid var(--background-modifier-border);border-radius:6px;resize:vertical;background:var(--background-primary);color:var(--text-normal);';

        const closeBtn = contentEl.createEl('button', { text: t('common.close'), cls: 'mod-cta' });
        closeBtn.style.cssText = 'margin-top:12px;';
        closeBtn.onclick = () => this.close();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

// ============================================================

// ============================================================
// MDX Dictionary Edit Modal (file picker + auto-discovery)
// ============================================================

class MdxDictEditModal extends Modal {
    private nameInput: HTMLInputElement;
    private mdxPathInput: HTMLInputElement;
    private mddPathInput: HTMLInputElement;
    private cssPathInput: HTMLInputElement;

    constructor(
        app: App,
        private plugin: LanguageMadeEasyPlugin,
        private language: string,
        private existing: MdxDictionary | null,
        private onSave: () => void
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lme-prompt-modal');

        contentEl.createEl('h2', { text: this.existing ? t('mdxEdit.editTitle') : t('mdxEdit.addTitle') });

        new Setting(contentEl)
            .setName(t('mdxEdit.mdxFile'))
            .setDesc(t('mdxEdit.mdxFileDesc'))
            .addText(text => {
                this.mdxPathInput = text.inputEl;
                text.setPlaceholder(t('mdxEdit.browsePlaceholder'));
                text.setValue(this.existing?.mdxPath || '');
                text.inputEl.style.width = '100%';
                // Editable so users can paste a local file path directly. The folder
                // button is a convenience, not the only entry point — this matters
                // when the native picker silently fails on some Windows setups.
                text.inputEl.addEventListener('change', () => {
                    this.normalizePathInput(this.mdxPathInput);
                    this.autoDiscoverRelated(this.mdxPathInput.value);
                });
            })
            .addButton(btn => {
                btn.setIcon('folder-open').setTooltip(t('common.browse'));
                btn.onClick(() => this.pickFile('.mdx', this.mdxPathInput));
            });

        new Setting(contentEl)
            .setName(t('mdxEdit.mddFile'))
            .setDesc(t('mdxEdit.mddFileDesc'))
            .addText(text => {
                this.mddPathInput = text.inputEl;
                text.setPlaceholder(t('mdxEdit.autoDiscover'));
                text.setValue(this.existing?.mddPath || '');
                text.inputEl.style.width = '100%';
                text.inputEl.addEventListener('change', () => this.normalizePathInput(this.mddPathInput));
            })
            .addButton(btn => {
                btn.setIcon('folder-open').setTooltip(t('common.browse'));
                btn.onClick(() => this.pickFile('.mdd', this.mddPathInput));
            });

        new Setting(contentEl)
            .setName(t('mdxEdit.cssFile'))
            .setDesc(t('mdxEdit.cssFileDesc'))
            .addText(text => {
                this.cssPathInput = text.inputEl;
                text.setPlaceholder(t('mdxEdit.autoDiscover'));
                text.setValue(this.existing?.cssPath || '');
                text.inputEl.style.width = '100%';
                text.inputEl.addEventListener('change', () => this.normalizePathInput(this.cssPathInput));
            })
            .addButton(btn => {
                btn.setIcon('folder-open').setTooltip(t('common.browse'));
                btn.onClick(() => this.pickFile('.css', this.cssPathInput));
            });

        new Setting(contentEl)
            .setName(t('mdxEdit.displayName'))
            .setDesc(t('mdxEdit.displayNameDesc'))
            .addText(text => {
                this.nameInput = text.inputEl;
                text.setPlaceholder(t('mdxEdit.autoName'));
                text.setValue(this.existing?.name || '');
                text.inputEl.style.width = '100%';
            });

        const btnRow = contentEl.createDiv();
        btnRow.style.cssText = 'display:flex;gap:8px;margin-top:12px;';

        const saveBtn = btnRow.createEl('button', { text: t('common.save'), cls: 'mod-cta' });
        saveBtn.onclick = async () => {
            const mdxPath = this.mdxPathInput.value.trim();
            if (!mdxPath) {
                new Notice(t('mdxEdit.selectMdx'));
                return;
            }

            const name = this.nameInput.value.trim() || mdxPath.split('/').pop()?.replace(/\.mdx$/i, '') || t('mdxEdit.unnamedDict');
            const mddPath = this.mddPathInput.value.trim();
            const cssPath = this.cssPathInput.value.trim();

            if (!this.plugin.settings.localDictionaries) {
                this.plugin.settings.localDictionaries = {};
            }
            if (!this.plugin.settings.localDictionaries[this.language]) {
                this.plugin.settings.localDictionaries[this.language] = [];
            }

            const dicts = this.plugin.settings.localDictionaries[this.language];

            if (this.existing) {
                const idx = dicts.findIndex(d => d.id === this.existing!.id);
                if (idx !== -1) {
                    dicts[idx] = { ...this.existing, name, mdxPath, mddPath, cssPath };
                }
            } else {
                // 社区免费版:词典上限防御层(入口按钮已拦,这里兜底)
                if (dicts.length >= FREE_MDX_DICT_LIMIT) {
                    new Notice(t('mdxEdit.maxDicts'));
                    return;
                }
                dicts.push({
                    id: randomUUID(),
                    name,
                    mdxPath,
                    mddPath,
                    cssPath,
                });
            }

            await this.plugin.saveSettings();
            new Notice(t('mdxEdit.dictSaved'));
            this.onSave();
            this.close();
        };

        const cancelBtn = btnRow.createEl('button', { text: t('common.cancel') });
        cancelBtn.onclick = () => this.close();
    }

    private normalizePathInput(input: HTMLInputElement): void {
        // Unify Windows backslashes to forward slashes. Node fs and jsMdict accept
        // '/' on Windows, and downstream path splitting (autoDiscoverRelated /
        // MDXEngine) uses lastIndexOf('/'). Keeps stored paths consistent.
        const v = input.value.trim();
        if (!v) return;
        const normalized = v.replace(/\\/g, '/');
        if (normalized !== input.value) {
            input.value = normalized;
        }
    }

    private async pickFile(accept: string, targetInput: HTMLInputElement): Promise<void> {
        // Electron 30+ (Chromium 124+; Obsidian 1.11 ships Electron 39) often
        // silently ignores .click() on off-screen file inputs
        // (electron/electron#42013) — the "browse button does nothing" symptom.
        // So on desktop prefer the native dialog via @electron/remote (Obsidian
        // itself exposes it as window.electron.remote); the hidden-input path
        // stays only as fallback.
        const applyPath = (filePath: string) => {
            // Dialogs return backslash paths on Windows; normalize so
            // auto-discover and MDX path splitting work cross-platform.
            const normalized = filePath.replace(/\\/g, '/');
            targetInput.value = normalized;
            targetInput.dispatchEvent(new Event('input'));
            if (accept === '.mdx') {
                this.autoDiscoverRelated(normalized);
            }
        };

        if (Platform.isDesktop) {
            const ext = accept.replace(/^\./, '');
            const res = await showNativeOpenDialog([{ name: `*.${ext}`, extensions: [ext] }]);
            if (res.status === 'ok') {
                applyPath(res.filePath);
                return;
            }
            if (res.status === 'cancelled') return;
            // 'unavailable' — fall through to the file-input fallback.
        }

        this.pickFileViaInput(accept, applyPath);
    }

    private pickFileViaInput(accept: string, applyPath: (filePath: string) => void): void {
        const input = createEl('input');
        input.type = 'file';
        input.accept = accept;
        // Position off-screen instead of display:none. A display:none file input's
        // .click() is silently ignored on some Windows/Electron builds, so the
        // picker never opens (the "browse button no response" symptom).
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        input.style.top = '0';
        document.body.appendChild(input);

        const cleanup = () => input.remove();

        input.addEventListener('change', (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) {
                cleanup();
                return;
            }

            let filePath = '';

            // Electron 22+: webUtils.getPathForFile is the official API for getting
            // real file paths from File objects in the renderer process.
            if (Platform.isDesktop) {
                try {
                    const electron = (window as unknown).require('electron');
                    if (electron?.webUtils?.getPathForFile) {
                        filePath = electron.webUtils.getPathForFile(file);
                    }
                } catch { /* fs unavailable on this platform */ }
            }

            // Legacy fallback: file.path (removed in Electron 28+ but kept for older versions)
            if (!filePath) {
                filePath = (file as unknown).path || (file as unknown).filepath || '';
            }

            cleanup();

            if (!filePath) {
                new Notice(t('mdxEdit.noPathMobile'));
                return;
            }

            applyPath(filePath);
        });

        // Clean up if the user cancels the picker.
        input.addEventListener('cancel', cleanup);

        input.click();
    }

    private autoDiscoverRelated(mdxPath: string): void {
        const lastSlash = mdxPath.lastIndexOf('/');
        const dir = mdxPath.substring(0, lastSlash);
        const filename = mdxPath.substring(lastSlash + 1);
        const stem = filename.replace(/\.mdx$/i, '');

        if (!this.nameInput.value.trim()) {
            this.nameInput.value = stem;
        }

        if (!this.mddPathInput.value.trim()) {
            try {
                const fs = (window as unknown).require('fs');
                const mddCandidate = `${dir}/${stem}.mdd`;
                if (fs.existsSync(mddCandidate)) {
                    this.mddPathInput.value = mddCandidate;
                }
            } catch { /* fs unavailable on this platform */ }
        }

        if (!this.cssPathInput.value.trim()) {
            try {
                const fs = (window as unknown).require('fs');
                const cssCandidate = `${dir}/${stem}.css`;
                if (fs.existsSync(cssCandidate)) {
                    this.cssPathInput.value = cssCandidate;
                }
            } catch { /* fs unavailable on this platform */ }
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
