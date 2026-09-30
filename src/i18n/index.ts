/**
 * Plugin-level i18n system.
 *
 * The main / junior editions are Chinese-only. This module is retained so the
 * many existing `t()` / `getLocale()` call sites keep working unchanged, but
 * there is now exactly one locale (zh-CN) and no language switcher.
 */

import zhCN from './zh';

export type Locale = 'zh-CN';

const translations: Record<Locale, unknown> = {
	'zh-CN': zhCN,
};

let currentLocale: Locale = 'zh-CN';

export function getLocale(): Locale {
	return currentLocale;
}

/**
 * Translate a key with optional parameter interpolation.
 * @param key Dot-separated path, e.g. 'settings.uiLanguage'
 * @param params Optional parameters for interpolation, e.g. { count: 5 }
 */
export function t(key: string, params?: Record<string, unknown>): string {
	const keys = key.split('.');
	let result: unknown = translations[currentLocale];

	for (const k of keys) {
		if (result && typeof result === 'object' && k in result) {
			result = result[k];
		} else {
			return key;
		}
	}

	if (typeof result === 'string') {
		if (params) {
			return result.replace(/\{(\w+)\}/g, (match, paramKey) => {
				const v = params[paramKey];
				if (v === undefined) return match;
				return typeof v === 'object' || typeof v === 'function' ? JSON.stringify(v) : String(v);
			});
		}
		return result;
	}

	return key;
}

export function initI18n(_locale?: Locale): void {
	currentLocale = 'zh-CN';
}
