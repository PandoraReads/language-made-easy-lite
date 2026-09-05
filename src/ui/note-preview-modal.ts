import { App, MarkdownView, Modal, TFile, WorkspaceLeaf, setIcon } from 'obsidian';
import { t } from '../i18n';

const MODE_STORAGE_KEY = 'lme-note-preview-mode';
type NoteViewMode = 'source' | 'preview';

/**
 * 跟读工坊目录页「Shift+点击预览」弹窗。照搬 apex dashboard 的 NotePopoverModal:
 * 内嵌一个真实可编辑的 MarkdownView(把 detached WorkspaceLeaf 重新挂进弹窗),
 * 关闭时 save + detach, 防状态/DOM 泄漏。源码/阅读模式可切换, 上次选择会被记住。
 *
 * modal 挂在 document.body 上(在 .lme- 根之外), 故 CSS 全用 Obsidian 全局变量;
 * 类名加 lme- 前缀, 以免与同时安装的 apex 插件 .note-popover-* 撞样式。
 */
export class NotePreviewModal extends Modal {
	private readonly file: TFile;
	private leaf: WorkspaceLeaf | null = null;
	private toggleBtn: HTMLElement | null = null;
	private mode: NoteViewMode;

	constructor(app: App, file: TFile) {
		super(app);
		this.file = file;
		this.mode = (this.app.loadLocalStorage(MODE_STORAGE_KEY) as string | null) === 'preview' ? 'preview' : 'source';
	}

	async onOpen(): Promise<void> {
		const { contentEl, modalEl } = this;
		modalEl.addClass('lme-note-preview-modal-wrap');
		contentEl.empty();
		contentEl.addClass('lme-note-preview-modal');

		// Header
		const header = contentEl.createDiv({ cls: 'lme-note-preview-header' });

		const titleWrap = header.createDiv({ cls: 'lme-note-preview-title' });
		setIcon(titleWrap.createSpan(), 'file-text');
		titleWrap.createSpan({ text: this.file.basename });

		const actions = header.createDiv({ cls: 'lme-note-preview-actions' });

		this.toggleBtn = actions.createEl('button', { cls: 'lme-note-preview-btn' });
		this.toggleBtn.setAttribute('aria-label', t('notePreview.toggleView'));
		setIcon(this.toggleBtn, this.mode === 'source' ? 'pencil' : 'eye');
		this.toggleBtn.addEventListener('click', () => { void this.toggleMode(); });

		const openTabBtn = actions.createEl('button', { cls: 'lme-note-preview-btn' });
		openTabBtn.setAttribute('aria-label', t('notePreview.openInTab'));
		setIcon(openTabBtn, 'arrow-up-right');
		openTabBtn.addEventListener('click', () => {
			void this.app.workspace.getLeaf('tab').openFile(this.file);
			this.close();
		});

		const closeBtn = actions.createEl('button', { cls: 'lme-note-preview-btn' });
		closeBtn.setAttribute('aria-label', t('common.close'));
		setIcon(closeBtn, 'x');
		closeBtn.addEventListener('click', () => this.close());

		// Editor host
		const host = contentEl.createDiv({ cls: 'lme-note-preview-editor' });

		// WorkspaceLeaf 没有公开的构造签名, 但运行时接受 app。强转让 tsc 通过,
		// 创建一个游离于 workspace 标签栏之外的 leaf; 其 containerEl(.workspace-leaf
		// 节点)运行时存在但未声明类型, 用交叉类型收窄。
		const LeafCtor = WorkspaceLeaf as unknown as new (app: App) => WorkspaceLeaf;
		const leaf = new LeafCtor(this.app) as WorkspaceLeaf & { containerEl: HTMLElement };
		this.leaf = leaf;
		await leaf.openFile(this.file, { state: { mode: this.mode } });
		host.appendChild(leaf.containerEl);
	}

	private async toggleMode(): Promise<void> {
		if (!this.leaf) return;
		this.mode = this.mode === 'source' ? 'preview' : 'source';
		this.app.saveLocalStorage(MODE_STORAGE_KEY, this.mode);
		if (this.toggleBtn) setIcon(this.toggleBtn, this.mode === 'source' ? 'pencil' : 'eye');
		await this.leaf.setViewState({
			type: 'markdown',
			state: { file: this.file.path, mode: this.mode },
		});
	}

	onClose(): void {
		const leaf = this.leaf;
		this.leaf = null;
		this.toggleBtn = null;
		if (leaf) {
			void this.detachLeaf(leaf);
		}
		this.contentEl.empty();
	}

	private async detachLeaf(leaf: WorkspaceLeaf): Promise<void> {
		try {
			if (leaf.view instanceof MarkdownView) {
				await leaf.view.save();
			}
		} catch {
			// 尽力刷盘; 无论成功与否都 detach, 防泄漏。
		}
		leaf.detach();
	}
}
