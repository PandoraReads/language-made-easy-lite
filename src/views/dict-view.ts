// @ts-nocheck
// ============================================================
// English Made Easy - Dictionary Sidebar View
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// ============================================================

import { ItemView, WorkspaceLeaf, Notice, setIcon, MarkdownRenderer } from 'obsidian';
import { lookupMulti, extractSentence, fetchPhonetic, fetchCleanDefinition, playAudio } from '../services/UnifiedDictionaryService';
import { db } from '../core/Database';
import { assertFlashcardQuota } from '../core/free-quota';
import { t } from '../i18n';
import type LanguageMadeEasyPlugin from '../main-unified-full';
import type { DictResult } from '../models';
import type { FlashcardView } from './flashcard-view';
import { randomUUID } from '../mocks/crypto';

export const DICT_VIEW_TYPE = 'lme-dict-view';

// ShadowRoot.getSelection() is an experimental API not yet in TS lib.dom
type ShadowRootWithGetSelection = ShadowRoot & { getSelection?: () => Selection | null };

// PandoraReads — 查词侧栏
export class DictView extends ItemView {
    private plugin: LanguageMadeEasyPlugin;
    private lastResult: DictResult | null = null;
    private lastContext = '';
    private lastSource = '';
    private activeLookupId = 0;

    constructor(leaf: WorkspaceLeaf, plugin: LanguageMadeEasyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return DICT_VIEW_TYPE; }
    getDisplayText(): string { return t('dict.viewTitle'); }
    getIcon(): string { return 'book-open'; }

    async onOpen() {
        this.renderInitial();
    }

    async onClose() {
        // View closed
    }

    // Public render method for language switching
    async render() {
        this.renderInitial();
    }

    private renderInitial() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lme-dict-view');
        contentEl.removeClass('lme-dict-mode-results');
        contentEl.addClass('lme-dict-mode-welcome');

        const container = contentEl.createDiv('lme-dict-empty');

        // 0. Hero: Morphing Orb + Typewriter
        const hero = container.createDiv('lme-dict-hero');
        hero.createDiv('lme-dict-hero-orb');
        const typewriter = hero.createDiv({ cls: 'lme-dict-typewriter' });
        this.startTypewriter(typewriter);

        // 1. Title - show current language
        const langNames: Record<string, string> = {
            english: 'Your personal English companion',
            german: 'Ihr deutscher Lernbegleiter',
            french: 'Votre compagnon français',
            spanish: 'Tu compañero de español',
            korean: '당신의 한국어 학습 동반자',
            russian: 'Ваш помощник в изучении русского'
        };
        const currentLang = this.plugin.settings.activeLanguage || 'english';
        container.createDiv({
            cls: 'lme-dict-empty-title',
            text: langNames[currentLang] || langNames.english
        });

        // 2. Pill-shaped Search Box
        this.renderSearchBox(container, true);

