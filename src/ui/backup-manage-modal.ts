// ============================================================
// Language Made Easy - Flashcard Backup Manage Modal
// ============================================================

import { App, Modal, Notice } from 'obsidian';
import type LanguageMadeEasyPlugin from '../main-unified-full';
import { parseBackupFileName } from '../services/flashcard-backup';
import { t } from '../i18n';

interface BackupRow {
    fileName: string;
    timestamp: number;
    sizeBytes: number;
}

/**
 * 「恢复备份」:列出插件目录 backups/ 下的闪卡备份(新→旧),逐份可恢复
 * 或删除。恢复走与异库找回一致的合并语义(同词保复习进度更高者,幂等)。
 */
export class BackupManageModal extends Modal {
    private plugin: LanguageMadeEasyPlugin;
    private rows: BackupRow[] = [];
    private busy = false;

    constructor(app: App, plugin: LanguageMadeEasyPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.addClass('lme-backup-manage-shell');
        contentEl.addClass('lme-backup-manage-modal');

        contentEl.createEl('h2', { text: t('dataRecovery.backupTitle') });
        contentEl.createEl('p', {
            cls: 'lme-backup-manage-desc',
            text: t('dataRecovery.backupDesc'),
        });

        const listEl = contentEl.createDiv('lme-backup-manage-list');
        const statusEl = contentEl.createEl('p', { cls: 'lme-backup-manage-status', text: t('dataRecovery.loading') });
        void this.loadRows(listEl, statusEl);
    }

    private async loadRows(listEl: HTMLElement, statusEl: HTMLElement): Promise<void> {
        try {
            const adapter = this.app.vault.adapter;
            const names = await this.plugin.listBackupFiles();
            for (const name of names) {
                const path = `${this.plugin.backupDirPath}/${name}`;
                let sizeBytes = 0;
                try {
                    const stat = await adapter.stat(path);
                    sizeBytes = stat?.size ?? 0;
                } catch { /* stat 失败按 0 显示 */ }
                this.rows.push({ fileName: name, timestamp: parseBackupFileName(name) ?? 0, sizeBytes });
            }
        } catch (error) {
            console.warn('[LME] 备份列表读取失败:', error);
        }

        statusEl.remove();
        if (this.rows.length === 0) {
            listEl.createEl('p', { cls: 'lme-backup-manage-empty', text: t('dataRecovery.noBackups') });
            return;
        }
        for (const row of this.rows) {
            this.renderRow(listEl, row);
        }
    }

    private renderRow(parent: HTMLElement, row: BackupRow): void {
        const rowEl = parent.createDiv('lme-backup-manage-item');
        const infoEl = rowEl.createDiv('lme-backup-manage-info');
        infoEl.createDiv({
            cls: 'lme-backup-manage-time',
            text: row.timestamp > 0 ? new Date(row.timestamp).toLocaleString() : row.fileName,
        });
        infoEl.createDiv({
            cls: 'lme-backup-manage-size',
            text: row.sizeBytes > 0 ? formatBytes(row.sizeBytes) : '',
        });

        const actionsEl = rowEl.createDiv('lme-backup-manage-actions');
        const restoreBtn = actionsEl.createEl('button', {
            cls: 'lme-backup-manage-restore mod-cta',
            text: t('dataRecovery.restoreButton'),
        });
        restoreBtn.onclick = async () => {
            if (this.busy) return;
            this.busy = true;
            restoreBtn.disabled = true;
            restoreBtn.textContent = t('dataRecovery.importing');
            try {
                const summary = await this.plugin.restoreFlashcardBackup(row.fileName);
                new Notice(t('dataRecovery.importDone', {
                    imported: String(summary.imported),
                    skipped: String(summary.skipped),
                    replaced: String(summary.replaced),
                }), 6000);
                this.close();
            } catch (error) {
                console.warn('[LME] backup restore failed:', error);
                new Notice(t('dataRecovery.restoreFailed'));
                restoreBtn.disabled = false;
                restoreBtn.textContent = t('dataRecovery.restoreButton');
                this.busy = false;
            }
        };

        const deleteBtn = actionsEl.createEl('button', {
            cls: 'lme-backup-manage-delete',
            text: t('common.delete'),
        });
        deleteBtn.onclick = async () => {
            if (this.busy) return;
            try {
                await this.app.vault.adapter.remove(`${this.plugin.backupDirPath}/${row.fileName}`);
                rowEl.remove();
                new Notice(t('dataRecovery.backupDeleted'));
            } catch (error) {
                console.warn('[LME] backup delete failed:', error);
                new Notice(t('dataRecovery.restoreFailed'));
            }
        };
    }
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
