// ============================================================
// Language Made Easy - 通用确认弹窗
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// ============================================================
//
// 轻量 yes/no 确认弹窗:标题 + 正文 + 取消/确认按钮。
// confirmStyle='danger' 时确认按钮用 mod-warning(红);否则 mod-cta(强调)。
// 用于目录页删除笔记等需要二次确认的破坏性操作。

import { App, Modal } from 'obsidian';
import { t } from '../i18n';

export interface ConfirmOptions {
    title: string;
    message: string;
    confirmText: string;
    cancelText?: string;            // 缺省取 common.cancel
    confirmStyle?: 'primary' | 'danger';
    onConfirm: () => void;
}

export class ConfirmModal extends Modal {
    private opts: ConfirmOptions;

    constructor(app: App, opts: ConfirmOptions) {
        super(app);
        this.opts = opts;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lme-confirm-modal');
        contentEl.createEl('h3', { text: this.opts.title });
        contentEl.createEl('p', { text: this.opts.message, cls: 'lme-confirm-message' });

        const btns = contentEl.createDiv('lme-confirm-btns');
        const cancel = btns.createEl('button', {
            text: this.opts.cancelText ?? t('common.cancel'),
        });
        cancel.onclick = () => this.close();

        const confirm = btns.createEl('button', {
            text: this.opts.confirmText,
            cls: this.opts.confirmStyle === 'danger' ? 'mod-warning' : 'mod-cta',
        });
        confirm.onclick = () => {
            this.close();
            this.opts.onConfirm();
        };

        // 焦点落在确认按钮上:Enter 原生触发 click;Esc 走 Modal 默认关闭(=取消)。
        setTimeout(() => confirm.focus(), 50);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