        // 3. Muted Footer Desc
        container.createDiv({
            cls: 'lme-dict-empty-desc',
            text: "powered by Pandora's Digital Garden"
        });
    }

    private startTypewriter(el: HTMLElement) {
        const phrasesByLang: Record<string, string[]> = {
            english: [
                'Search any word...',
                'Learn naturally.',
                'Master English.',
                'Explore the world!'
            ],
            german: [
                'Suche ein Wort...',
                'Lerne natürlich.',
                'Meistere Deutsch.',
                'Entdecke die Welt!'
            ],
            french: [
                'Cherchez un mot...',
                'Apprenez naturellement.',
                'Maîtrisez le français.',
                'Explorez le monde!'
            ],
            spanish: [
                'Busca una palabra...',
                'Aprende naturalmente.',
                'Domina el español.',
                'Explora el mundo!'
            ],
            korean: [
                '단어를 검색하세요...',
                '자연스럽게 배우세요.',
                '한국어를 마스터하세요.',
                '세계를 탐험하세요!'
            ],
            russian: [
                'Найдите слово...',
                'Учитесь естественно.',
                'Освойте русский.',
                'Откройте мир!'
            ]
        };
        const currentLang = this.plugin.settings.activeLanguage || 'english';
        const phrases = phrasesByLang[currentLang] || phrasesByLang.english;
        let phraseIndex = 0;
        let charIndex = 0;
        let deleting = false;

        const tick = () => {
            // Stop if element was removed from DOM
            if (!el.isConnected) return;

            const phrase = phrases[phraseIndex];
            if (!deleting) {
                el.textContent = phrase.slice(0, charIndex + 1);
                charIndex++;
                if (charIndex === phrase.length) {
                    deleting = true;
                    window.setTimeout(tick, 1800);
                    return;
                }
                window.setTimeout(tick, 75);
            } else {
                el.textContent = phrase.slice(0, charIndex - 1);
                charIndex--;
                if (charIndex === 0) {
                    deleting = false;
                    phraseIndex = (phraseIndex + 1) % phrases.length;
                    window.setTimeout(tick, 350);
                    return;
                }
                window.setTimeout(tick, 35);
            }
        };
        window.setTimeout(tick, 600);
    }

    private renderSearchBox(parent: HTMLElement, isInitial = false) {
        const container = parent.createDiv({
            cls: `lme-dict-search-container ${isInitial ? 'initial' : 'sticky-top'}`
        });

        const wrapper = container.createDiv('lme-dict-search-wrapper');

        // Search icon for both states now
        const iconContainer = wrapper.createDiv('lme-dict-search-icon');
        setIcon(iconContainer, 'search');

        const input = wrapper.createEl('input', {
            cls: 'lme-dict-search-input',
            attr: {
                type: 'text',
                placeholder: isInitial ? t('dict.searchPlaceholder') : t('dict.searchPlaceholderFull')
            }
        });

        const performSearch = () => {
            const word = input.value.trim();
            if (word) {
                void this.lookup(word, '', '', 0);
            }
        };

        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        };

        iconContainer.onclick = performSearch;
    }

    private renderEmpty() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lme-dict-view');
        contentEl.removeClass('lme-dict-mode-welcome');
        contentEl.addClass('lme-dict-mode-results');

        // Top Search Box in Results/Empty Screen
        this.renderSearchBox(contentEl, false);

        const container = contentEl.createDiv('lme-dict-no-results');
        const inner = container.createDiv('lme-no-results-inner');

        const iconContainer = inner.createDiv('lme-no-results-icon');
        setIcon(iconContainer, 'search-x');

        inner.createDiv({ cls: 'lme-no-results-title', text: t('dict.noResult') });
        inner.createDiv({ cls: 'lme-no-results-desc', text: t('dict.noResultDesc') });

        // Context Snippet even on empty results
        if (this.lastContext) {
            const ctx = contentEl.createDiv('lme-dict-context');
            ctx.createDiv({ cls: 'lme-dict-context-label', text: t('dict.noteContext') });
            const contextTextEl = ctx.createDiv('lme-dict-context-text');
            void MarkdownRenderer.render(this.app, this.lastContext, contextTextEl, this.lastSource || '', this);
        }

        const btnContainer = inner.createDiv('lme-no-results-actions');
        const openNoteBtn = btnContainer.createEl('button', {
            cls: 'lme-btn lme-btn-ghost'
        });
        setIcon(openNoteBtn, 'book-open');
        openNoteBtn.createSpan({ text: ' ' + t('dict.manageVocab') });
        openNoteBtn.onclick = () => this.openVocabNote();
    }

    public async lookup(word: string, lineText: string, sourcePath: string, lineIndex: number) {
        const lookupId = ++this.activeLookupId;

        this.lastResult = null;
        this.lastContext = '';
        this.lastSource = '';

        console.debug(`[EME] DictView.lookup("${word}") | source: ${sourcePath} | lineText len: ${lineText?.length}`);

        if (lineText) {
            this.lastContext = extractSentence(lineText, word);
            console.debug(`[EME] DictView.lookup -> extracted sentence: "${this.lastContext.slice(0, 50)}..."`);
        }
        if (sourcePath) {
            this.lastSource = sourcePath;
        }

        console.debug(`[EME] DictView.lookup("${word}") | Context: ${this.lastContext ? 'Captured' : 'None'} | Source: ${this.lastSource || 'None'} `);

        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lme-dict-view');
        contentEl.removeClass('lme-dict-mode-welcome');
        contentEl.addClass('lme-dict-mode-results');

        // Render Search Box even during loading
        this.renderSearchBox(contentEl, false);

        const spinner = contentEl.createDiv('lme-spinner');
        const resultsContainer = contentEl.createDiv('lme-dict-results-container');

        try {
            const currentLanguage = this.plugin.settings.activeLanguage || 'english';

            // Streaming: each result renders immediately as it arrives
            const allResults = await lookupMulti(
                word,
                currentLanguage,
                this.plugin.settings,
                (result) => {
                    if (lookupId !== this.activeLookupId) return;

                    // First result arrives -> remove spinner
                    if (spinner.parentNode) spinner.remove();

                    // Store first result for legacy compatibility
                    if (!this.lastResult) this.lastResult = result;

                    // Render this result card immediately
                    void this.renderSingleResult(resultsContainer, result);
                }
            );

            if (lookupId !== this.activeLookupId) return;

            // After all tasks complete, remove spinner if still visible and render footer
            if (spinner.parentNode) spinner.remove();

            if (allResults.length === 0) {
                this.renderEmpty();
                return;
            }

            // Context Snippet (Global)
            if (this.lastContext) {
                const ctx = contentEl.createDiv('lme-dict-context');
                ctx.createDiv({ cls: 'lme-dict-context-label', text: t('dict.noteContext') });
                const contextTextEl = ctx.createDiv('lme-dict-context-text');
                void MarkdownRenderer.render(this.app, this.lastContext, contextTextEl, this.lastSource || '', this);
            }

            // Footer Actions
            const footerArea = contentEl.createDiv('lme-dict-footer-area');
            const openNoteBtn = footerArea.createEl('button', {
                cls: 'lme-btn-subtle lme-open-note-btn-footer',
                attr: { 'aria-label': t('dict.openVocab') }
            });
            setIcon(openNoteBtn, 'folder-open');
            openNoteBtn.createSpan({ text: ' ' + t('dict.viewVocab') });
            openNoteBtn.onclick = () => this.openVocabNote();
        } catch (e) {
            if (lookupId !== this.activeLookupId) return;
            contentEl.empty();
            this.renderSearchBox(contentEl, false);
            contentEl.createDiv({ cls: 'lme-error', text: t('dict.lookupFailed', { error: e instanceof Error ? e.message : String(e) }) });
        }
    }

    private async renderResults(results: DictResult[], language: string) {
        const { contentEl } = this;
        contentEl.empty();

        if (results.length === 0) {
            this.renderEmpty();
            return;
        }

        // Top Search Box
        this.renderSearchBox(contentEl, false);

        const container = contentEl.createDiv('lme-dict-results-container');

        for (const res of results) {
            await this.renderSingleResult(container, res);
        }

        // Context Snippet (Global)
        if (this.lastContext) {
            const ctx = contentEl.createDiv('lme-dict-context');
            ctx.createDiv({ cls: 'lme-dict-context-label', text: t('dict.noteContext') });
            const contextTextEl = ctx.createDiv('lme-dict-context-text');
            void MarkdownRenderer.render(this.app, this.lastContext, contextTextEl, this.lastSource || '', this);
        }

        // Footer Actions
        const footerArea = contentEl.createDiv('lme-dict-footer-area');
        const openNoteBtn = footerArea.createEl('button', {
            cls: 'lme-btn-subtle lme-open-note-btn-footer',
            attr: { 'aria-label': t('dict.openVocab') }
        });
        setIcon(openNoteBtn, 'folder-open');
        openNoteBtn.createSpan({ text: ' ' + t('dict.viewVocab') });
        openNoteBtn.onclick = () => this.openVocabNote();
    }

    private async renderSingleResult(parent: HTMLElement, res: DictResult) {
        const card = parent.createDiv('lme-dict-card');

        // Get current language at function scope level
        const currentLanguage = this.plugin.settings.activeLanguage || 'english';

        // Dictionary Source Badge - Clear source labels without emoji
        let sourceLabel = t('dict.unknownSource');

        if (res.srcMdx) {
            sourceLabel = res.dictName || t('dict.localMdx');
        } else if (res.srcJisho) {
            sourceLabel = t('dict.jisho');
        } else if (res.srcYoudao) {
            sourceLabel = t('dict.youdao');
        } else if (res.srcMyMemory) {
            sourceLabel = t('dict.mymemory');
        } else if (res.srcGoogle) {
            sourceLabel = t('dict.google');
        } else {
            // 默认网络词典（兼容旧数据）
            if (currentLanguage === 'english') {
                sourceLabel = t('dict.youdao');
            } else {
                sourceLabel = t('dict.google');
            }
        }

        card.createDiv({ cls: 'lme-dict-source-badge', text: sourceLabel });

        const header = card.createDiv('lme-dict-header-simple');
        header.createEl('h2', { cls: 'lme-dict-word', text: res.word });

        // Pronunciation Button
        const audioBtn = header.createEl('button', { cls: 'lme-icon-btn lme-audio-btn', attr: { 'aria-label': t('dict.playAudio') } });
        setIcon(audioBtn, 'volume-2');
        audioBtn.onclick = () => {
            console.debug('[DictView] Audio button clicked');
            void playAudio(res.word, currentLanguage);
        };

        const meta = card.createDiv('lme-dict-meta');
        if (res.phonetic) meta.createSpan({ cls: 'lme-dict-phonetic', text: `[${res.phonetic}]` });
        if (res.partOfSpeech) meta.createSpan({ cls: 'lme-dict-pos', text: res.partOfSpeech });

        const defContainer = card.createDiv('lme-dict-definition-container');

        if (res.srcMdx) {
            defContainer.addClass('lme-mdx-shadow-container');
            const shadowHost = defContainer.createDiv('lme-mdx-shadow-host');
            const shadowRoot = shadowHost.attachShadow({ mode: 'open' });

            // Shadow-root CSS via adoptedStyleSheets (styles.css cannot cross
            // the shadow boundary, and constructing <style> elements is
            // disallowed by the community plugin guidelines).
            const sheets: CSSStyleSheet[] = [];
            const adoptSheet = (css: string) => {
                const sheet = new CSSStyleSheet();
                sheet.replaceSync(css);
                sheets.push(sheet);
            };
            if (res.style) adoptSheet(res.style);

            // OALD-style collapsible boxes (.collapse .unbox: Extra Examples,
            // Word Origin, Collocations, ...) depend on the dictionary's own
            // jQuery script (oaldpe.js), which innerHTML never executes. Restore
            // them: CSS shows the hidden sibling when .unbox has .is-active, and
            // the click handler below toggles that class on .box_title clicks.
            adoptSheet([
                '.collapse .unbox .box_title { cursor: pointer; }',
                '.collapse .unbox.is-active > .box_title + * { display: block; }',
                '.idioms > .idioms_heading, .phrasal_verb_links > .unbox { cursor: pointer; }',
                '.idioms.expanded > .idioms_heading ~ * { display: block; }',
                '.phrasal_verb_links.expanded ul.pvrefs { display: block; }'
            ].join('\n'));

            adoptSheet(this.getMdxThemeStyle());
            shadowRoot.adoptedStyleSheets = sheets;

            const contentDiv = createDiv();
            contentDiv.className = 'lme-mdx-content';
            // res.definition is the entry HTML from the user's own local .mdx
            // dictionary file (desktop-only feature), rendered inside an
            // isolated shadow root. It is trusted local content by design.
            // eslint-disable-next-line no-unsanitized/property -- trusted local content: entry HTML from the user's own .mdx dictionary file, rendered inside an isolated shadow root
            contentDiv.innerHTML = res.definition;
            contentDiv.setCssStyles({ userSelect: 'text' });
            shadowRoot.appendChild(contentDiv);

            await this.processMdxResources(contentDiv, currentLanguage, res.dictId);
            this.applyMdxDarkThemeRuntimeFixes(contentDiv);
            window.requestAnimationFrame(() => this.applyMdxDarkThemeRuntimeFixes(contentDiv));

            // Double-click word lookup in MDX content
            contentDiv.ondblclick = (e) => {
                const sel = (shadowRoot as ShadowRootWithGetSelection).getSelection?.() || window.getSelection();
                if (sel && sel.toString().trim()) {
                    const word = sel.toString().trim();
                    if (/^[a-zA-ZÀ-ÿāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜßäöüÄÖÜ가-힣а-яА-ЯёЁ\s'-]+$/.test(word)) {
                        void this.lookup(word.replace(/['.!,;:?]$/g, ''), '', '', 0);
                    }
                }
            };

            contentDiv.onclick = (e) => {
                const target = e.target as HTMLElement;

                // POS navbar tabs (noun / verb / All): toggle which .oald entry
                // container is visible. CSS (.oald{display:none}/.oald.visible) is
                // already in the dictionary stylesheet; only the click switch is missing.
                const navSpan = target.closest<HTMLElement>('.oaldpe-nav > span');
                if (navSpan && navSpan.parentElement) {
                    e.preventDefault();
                    e.stopPropagation();
                    const spans = Array.from(navSpan.parentElement.children) as HTMLElement[];
                    const idx = spans.indexOf(navSpan);
                    const isAll = idx === spans.length - 1;
                    spans.forEach((s, i) => s.classList.toggle('active', i === idx));
                    contentDiv.querySelectorAll('.oald.oald-entry-root').forEach((c, i) => {
                        c.classList.toggle('visible', isAll || i === idx);
                    });
                    return;
                }

                // Toggle OALD collapsible boxes (Extra Examples / Word Origin / etc.).
                const boxTitle = target.closest<HTMLElement>('.collapse .unbox .box_title');
                if (boxTitle) {
                    e.preventDefault();
                    e.stopPropagation();
                    const unbox = boxTitle.closest('.unbox');
                    if (unbox) unbox.classList.toggle('is-active');
                    return;
                }

                // Toggle OALD phrase sections (Idioms / Phrasal Verbs).
                const phraseHeading = target.closest<HTMLElement>('.idioms > .idioms_heading, .phrasal_verb_links > .unbox');
                if (phraseHeading && !target.closest('.jumplink_back')) {
                    e.preventDefault();
                    e.stopPropagation();
                    const section = phraseHeading.parentElement;
                    if (section) section.classList.toggle('expanded');
                    return;
                }

                const link = target.closest('a');
                if (link) {
                    const href = link.getAttribute('href');
                    if (href) {
                        if (href.startsWith('#')) {
                            // In-page jumplink: shadow DOM blocks native hash nav,
                            // so expand the target phrase section + scroll instead.
                            e.preventDefault();
                            const targetId = href.slice(1);
                            if (targetId) {
                                const dest = shadowRoot.getElementById(targetId)
                                    || contentDiv.querySelector<HTMLElement>(`[id="${CSS.escape(targetId)}"]`);
                                if (dest) {
                                    dest.classList.add('expanded');
                                    dest.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }
                            }
                        } else if (href.startsWith('entry://')) {
                            e.preventDefault();
                            const word = decodeURIComponent(href.replace('entry://', ''));
                            void this.lookup(word, '', '', 0);
                        } else if (href.startsWith('sound://')) {
                            e.preventDefault();
                            const soundPath = href.replace('sound://', '');
                            console.debug('[DictView] MDX sound link clicked:', soundPath);
                            void playAudio(soundPath, currentLanguage, true, res.dictId);
                        }
                    }
                }
            };
        } else if (res.explains && res.explains.length > 0) {
            res.explains.forEach(exp => {
                const p = defContainer.createEl('p', { text: exp });
                this.addDoubleClickLookup(p);
            });
        } else {
            const p = defContainer.createEl('p', { text: res.definition });
            this.addDoubleClickLookup(p);
        }

        // ── Bilingual Example Sentences ──
        if (res.examples && res.examples.length > 0) {
            const exSection = card.createDiv('lme-dict-examples');
            exSection.createDiv({ cls: 'lme-dict-section-title', text: t('dict.examples') });
            res.examples.forEach(({ en, zh }) => {
                const pair = exSection.createDiv('lme-dict-example-pair');
                const enEl = pair.createEl('p', { cls: 'lme-dict-example-en', text: en });
                pair.createEl('p', { cls: 'lme-dict-example-zh', text: zh });
                this.addDoubleClickLookup(enEl);
            });
        }

        // ── Web Phrases / Collocations ──
        if (res.webPhrases && res.webPhrases.length > 0) {
            const webSection = card.createDiv('lme-dict-web-phrases');
            webSection.createDiv({ cls: 'lme-dict-section-title', text: t('dict.phrases') });
            res.webPhrases.forEach(phrase => {
                const p = webSection.createEl('p', { cls: 'lme-dict-web-phrase', text: phrase });
                this.addDoubleClickLookup(p);
            });
        }

        // Action Button
        const actionArea = card.createDiv('lme-dict-action-area');
        const addBtn = actionArea.createEl('button', {
            cls: 'lme-btn lme-add-btn',
            attr: { 'aria-label': t('dict.addToVocab') }
        });
        setIcon(addBtn, 'plus-circle');
        addBtn.createSpan({ text: ' ' + t('dict.addToVocab') });
        addBtn.onclick = () => this.addToVocab(res);
    }

    private addDoubleClickLookup(el: HTMLElement): void {
        el.ondblclick = () => {
            const sel = window.getSelection();
            if (sel && sel.toString().trim()) {
                const word = sel.toString().trim().replace(/['.!,;:?]$/g, '');
                if (word && /^[a-zA-ZÀ-ÿāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜßäöüÄÖÜ가-힣а-яА-ЯёЁ\s'-]+$/.test(word)) {
                    void this.lookup(word, '', '', 0);
                }
            }
        };
    }

    private getMdxThemeStyle(): string {
        return `
            :host {
                color-scheme: light dark;
                --lme-mdx-text: var(--lme-text-primary, var(--text-normal, #2c2416));
                --lme-mdx-muted: var(--lme-text-muted, var(--text-muted, #6b5d4e));
                --lme-mdx-border: var(--lme-glass-border, var(--background-modifier-border, rgba(0, 0, 0, 0.12)));
                --lme-mdx-surface-soft: rgba(var(--lme-accent-rgb, 139, 58, 58), 0.06);
                --lme-mdx-surface-panel: rgba(var(--lme-accent-rgb, 139, 58, 58), 0.08);
                --lme-mdx-accent: var(--lme-accent, var(--text-accent, #8b3a3a));
            }

            .lme-mdx-content {
                color: var(--lme-mdx-text);
                background: transparent;
                line-height: 1.55;
            }

            .lme-mdx-content :where(a) {
                color: var(--lme-mdx-accent);
            }

            .lme-mdx-content :where(table, th, td) {
                border-color: var(--lme-mdx-border);
            }

            :host-context(.theme-dark) {
                --lme-mdx-text: var(--lme-dark-text, var(--lme-text-primary, var(--text-normal, #e8e2d8)));
                --lme-mdx-muted: var(--lme-dark-text-muted, var(--lme-text-muted, var(--text-muted, #a89f94)));
                --lme-mdx-border: var(--lme-dark-border, var(--lme-glass-border, rgba(255, 255, 255, 0.12)));
                --lme-mdx-surface-soft: rgba(var(--lme-accent-rgb, 216, 197, 107), 0.10);
                --lme-mdx-surface-panel: rgba(var(--lme-accent-rgb, 216, 197, 107), 0.13);
                --lme-mdx-accent: var(--lme-dark-accent, var(--lme-accent, var(--text-accent, #d8c56b)));
            }

            :host-context(.theme-dark) .lme-mdx-content,
            :host-context(.theme-dark) .lme-mdx-content :where(
                div, section, article, aside, main, header, footer,
                p, span, b, strong, i, em, u, small, sup, sub,
                h1, h2, h3, h4, h5, h6,
                ul, ol, li, dl, dt, dd,
                table, tbody, thead, tfoot, tr, td, th,
                blockquote, pre, code,
                label, summary, details
            ) {
                color: var(--lme-mdx-text) !important;
                border-color: var(--lme-mdx-border) !important;
                text-shadow: none !important;
            }

            :host-context(.theme-dark) .lme-mdx-content :where(
                .phonetic, .pron, .pos, .label, .grammar, .infobox,
                .unbox, .box, .collapse, .examples, .example, .ex,
                .sense, .def, .translation, .entry, .oald, .idioms,
                .phrasal_verb_links
            ) {
                color: var(--lme-mdx-text) !important;
                background-color: transparent !important;
            }

            :host-context(.theme-dark) .lme-mdx-content :where(
                [class*="webster"], [class*="merriam"], [class*="mw-"], [class*="m-w"],
                [class*="collins"], [class*="cobuild"], [class*="COBUILD"],
                [class*="entry"], [class*="Entry"], [class*="dictionary-entry"],
                [class*="headword"], [class*="Headword"], [class*="head-word"],
                [class*="header"], [class*="Header"], [class*="heading"], [class*="Heading"],
                [class*="title"], [class*="Title"], [class*="top"], [class*="Top"],
                [class*="card"], [class*="Card"], [class*="panel"], [class*="Panel"],
                [class*="block"], [class*="Block"], [class*="wrap"], [class*="Wrap"],
                [class*="content"], [class*="Content"], [class*="body"], [class*="Body"],
                [class*="main"], [class*="Main"], [class*="container"], [class*="Container"],
                .prons, .prs, .uro, .vg, .sb, .sense-block, .def-block, .cobuild-block
            ):not(img):not(svg):not(path):not(audio):not(video) {
                background-color: transparent !important;
                background-image: none !important;
                color: var(--lme-mdx-text) !important;
                border-color: var(--lme-mdx-border) !important;
                box-shadow: none !important;
            }

            :host-context(.theme-dark) .lme-mdx-content > :where(
                div, section, article, main, header
            ):first-child,
            :host-context(.theme-dark) .lme-mdx-content > :where(
                div, section, article, main, header
            ):first-child :where(div, section, header, span, p):not(img):not(svg):not(path) {
                background-color: transparent !important;
                background-image: none !important;
                color: var(--lme-mdx-text) !important;
                border-color: var(--lme-mdx-border) !important;
            }

            :host-context(.theme-dark) .lme-mdx-content :where(
                .box_title, .heading, .idioms_heading, th,
                .title, .headword, .hwd, .keyword
            ) {
                color: var(--lme-mdx-accent) !important;
            }

            :host-context(.theme-dark) .lme-mdx-content :where(a, a:visited, a span, a b, a strong) {
                color: var(--lme-mdx-accent) !important;
            }

            :host-context(.theme-dark) .lme-mdx-content :where(
                table, pre, code, blockquote,
                .box, .unbox, .collapse, .infobox,
                .note, .usage, .examples, .example
            ) {
                background-color: var(--lme-mdx-surface-soft) !important;
            }

            :host-context(.theme-dark) .lme-mdx-content :where(
                .note, .usage, .examples, .example, .ex,
                .synonym, .thesaurus, .related, .phrase,
                .collocation, .collocations, .idioms, .phrasal_verb_links
            ) {
                background-color: var(--lme-mdx-surface-panel) !important;
            }

            :host-context(.theme-dark) .lme-mdx-content :where(
                [style*="color"], [style*="Color"], [style*="COLOR"]
            ):not(img):not(svg):not(path):not(audio):not(video) {
                color: var(--lme-mdx-text) !important;
            }

            :host-context(.theme-dark) .lme-mdx-content :where(
                [style*="background"], [style*="Background"], [style*="BACKGROUND"]
            ):not(img):not(svg):not(path):not(audio):not(video) {
                background-color: transparent !important;
                background-image: none !important;
            }

            :host-context(.theme-dark) .lme-mdx-content img,
            :host-context(.theme-dark) .lme-mdx-content svg {
                filter: none;
            }

            :host-context(.theme-dark) .lme-mdx-content *::before,
            :host-context(.theme-dark) .lme-mdx-content *::after {
                background-color: transparent !important;
                background-image: none !important;
                color: inherit !important;
                box-shadow: none !important;
            }
        `;
    }

    private applyMdxDarkThemeRuntimeFixes(container: HTMLElement): void {
        if (!document.body?.classList.contains('theme-dark')) return;

        const elements = [container, ...Array.from(container.querySelectorAll('*'))] as HTMLElement[];

        for (const el of elements) {
            if (!(el.instanceOf(HTMLElement))) continue;
            if (this.isMdxMediaElement(el)) continue;

            const style = window.getComputedStyle(el);

            if (this.isLightCssColor(style.backgroundColor) || style.backgroundImage !== 'none') {
                el.setCssStyles({
                    background: 'transparent !important',
                    backgroundColor: 'transparent !important',
                    backgroundImage: 'none !important',
                    boxShadow: 'none !important'
                });
            }

            if (this.isDarkCssColor(style.color)) {
                el.setCssStyles({
                    color: 'var(--lme-mdx-text) !important',
                    textShadow: 'none !important'
                });
            }

            this.normalizeLightBorderColor(el, style);
        }
    }

    private isMdxMediaElement(el: HTMLElement): boolean {
        return ['IMG', 'SVG', 'PATH', 'AUDIO', 'VIDEO', 'SOURCE', 'CANVAS'].includes(el.tagName);
    }

    private normalizeLightBorderColor(el: HTMLElement, style: CSSStyleDeclaration): void {
        const borderProps = [
            ['border-top-color', style.borderTopColor],
            ['border-right-color', style.borderRightColor],
            ['border-bottom-color', style.borderBottomColor],
            ['border-left-color', style.borderLeftColor]
        ];

        for (const [prop, value] of borderProps) {
            if (this.isLightCssColor(value)) {
                el.setCssStyles({ [prop]: 'var(--lme-mdx-border) !important' });
            }
        }
    }

    private isLightCssColor(color: string): boolean {
        const parsed = this.parseCssColor(color);
        if (!parsed || parsed.a < 0.05) return false;
        return this.relativeLuminance(parsed.r, parsed.g, parsed.b) > 0.72;
    }

    private isDarkCssColor(color: string): boolean {
        const parsed = this.parseCssColor(color);
        if (!parsed || parsed.a < 0.05) return false;
        return this.relativeLuminance(parsed.r, parsed.g, parsed.b) < 0.38;
    }

    private parseCssColor(color: string): { r: number; g: number; b: number; a: number } | null {
        if (!color || color === 'transparent') return null;

        const rgba = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
        if (rgba) {
            return {
                r: Number(rgba[1]),
                g: Number(rgba[2]),
                b: Number(rgba[3]),
                a: rgba[4] === undefined ? 1 : Number(rgba[4])
            };
        }

        const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (hex) {
            const raw = hex[1].length === 3
                ? hex[1].split('').map((ch) => ch + ch).join('')
                : hex[1];
            return {
                r: parseInt(raw.slice(0, 2), 16),
                g: parseInt(raw.slice(2, 4), 16),
                b: parseInt(raw.slice(4, 6), 16),
                a: 1
            };
        }

        return null;
    }

    private relativeLuminance(r: number, g: number, b: number): number {
        const normalize = (channel: number) => {
            const value = Math.max(0, Math.min(255, channel)) / 255;
            return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
        };

        return 0.2126 * normalize(r) + 0.7152 * normalize(g) + 0.0722 * normalize(b);
    }

    private async addToVocab(res: DictResult) {
        try {
            const currentLanguage = this.plugin.settings.activeLanguage || 'english';
            const exists = await db.getVocabularyByWord(res.word.toLowerCase(), currentLanguage);
            if (exists) {
                new Notice(t('dict.alreadyInVocab'));
                return;
            }

            // 社区免费版:闪卡总配额校验(触顶弹引导)
            if (!(await assertFlashcardQuota(this.app))) return;

            // Get clean definition: online results are already concise text,
            // MDX results need a separate online fetch to avoid HTML bloat
            let cleanDefinition = '';
            if (res.explains && res.explains.length > 0) {
                cleanDefinition = res.explains.join('; ');
            } else if (res.srcMdx || (res.definition && res.definition.indexOf('<') !== -1)) {
                // MDX source: fetch concise online definition instead of bloated HTML
                const onlineDef = await fetchCleanDefinition(res.word, currentLanguage);
                cleanDefinition = onlineDef || res.definition.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            } else {
                cleanDefinition = res.definition || '';
            }

            // Fetch phonetic: English from Youdao, Korean from Google, others empty
            let phonetic = res.phonetic || '';
            if (!phonetic) {
                phonetic = await fetchPhonetic(res.word, currentLanguage);
            }

            const entry = {
                id: randomUUID(),
                word: res.word.toLowerCase(),
                phonetic,
                definition: cleanDefinition,
                partOfSpeech: res.partOfSpeech || '',
                contextSnippet: this.lastContext || '',
                sourceNotePath: this.lastSource || '',
                addedTime: Date.now(),
                fsrsData: {
                    due: Date.now(),
                    stability: 0,
                    difficulty: 0,
                    elapsed_days: 0,
                    scheduled_days: 0,
                    reps: 0,
                    lapses: 0,
                    state: 0
                }
            };

            await db.addVocabulary(entry, currentLanguage);

            // ── Sync to Markdown Vault ──
            // Get language-specific vocab notebook settings
            const vocabFolderKey = `${currentLanguage}VocabNoteFolder` as keyof typeof this.plugin.settings;
            const vocabFileNameKey = `${currentLanguage}VocabNoteFileName` as keyof typeof this.plugin.settings;

            const folder = (this.plugin.settings[vocabFolderKey] as string) || '';
            const fileName = (this.plugin.settings[vocabFileNameKey] as string) || `${currentLanguage} Vocabulary`;
            const path = fileName + '.md';
            const fullPath = folder ? `${folder}/${path}` : path;
            const file = this.app.vault.getAbstractFileByPath(fullPath);

            const dateStr = new Date().toLocaleDateString('zh-CN');
            const cardContent = `> [!lme-vocab]+ **${entry.word}** ${entry.phonetic ? `*[${entry.phonetic}]*` : ''} <span class="lme-tag-new">${t('common.newTag')}</span>\n` +
                `> \n` +
                `> ${t('vocabNote.definition')}: ${entry.definition.replace(/\n/g, ' ')}\n` +
                `> ${t('vocabNote.example')}: ${entry.contextSnippet || t('dict.noExample')}\n` +
                `> ${t('vocabNote.source')}: [[${this.lastSource}]] | ${t('vocabNote.date')}: ${dateStr}\n\n`;

            if (file) {
                const content = await this.app.vault.read(file as unknown);
                await this.app.vault.modify(file as unknown, content + (content.endsWith('\n') ? '' : '\n') + cardContent);
            } else {
                const header = t('vocabNote.header');
                await this.app.vault.create(fullPath, header + cardContent);
            }

            new Notice(t('dict.addedToVocab', { word: res.word }));

            // Refresh flashcard review view if open
            const flashcardLeaf = this.app.workspace.getLeavesOfType('lme-flashcard-view')[0];
            if (flashcardLeaf && (flashcardLeaf.view as FlashcardView).enqueueNewCard) {
                await (flashcardLeaf.view as FlashcardView).enqueueNewCard(entry);
            }

            // Find specific button for feedback
            // We can't easily find it by class if there are multiple cards, 
            // but this is called in context of renderSingleResult where 'res' is unique per call.
            // For now, simple notice is good, but let's try a targeted class update if possible.
        } catch (e) {
            new Notice(t('dict.addToVocabFailed', { error: e instanceof Error ? e.message : String(e) }));
        }
    }

    private async openVocabNote() {
        // Get language-specific vocab notebook settings
        const currentLanguage = this.plugin.settings.activeLanguage || 'english';
        const vocabFolderKey = `${currentLanguage}VocabNoteFolder` as keyof typeof this.plugin.settings;
        const vocabFileNameKey = `${currentLanguage}VocabNoteFileName` as keyof typeof this.plugin.settings;

        const folder = (this.plugin.settings[vocabFolderKey] as string) || '';
        const fileName = (this.plugin.settings[vocabFileNameKey] as string) || `${currentLanguage} Vocabulary`;
        const path = fileName + '.md';
        const fullPath = folder ? `${folder}/${path}` : path;

        await this.app.workspace.openLinkText(fullPath, '', false);
    }

    /**
     * Finds image tags in MDX content and loads them from MDD if available.
     */
    private async processMdxResources(container: HTMLElement, language: string, dictId?: string) {
        const imgs = container.querySelectorAll('img');
        const { getMDXResource } = await import('../services/UnifiedDictionaryService');

        for (const img of Array.from(imgs)) {
            const src = img.getAttribute('src');
            if (src && !src.startsWith('http') && !src.startsWith('data:')) {
                try {
                    const buffer = await getMDXResource(src, language, dictId);
                    if (buffer) {
                        const blob = new Blob([buffer]);
                        const url = URL.createObjectURL(blob);
                        img.src = url;
                    }
                } catch (err) {
                    console.error(`[EME] Failed to load MDD resource: ${src}`, err);
                }
            }
        }
    }
}
