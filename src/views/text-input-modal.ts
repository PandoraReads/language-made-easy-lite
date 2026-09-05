// ============================================================
// Language Made Easy - Generic Text Input Modal
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// ============================================================

import { App, Modal, Setting } from 'obsidian';

export interface TextInputModalOptions {
    /** Modal title shown at the top. */
    title: string;
    /** Optional helper text rendered above the input. */
    body?: string;
    /** Placeholder for the text field. */
    placeholder?: string;
    /** Initial value prefilled in the field. */
    value?: string;
    /** Label for the confirm button (defaults to a generic "OK"). */
    confirmText?: string;
    /** When true, pressing Enter in the field submits. Defaults to true. */
    submitOnEnter?: boolean;
}

/**
 * A minimal, reusable single-line text input modal with confirm/cancel.
 * Used by the "SRT → subtitle note" flow to let the user confirm or edit
 * the destination note path when no default output folder is configured.
 *
 * `onSubmit` receives the trimmed value; `onSubmit` is only called on
 * explicit confirm (Enter or the confirm button), never on cancel/Esc.
 */
export class TextInputModal extends Modal {
    private opts: TextInputModalOptions;
    private onSubmit: (value: string) => void;
    private currentValue: string;

    constructor(app: App, opts: TextInputModalOptions, onSubmit: (value: string) => void) {
        super(app);
        this.opts = opts;
        this.onSubmit = onSubmit;
        this.currentValue = opts.value ?? '';
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: this.opts.title });

        if (this.opts.body) {
            contentEl.createEl('p', {
                text: this.opts.body,
                cls: 'setting-item-description',
            });
        }

        const submitOnEnter = this.opts.submitOnEnter !== false;

        new Setting(contentEl)
            .addText((text) => {
                text.setPlaceholder(this.opts.placeholder ?? '')
                    .setValue(this.currentValue)
                    .onChange((v) => {
                        this.currentValue = v;
                    });
                if (submitOnEnter) {
                    text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            this.confirm();
                        }
                    });
                }
                text.inputEl.style.width = '100%';
                // Focus for immediate editing.
                setTimeout(() => text.inputEl.focus(), 0);
            });

        new Setting(contentEl)
            .addButton((btn) => {
                btn.setButtonText(this.opts.confirmText ?? 'OK')
                    .setCta()
                    .onClick(() => this.confirm());
            })
            .addButton((btn) => {
                btn.setButtonText('Cancel').onClick(() => this.close());
            });
    }

    private confirm(): void {
        const value = this.currentValue.trim();
        this.close();
        this.onSubmit(value);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
