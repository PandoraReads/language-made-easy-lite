/**
 * Plugin-level i18n system.
 *
 * The UI language is auto-detected once at plugin startup from Obsidian's own
 * language setting; there is no in-plugin switcher. Detection order:
 *   1. localStorage 'language' — where Obsidian persists its language choice
 *   2. window.moment.locale()  — Obsidian keeps moment in sync with that choice
 *   3. navigator.language(s)   — host system language
 *   4. fallback 'en'
 * Locales without a matching language pack fall back to English.
 */

import zhCN from './zh';
import zhTW from './zh-TW';
import en from './en';
import de from './de';
import fr from './fr';
import es from './es';
import ja from './ja';
import ko from './ko';
import ru from './ru';
import th from './th';

export type Locale = 'zh-CN' | 'zh-TW' | 'en' | 'de' | 'fr' | 'es' | 'ja' | 'ko' | 'ru' | 'th';

const translations: Record<Locale, typeof zhCN> = {
	'zh-CN': zhCN,
	'zh-TW': zhTW,
	en,
	de,
	fr,
	es,
	ja,
	ko,
	ru,
	th,
};

let currentLocale: Locale = 'zh-CN';

export function getLocale(): Locale {
	return currentLocale;
}

/** English name of each UI language (used inside English AI prompt text). */
const UI_LANGUAGE_EN_NAMES: Record<Locale, string> = {
	'zh-CN': 'Simplified Chinese',
	'zh-TW': 'Traditional Chinese',
	en: 'English',
	de: 'German',
	fr: 'French',
	es: 'Spanish',
	ja: 'Japanese',
	ko: 'Korean',
	ru: 'Russian',
	th: 'Thai',
};

/** English name of the current UI language, e.g. "German" — for prompt text. */
export function uiLanguageEnglishName(): string {
	return UI_LANGUAGE_EN_NAMES[currentLocale];
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
			result = (result as Record<string, unknown>)[k];
		} else {
			return key;
		}
	}

	if (typeof result === 'string') {
		if (params) {
			return result.replace(/\{(\w+)\}/g, (match: string, paramKey: string): string => {
				const v = params[paramKey];
				if (v === undefined) return match;
				if (v === null || typeof v === 'object' || typeof v === 'function') return JSON.stringify(v);
				const primitive = v as string | number | bigint | boolean | symbol;
				return String(primitive);
			});
		}
		return result;
	}

	return key;
}

/** Obsidian language codes / BCP-47 tags → supported plugin locale. */
const LANGUAGE_ALIASES: Record<string, Locale> = {
	zh: 'zh-CN',
	'zh-cn': 'zh-CN',
	'zh-hans': 'zh-CN',
	'zh-tw': 'zh-TW',
	'zh-hk': 'zh-TW',
	'zh-mo': 'zh-TW',
	'zh-hant': 'zh-TW',
	en: 'en',
	'en-gb': 'en',
	'en-us': 'en',
	'en-au': 'en',
	'en-ca': 'en',
	de: 'de',
	fr: 'fr',
	es: 'es',
	'es-419': 'es',
	'es-mx': 'es',
	ja: 'ja',
	ko: 'ko',
	ru: 'ru',
	th: 'th',
};

function normalizeLocale(code: string): Locale | null {
	const lower = code.trim().toLowerCase().replace(/_/g, '-');
	if (!lower) return null;
	if (LANGUAGE_ALIASES[lower]) return LANGUAGE_ALIASES[lower];
	return LANGUAGE_ALIASES[lower.split('-')[0]] ?? null;
}

/** Detect the UI locale from Obsidian's language setting (no user-facing switcher). */
export function detectLocale(): Locale {
	// 1. Obsidian persists its language choice in localStorage under 'language'.
	try {
		const raw = window.localStorage.getItem('language');
		if (raw) {
			const mapped = normalizeLocale(raw);
			if (mapped) return mapped;
		}
	} catch {
		// localStorage unavailable — fall through.
	}
	// 2. Obsidian keeps moment's locale in sync with its language setting.
	try {
		const moment = (window as unknown as { moment?: { locale?: () => string } }).moment;
		const raw = moment && typeof moment.locale === 'function' ? moment.locale() : '';
		if (raw) {
			const mapped = normalizeLocale(raw);
			if (mapped) return mapped;
		}
	} catch {
		// Fall through.
	}
	// 3. Host system language.
	try {
		const nav = navigator as Navigator & { languages?: readonly string[] };
		const candidates = nav.languages?.length ? nav.languages : [navigator.language];
		for (const candidate of candidates) {
			if (!candidate) continue;
			const mapped = normalizeLocale(candidate);
			if (mapped) return mapped;
		}
	} catch {
		// Fall through.
	}
	return 'en';
}

/**
 * Initialize the UI locale. Without an explicit locale the plugin follows
 * Obsidian's language setting (see detectLocale).
 */
export function initI18n(locale?: Locale): void {
	currentLocale = locale ?? detectLocale();
}
