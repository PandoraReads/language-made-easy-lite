// ============================================================
// Language Made Easy - Electron 原生文件选择工具
// ============================================================
// Obsidian 1.11+ (Electron 39 / Chromium 142) 起程序化 .click() 打开隐藏
// <input type="file"> 会被静默忽略(electron/electron#42013 回归),
// 文件选择一律优先原生 dialog.showOpenDialog,隐藏 input 仅作兜底。
// 词典设置弹窗(Settings.pickFile)与闪卡导入(flashcard-manager-modal
// handleImport)共用本模块,勿在各处复制解析逻辑。

import { Platform } from 'obsidian';

export interface NativeFileFilter {
    name: string;
    extensions: string[];
}

export type NativePickResult =
    | { status: 'ok'; filePath: string }
    | { status: 'cancelled' }
    | { status: 'unavailable' };

// Resolves @electron/remote in the renderer. Obsidian's own bootstrap loads it
// and patches it onto window.electron.remote (verified in Obsidian 1.11.x's
// app.js), which is why the first lookup wins on current desktop builds; the
// direct require() calls cover older/other setups. Returns null when
// unavailable (mobile, stripped-down Electron), letting callers fall back.
export function getElectronRemote(): unknown | null {
    if (!Platform.isDesktop) return null;
    const w = window as unknown;
    try {
        const remote = w.electron?.remote
            ?? w.require?.('@electron/remote')
            ?? w.require?.('electron')?.remote;
        return remote?.dialog ? remote : null;
    } catch {
        return null;
    }
}

// Opens the native open-file dialog. Returns the chosen absolute path with
// backslashes normalized to '/', 'cancelled' when the user closed the dialog,
// or 'unavailable' when the native dialog cannot be used at all (mobile /
// no @electron/remote / dialog threw) — callers should fall back to a hidden
// file input on 'unavailable' only.
export async function showNativeOpenDialog(filters: NativeFileFilter[]): Promise<NativePickResult> {
    const remote = getElectronRemote();
    if (!remote) return { status: 'unavailable' };

    try {
        const options = { properties: ['openFile'], filters };
        const win = remote.getCurrentWindow?.();
        const res = win
            ? await remote.dialog.showOpenDialog(win, options)
            : await remote.dialog.showOpenDialog(options);
        if (!res || res.canceled || !res.filePaths?.length) {
            return { status: 'cancelled' };
        }
        return { status: 'ok', filePath: res.filePaths[0].replace(/\\/g, '/') };
    } catch {
        return { status: 'unavailable' };
    }
}
