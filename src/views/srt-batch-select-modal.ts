// ============================================================
// Language Made Easy - SRT Batch Select Modal
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// ============================================================

import { App, Modal, TFile } from 'obsidian';
import { t } from '../i18n';

/**
 * A searchable, multi-select modal for picking several `.srt` files at once.
 * Used by the "Batch convert SRT to subtitle notes" command.
 *
 * Features: path filter box, select-all/none (scoped to the current filter),
 * a scrollable checkbox list, and a live "n/total selected" counter. All
 * files are selected by default so the common "convert everything" case is
 * one click.
 */
export class SrtBatchSelectModal extends Modal {
    private allFiles: TFile[];
    private filtered: TFile[];
    private selected: Set<string>;
    private onConfirm: (files: TFile[]) => void;

    private searchEl!: HTMLInputElement;
    private listEl!: HTMLElement;
    private countEl!: HTMLElement;

    constructor(app: App, files: TFile[], onConfirm: (files: TFile[]) => void) {
        super(app);
        this.allFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));
        this.filtered = this.allFiles;
        // Pre-select all — the typical batch intent is "convert everything".
        this.selected = new Set(this.allFiles.map(f => f.path));
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lme-srt-batch-modal');

        contentEl.createEl('h2', { text: t('srtToNote.batchTitle') });

        // Search / filter box.
        this.searchEl = contentEl.createEl('input', { type: 'text' });
        this.searchEl.placeholder = t('srtToNote.batchSearchPlaceholder');
        this.searchEl.addClass('lme-srt-batch-search');
        this.searchEl.addEventListener('input', () => this.applyFilter());

        // Toolbar: select-all / select-none (act on the filtered set) + counter.
        const toolbar = contentEl.createDiv({ cls: 'lme-srt-batch-toolbar' });
        const selAll = toolbar.createEl('button', { text: t('srtToNote.selectAll') });
        const selNone = toolbar.createEl('button', { text: t('srtToNote.selectNone') });
        this.countEl = toolbar.createSpan({ cls: 'lme-srt-batch-count' });
        selAll.onclick = () => {
            this.filtered.forEach(f => this.selected.add(f.path));
            this.renderList();
        };
        selNone.onclick = () => {
            this.filtered.forEach(f => this.selected.delete(f.path));
            this.renderList();
        };

        // Scrollable checkbox list.
        this.listEl = contentEl.createDiv({ cls: 'lme-srt-batch-list' });

        // Action buttons.
        const buttons = contentEl.createDiv({ cls: 'lme-srt-batch-buttons' });
        const cancelBtn = buttons.createEl('button', { text: t('common.cancel') });
        const confirmBtn = buttons.createEl('button', { text: t('srtToNote.batchConfirm'), cls: 'mod-cta' });
        cancelBtn.onclick = () => this.close();
        confirmBtn.onclick = () => {
            const files = this.allFiles.filter(f => this.selected.has(f.path));
            this.close();
            this.onConfirm(files);
        };

        this.applyFilter();
        setTimeout(() => this.searchEl.focus(), 0);
    }

    private applyFilter(): void {
        const q = this.searchEl.value.trim().toLowerCase();
        this.filtered = q ? this.allFiles.filter(f => f.path.toLowerCase().includes(q)) : this.allFiles;
        this.renderList();
    }

    private renderList(): void {
        this.listEl.empty();

        if (this.filtered.length === 0) {
            this.listEl.createEl('div', {
                text: t('srtToNote.noSrtFiles'),
                cls: 'setting-item-description',
            });
            this.updateCount();
            return;
        }

        for (const f of this.filtered) {
            const row = this.listEl.createDiv({ cls: 'lme-srt-batch-row' });
            const cb = row.createEl('input', { type: 'checkbox' });
            cb.checked = this.selected.has(f.path);
            const toggle = () => {
                if (cb.checked) {
                    this.selected.add(f.path);
                } else {
                    this.selected.delete(f.path);
                }
                this.updateCount();
            };
            cb.onchange = toggle;
            // Click the label to toggle too (better ergonomics).
            const label = row.createEl('span', { text: f.path, cls: 'lme-srt-batch-label' });
            label.onclick = () => {
                cb.checked = !cb.checked;
                toggle();
            };
        }

        this.updateCount();
    }

    private updateCount(): void {
        this.countEl.setText(t('srtToNote.batchCount', {
            n: this.selected.size,
            total: this.allFiles.length,
        }));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
