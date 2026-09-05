// ============================================================
// Language Made Easy - SRT File Select Modal
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// ============================================================

import { App, FuzzySuggestModal, TFile } from 'obsidian';
import { t } from '../i18n';

/**
 * Fuzzy-pick a `.srt` subtitle file from the vault, for the
 * "SRT → subtitle note" command. Modeled after MediaFileSelectModal.
 */
export class SrtFileSelectModal extends FuzzySuggestModal<TFile> {
    private files: TFile[];
    private onSelect: (file: TFile) => void;

    constructor(app: App, onSelect: (file: TFile) => void) {
        super(app);
        this.files = app.vault.getFiles().filter(f => f.extension?.toLowerCase() === 'srt');
        this.onSelect = onSelect;
        this.setPlaceholder(t('srtToNote.selectSrt'));
    }

    getItems(): TFile[] {
        return this.files;
    }

    getItemText(item: TFile): string {
        return item.path;
    }

    onChooseItem(item: TFile): void {
        this.onSelect(item);
    }
}
