import type { App } from 'obsidian';

/**
 * vault 级 UI 偏好读写(Obsidian App#save/loadLocalStorage)。
 * 首次读取时把旧版写在 window.localStorage 的值一次性迁移过来并清掉旧键,
 * 用户已有的视图偏好不丢;localStorage 不可用时静默降级。
 */

export function loadUiPref(app: App, key: string): string | null {
    try {
        const v: unknown = app.loadLocalStorage(key);
        if (typeof v === 'string' && v !== '') return v;
        const legacy = window.localStorage.getItem(key);
        if (legacy !== null) {
            app.saveLocalStorage(key, legacy);
            window.localStorage.removeItem(key);
        }
        return legacy;
    } catch {
        return null;
    }
}

export function saveUiPref(app: App, key: string, value: string): void {
    try {
        app.saveLocalStorage(key, value);
    } catch {
        // 存储不可用时静默:视图偏好只是体验增强,不值得打断用户
    }
}
