// ============================================================
// Language Made Easy - Vault Flashcard Recovery Modal
// ============================================================

import { App, Modal, Notice, Setting } from 'obsidian';
import { db, type VaultDbCandidate } from '../core/Database';
import type LanguageMadeEasyPlugin from '../main-unified-full';
import { t } from '../i18n';

/**
 * 「从其他仓库找回闪卡」:列出本机上其他有卡的 LME 库(改名/移动前的旧库
 * 或其他 vault),一键合并进当前库。合并语义:同词保留复习进度(reps)
 * 更高的一方,幂等可重入。数据完整性功能,免费版可用。
 */
export class VaultRecoveryModal extends Modal {
    private plugin: LanguageMadeEasyPlugin;
    private candidates: VaultDbCandidate[];
    private busy = false;

    constructor(app: App, plugin: LanguageMadeEasyPlugin, candidates: VaultDbCandidate[]) {
        super(app);
        this.plugin = plugin;
        this.candidates = candidates;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.addClass('lme-vault-recovery-shell');
        contentEl.addClass('lme-vault-recovery-modal');

        contentEl.createEl('h2', { text: t('dataRecovery.title') });
        contentEl.createEl('p', {
            cls: 'lme-vault-recovery-desc',
            text: t('dataRecovery.desc'),
        });

        if (this.candidates.length === 0) {
            contentEl.createEl('p', {
                cls: 'lme-vault-recovery-empty',
                text: t('dataRecovery.noCandidates'),
            });
        } else {
            const listEl = contentEl.createDiv('lme-vault-recovery-list');
            for (const candidate of this.candidates) {
                this.renderCandidate(listEl, candidate);
            }
        }

        new Setting(contentEl)
            .addButton(btn => {
                btn.setClass('mod-cta');
                btn.setButtonText(t('common.close'));
                btn.onClick(() => this.close());
            });
    }

    private renderCandidate(parent: HTMLElement, candidate: VaultDbCandidate): void {
        const rowEl = parent.createDiv('lme-vault-recovery-item');
        const infoEl = rowEl.createDiv('lme-vault-recovery-info');

        const languages = candidate.languages.length > 0
            ? candidate.languages.join(', ')
            : '—';
        infoEl.createEl('div', {
            cls: 'lme-vault-recovery-count',
            text: t('dataRecovery.candidateCards', { count: String(candidate.vocabularyCount) }),
        });
        infoEl.createEl('div', {
            cls: 'lme-vault-recovery-meta',
            text: candidate.latestAddedTime > 0
                ? t('dataRecovery.candidateMeta', {
                    languages,
                    date: new Date(candidate.latestAddedTime).toLocaleDateString(),
                })
                : t('dataRecovery.candidateMetaNoDate', { languages }),
        });

        const importBtn = rowEl.createEl('button', {
            cls: 'lme-vault-recovery-import mod-cta',
            text: t('dataRecovery.importButton'),
        });
        importBtn.onclick = async () => {
            if (this.busy) return;
            this.busy = true;
            importBtn.disabled = true;
            importBtn.textContent = t('dataRecovery.importing');
            try {
                const summary = await db.importFromVaultDb(candidate.name);
                new Notice(t('dataRecovery.importDone', {
                    imported: String(summary.imported),
                    skipped: String(summary.skipped),
                    replaced: String(summary.replaced),
                }), 6000);
                await this.plugin.refreshLmeViews();
                this.close();
            } catch (error) {
                console.warn('[LME] vault recovery import failed:', error);
                new Notice(t('dataRecovery.importFailed'));
                importBtn.disabled = false;
                importBtn.textContent = t('dataRecovery.importButton');
                this.busy = false;
            }
        };
    }
}
