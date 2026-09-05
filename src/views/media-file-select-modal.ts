// ============================================================
// Language Made Easy - Media File Select Modal
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// ============================================================

import { App, FuzzySuggestModal, TFile } from 'obsidian';
import { t } from '../i18n';

const MEDIA_EXTS = new Set([
	// audio
	'mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'webm',
	// video
	'mp4', 'mov', 'mkv', 'm4v',
]);

/**
 * Fuzzy-pick an audio/video file from the vault for transcription.
 * Modeled after FileSelectModal (shadowing-view.ts) but lists media files only.
 */
export class MediaFileSelectModal extends FuzzySuggestModal<TFile> {
	private files: TFile[];
	private onSelect: (file: TFile) => void;

	constructor(app: App, onSelect: (file: TFile) => void) {
		super(app);
		this.files = app.vault.getFiles().filter(f => {
			const ext = f.extension?.toLowerCase();
			return !!ext && MEDIA_EXTS.has(ext);
		});
		this.onSelect = onSelect;
		this.setPlaceholder(t('transcribe.selectMedia'));
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
