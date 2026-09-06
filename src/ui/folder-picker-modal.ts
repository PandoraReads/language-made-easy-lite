// ============================================================
// Language Made Easy - 文件夹选择弹窗
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// ============================================================
//
// 通用 vault 文件夹快速选择器(FuzzySuggestModal 模糊搜索):
//   - 置顶「默认:{folder}」项,对应 value=''(默认值语义由调用方解释)
//   - 其余项为 vault 内全部文件夹,按路径排序
//   - 当前生效项(含尚未同步到本机的自定义路径)带「(当前)」标记
// 选中即回调 onPick(value) 并关闭。
// 跟读工坊目录页的路径按钮在用;设置页的 showFolderSuggest 是另一套
// (直接写 settings 字段),勿混。

import { App, FuzzySuggestModal, FuzzyMatch, TFolder, setIcon } from 'obsidian';
import { t } from '../i18n';

/** value='' 表示"用默认"(置顶项)。 */
interface FolderPickItem {
    value: string;
    label: string;
    isDefault: boolean;
    isCurrent: boolean;
}

export interface FolderPickerOptions {
    /** 默认文件夹路径(置顶项文案与列表去重用;须非空)。 */
    defaultFolder: string;
    /** 当前原始值('' = 未设置,用默认)。 */
    currentRaw: string;
    /** 选中回调;value 为 '' 表示恢复默认。 */
    onPick: (folder: string) => void;
}

export class FolderPickerModal extends FuzzySuggestModal<FolderPickItem> {
    private readonly opts: FolderPickerOptions;

    constructor(app: App, opts: FolderPickerOptions) {
        super(app);
        this.opts = opts;
        this.setPlaceholder(t('nav.workshopCatalogPickFolderPlaceholder'));
    }

    getItems(): FolderPickItem[] {
        const current = this.opts.currentRaw.trim();
        const folders = new Set<string>();
        try {
            for (const f of this.app.vault.getAllFolders(false)) {
                if (f instanceof TFolder && f.path) folders.add(f.path);
            }
        } catch { /* 拿不到文件夹列表时由置顶默认项兜底 */ }
        // 当前路径不在本机文件夹之列(未同步/已被删除)也要可见,不能悄悄丢失
        if (current) folders.add(current);
        // 默认文件夹已由置顶项代表,列表内不再重复出现
        folders.delete(this.opts.defaultFolder);
        return [
            {
                value: '',
                label: t('nav.workshopCatalogPickFolderDefault', { folder: this.opts.defaultFolder }),
                isDefault: true,
                isCurrent: current === '',
            },
            ...[...folders].sort().map((p) => ({
                value: p,
                label: p,
                isDefault: false,
                isCurrent: p === current,
            })),
        ];
    }

    getItemText(item: FolderPickItem): string {
        return item.label;
    }

    renderSuggestion(match: FuzzyMatch<FolderPickItem>, el: HTMLElement): void {
        const item = match.item;
        const row = el.createDiv('lme-folderpick-row');
        setIcon(row.createSpan('lme-folderpick-icon'), item.isDefault ? 'star' : 'folder');
        row.createSpan({
            cls: 'lme-folderpick-label' + (item.isCurrent ? ' is-current' : ''),
            text: item.isCurrent
                ? `${item.label} ${t('nav.workshopCatalogPickFolderCurrent')}`
                : item.label,
        });
    }

    onChooseItem(item: FolderPickItem): void {
        this.close();
        this.opts.onPick(item.value);
    }
}
