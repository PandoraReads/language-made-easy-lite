// ============================================================
// Language Made Easy - 跟读工坊目录页·标签多选筛选弹窗
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// ============================================================
//
// 筛选区"标签"按钮点开的多选弹层:平铺全库标签 chip,点击即 toggle,
// 与目录页现有 toggleTag/已选 chip 行实时联动;带搜索框方便标签多时定位。
// 本地 Set 与父视图 filterTags 由相同操作序列演化,无需双向引用同步。

import { App, Modal } from 'obsidian';
import { t } from '../i18n';

export interface TagFilterModalOptions {
    /** 全库去重排序后的标签全集。 */
    tags: string[];
    /** 打开时的已选标签快照。 */
    selected: string[];
    /** toggle 一个标签(父视图负责更新 filterTags 并重渲列表)。 */
    onToggle: (tag: string) => void;
    /** 清除全部已选标签。 */
    onClear: () => void;
}

export class TagFilterModal extends Modal {
    private opts: TagFilterModalOptions;
    private local = new Set<string>();
    private gridEl: HTMLElement | null = null;
    private searchInput: HTMLInputElement | null = null;

    constructor(app: App, opts: TagFilterModalOptions) {
        super(app);
        this.opts = opts;
        this.local = new Set(opts.selected);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lme-tagfilter-modal');

        contentEl.createEl('h3', { text: t('nav.workshopTagFilterTitle') });

        if (this.opts.tags.length === 0) {
            contentEl.createEl('p', {
                text: t('nav.workshopTagFilterNoTags'),
                cls: 'lme-settings-hint'
            });
            return;
        }

        const searchWrap = contentEl.createDiv('lme-tagfilter-search');
        this.searchInput = searchWrap.createEl('input', {
            type: 'text',
            cls: 'lme-tagfilter-search-input',
        }) as HTMLInputElement;
        this.searchInput.placeholder = t('nav.workshopTagFilterSearch');
        this.searchInput.addEventListener('input', () => this.renderGrid());

        this.gridEl = contentEl.createDiv('lme-tagfilter-grid');
        this.renderGrid();

        const btns = contentEl.createDiv('lme-tagfilter-btns');
        const clear = btns.createEl('button', {
            text: t('nav.workshopTagFilterClear'),
            cls: 'lme-tagfilter-clear-btn',
        });
        clear.type = 'button';
        clear.onclick = () => {
            this.local.clear();
            this.opts.onClear();
            this.renderGrid();
        };

        // 初始焦点进搜索框;Esc 走 Modal 默认关闭
        window.setTimeout(() => this.searchInput?.focus(), 50);
    }

    private renderGrid(): void {
        if (!this.gridEl) return;
        this.gridEl.empty();

        const query = (this.searchInput?.value || '').trim().toLowerCase();
        const visible = query
            ? this.opts.tags.filter((tg) => tg.toLowerCase().includes(query))
            : this.opts.tags;

        if (visible.length === 0) {
            this.gridEl.createEl('p', {
                text: t('nav.workshopTagFilterEmpty'),
                cls: 'lme-settings-hint'
            });
            return;
        }

        for (const tag of visible) {
            const chip = this.gridEl.createEl('button', {
                cls: 'lme-tagfilter-chip' + (this.local.has(tag) ? ' is-active' : ''),
            });
            chip.type = 'button';
            chip.setAttr('aria-pressed', String(this.local.has(tag)));
            chip.createSpan({ text: '#' + tag });
            if (this.local.has(tag)) {
                chip.createSpan({ cls: 'lme-tagfilter-chip-x', text: '×' });
            }
            chip.onclick = () => {
                // 本地 Set 与父视图 filterTags 各自对同一标签 toggle,保持同步
                if (this.local.has(tag)) {
                    this.local.delete(tag);
                } else {
                    this.local.add(tag);
                }
                this.opts.onToggle(tag);
                this.renderGrid();
            };
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
