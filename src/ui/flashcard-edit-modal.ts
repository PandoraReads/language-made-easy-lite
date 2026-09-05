// ============================================================
// Language Made Easy - Flashcard Edit Modal
// ============================================================

import { App, Modal, Notice } from 'obsidian';
import { db } from '../core/Database';
import type { VocabularyEntry } from '../models';
import { t } from '../i18n';

/**
 * 编辑单张闪卡的全部文本字段。保存调用 db.updateVocabulary。
 * word 改成与同语言已有单词重复会触发唯一索引错误 → 提示。
 */
export class FlashcardEditModal extends Modal {
    private entry: VocabularyEntry;
    private onSaved: () => void;

    private wordInput!: HTMLInputElement;
    private phoneticInput!: HTMLInputElement;
    private posInput!: HTMLInputElement;
    private defInput!: HTMLTextAreaElement;
    private ctxInput!: HTMLTextAreaElement;
    private transInput!: HTMLTextAreaElement;

    constructor(app: App, entry: VocabularyEntry, onSaved: () => void) {
        super(app);
        this.entry = entry;
        this.onSaved = onSaved;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.addClass('lme-fmm-edit-shell');
        contentEl.addClass('lme-fmm-edit-modal');
        const header = contentEl.createDiv({ cls: 'lme-fmm-edit-header' });
        header.createEl('h2', { text: t('flashcardManager.editTitle') });

        const fields = contentEl.createDiv({ cls: 'lme-fmm-edit-fields' });

        this.wordInput = this.createTextField(fields, t('flashcard.wordLabel'), this.entry.word);
        this.phoneticInput = this.createTextField(fields, t('flashcard.phoneticLabel'), this.entry.phonetic || '');
        this.posInput = this.createTextField(fields, t('flashcardManager.partOfSpeech'), this.entry.partOfSpeech || '');
        this.defInput = this.createTextArea(fields, t('flashcard.definitionLabel'), this.entry.definition || '', 3);
        this.ctxInput = this.createTextArea(fields, t('flashcard.exampleLabel'), this.entry.contextSnippet || '', 3);
        this.transInput = this.createTextArea(fields, t('flashcardManager.translation'), this.entry.contextTranslation || '', 2);

        const footer = contentEl.createDiv({ cls: 'lme-fmm-edit-footer' });
        const cancelBtn = footer.createEl('button', { cls: 'lme-fmm-edit-cancel', text: t('common.cancel') });
        cancelBtn.onclick = () => this.close();
        const saveBtn = footer.createEl('button', { cls: 'lme-fmm-edit-save mod-cta', text: t('flashcardManager.save') });
        saveBtn.onclick = async () => { await this.save(); };
    }

    private createTextField(parent: HTMLElement, label: string, value: string): HTMLInputElement {
        const field = parent.createDiv({ cls: 'lme-fmm-edit-field' });
        field.createEl('label', { text: label });
        const input = field.createEl('input', { type: 'text' });
        input.value = value;
        return input;
    }

    private createTextArea(parent: HTMLElement, label: string, value: string, rows: number): HTMLTextAreaElement {
        const field = parent.createDiv({ cls: 'lme-fmm-edit-field' });
        field.createEl('label', { text: label });
        const textarea = field.createEl('textarea');
        textarea.value = value;
        textarea.rows = rows;
        return textarea;
    }

    private async save() {
        const word = this.wordInput.value.trim().toLowerCase();
        if (!word) {
            new Notice(t('flashcard.wordRequired'));
            return;
        }
        const changes: Partial<VocabularyEntry> = {
            word,
            phonetic: this.phoneticInput.value.trim(),
            partOfSpeech: this.posInput.value.trim(),
            definition: this.defInput.value.trim(),
            contextSnippet: this.ctxInput.value.trim(),
            contextTranslation: this.transInput.value.trim(),
        };
        try {
            await db.updateVocabulary(this.entry.id, changes);
            new Notice(t('flashcardManager.editSaved'));
            this.onSaved();
            this.close();
        } catch (e) {
            new Notice(t('flashcardManager.editDuplicateWord'));
        }
    }
}
