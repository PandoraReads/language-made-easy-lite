// ============================================================
// Language Made Easy - 设置页路径选择的仓库文件夹选择器
// ============================================================
//
// 通用 vault 文件夹模糊选择器(供设置页路径类输入框的「浏览」按钮使用):
//   - 可选置顶一个「留空/恢复默认」项(value='',文案由调用方给出)
//   - 其余项为 vault 内全部文件夹,按路径排序
//   - 当前生效项带「(当前)」标记
// 选中即回调 onPick(value) 并关闭;不写 settings,持久化由调用方完成。
// 跟读工坊目录页的 FolderPickerModal(ui/folder-picker-modal.ts)是另一套
// 带固定默认目录语义的选择器,勿混。

import { App, FuzzySuggestModal, FuzzyMatch, TFolder, setIcon } from 'obsidian';
import { t } from '../i18n';

/** value='' 表示"留空/恢复默认"(仅当调用方提供 emptyLabel 时出现)。 */
interface VaultFolderPickItem {
    value: string;
    label: string;
    isEmptyChoice: boolean;
    isCurrent: boolean;
}

export interface VaultFolderSuggestOptions {
    /** 输入框当前原始值('' = 未设置)。 */
    current: string;
    /** 置顶「留空/恢复默认」项的文案;不传则不提供空值项。 */
    emptyLabel?: string;
    /** 选中回调;value 为 '' 表示清空恢复默认,持久化由调用方完成。 */
    onPick: (folder: string) => void | Promise<void>;
}

export class VaultFolderSuggestModal extends FuzzySuggestModal<VaultFolderPickItem> {
    private readonly opts: VaultFolderSuggestOptions;
    private readonly folders: string[];

    constructor(app: App, opts: VaultFolderSuggestOptions) {
        super(app);
        this.opts = opts;
        this.folders = VaultFolderSuggestModal.listVaultFolders(app);
        this.setPlaceholder(t('common.search'));
    }

    private static listVaultFolders(app: App): string[] {
        const folders = new Set<string>();
        try {
            for (const f of app.vault.getAllFolders(false)) {
                if (f instanceof TFolder && f.path) folders.add(f.path);
            }
        } catch { /* 拿不到文件夹列表时仅剩置顶项兜底 */ }
        return Array.from(folders).sort();
    }

    getItems(): VaultFolderPickItem[] {
        const current = this.opts.current.trim();
        const items: VaultFolderPickItem[] = [];
        if (this.opts.emptyLabel) {
            items.push({
                value: '',
                label: this.opts.emptyLabel,
                isEmptyChoice: true,
                isCurrent: current === '',
            });
        }
        for (const p of this.folders) {
            items.push({ value: p, label: p, isEmptyChoice: false, isCurrent: p === current });
        }
        return items;
    }

    getItemText(item: VaultFolderPickItem): string {
        return item.label;
    }

    renderSuggestion(match: FuzzyMatch<VaultFolderPickItem>, el: HTMLElement): void {
        const item = match.item;
        const row = el.createDiv('lme-folderpick-row');
        setIcon(row.createSpan('lme-folderpick-icon'), item.isEmptyChoice ? 'rotate-ccw' : 'folder');
        row.createSpan({
            cls: 'lme-folderpick-label' + (item.isCurrent ? ' is-current' : ''),
            text: item.isCurrent
                ? `${item.label} ${t('nav.workshopCatalogPickFolderCurrent')}`
                : item.label,
        });
    }

    onChooseItem(item: VaultFolderPickItem): void {
        this.close();
        void this.opts.onPick(item.value);
    }
}
