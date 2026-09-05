/**
 * Input Prompt Modal
 * Unified compact modal: input field on the left, buttons on the right.
 */

import { App, Modal } from 'obsidian';
import { t } from '../i18n';

export class InputPromptModal extends Modal {
	private title: string;
	private value: string;
	private placeholder: string;
	private onSubmit: (value: string) => void;

	/**
	 * @param app         Obsidian App instance
	 * @param title       Modal heading text
	 * @param placeholder Default value AND placeholder for the input field
	 * @param onSubmit    Callback with the user's trimmed input
	 */
	constructor(app: App, title: string, placeholder: string, onSubmit: (value: string) => void) {
		super(app);
		this.title = title;
		this.value = placeholder;
		this.placeholder = placeholder;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('lme-input-prompt-modal');

		// Title
		contentEl.createEl('h2', { text: this.title });

		// Single row: input + buttons
		const row = contentEl.createDiv('lme-input-prompt-row');

		const input = row.createEl('input', {
			type: 'text',
			cls: 'lme-input-prompt-input',
			attr: { placeholder: this.placeholder, value: this.value }
		});

		const btnGroup = row.createDiv('lme-input-prompt-btns');

		const cancelBtn = btnGroup.createEl('button', {
			cls: 'lme-input-prompt-cancel',
			text: t('common.cancel')
		});

		const saveBtn = btnGroup.createEl('button', {
			cls: 'lme-input-prompt-save mod-cta',
			text: t('common.save')
		});

		const doSubmit = () => {
			const val = input.value.trim();
			if (val) {
				this.onSubmit(val);
				this.close();
			}
		};

		saveBtn.onclick = doSubmit;
		cancelBtn.onclick = () => this.close();
		input.addEventListener('keypress', (e) => { if (e.key === 'Enter') doSubmit(); });
		input.addEventListener('input', () => { this.value = input.value.trim(); });

		setTimeout(() => input.focus(), 50);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
