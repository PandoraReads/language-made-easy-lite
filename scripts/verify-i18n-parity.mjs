// Verifies that every locale file in src/i18n has exactly the same key
// structure as zh-CN (the source of truth) and preserves every
// {placeholder} token. Run: node scripts/verify-i18n-parity.mjs
// Bundles the locale TS files with esbuild, so it also catches syntax errors.

import { build } from 'esbuild';
import { existsSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = ['zh-CN', 'zh-TW', 'en', 'de', 'fr', 'es', 'ja', 'ko', 'ru', 'th'];
const SOURCE_FILE = 'zh-CN';

// The Simplified Chinese source of truth lives in zh.ts (historic name).
const FILE_NAMES = { 'zh-CN': 'zh' };

function fileNameOf(locale) {
	return FILE_NAMES[locale] ?? locale;
}

function localeImportName(locale) {
	return './' + fileNameOf(locale);
}

async function loadLocales() {
	for (const locale of LOCALES) {
		const file = join(rootDir, 'src', 'i18n', `${fileNameOf(locale)}.ts`);
		if (!existsSync(file)) {
			console.error(`✗ Missing locale file: src/i18n/${locale}.ts`);
			process.exit(1);
		}
	}
	const outfile = join(mkdtempSync(join(tmpdir(), 'lme-i18n-')), 'locales.cjs');
	await build({
		stdin: {
			contents: LOCALES.map(
				(locale, i) => `import l${i} from '${localeImportName(locale)}';`
			).join('\n') +
			`\nexport default { ${LOCALES.map((locale, i) => `'${locale}': l${i}`).join(', ')} };`,
			resolveDir: join(rootDir, 'src', 'i18n'),
			loader: 'ts',
		},
		bundle: true,
		format: 'cjs',
		platform: 'node',
		outfile,
		logLevel: 'silent',
	});
	const mod = await import(pathToFileURL(outfile).href);
	// CJS interop: Node wraps module.exports as { default: module.exports },
	// and esbuild's CJS output carries the ESM `default` binding one level down.
	const exported = mod.default?.default ?? mod.default;
	return exported;
}

function placeholdersOf(value) {
	return new Set(String(value).match(/\{(\w+)\}/g) ?? []);
}

let issues = 0;
function fail(message) {
	console.error('  ✗ ' + message);
	issues++;
}

function compareTrees(source, target, locale, path = '') {
	for (const key of Object.keys(source)) {
		const keyPath = path ? `${path}.${key}` : key;
		if (!(key in target)) {
			fail(`[${locale}] missing key: ${keyPath}`);
			continue;
		}
		const a = source[key];
		const b = target[key];
		if (a !== null && typeof a === 'object') {
			if (b === null || typeof b !== 'object') {
				fail(`[${locale}] ${keyPath} should be a nested object like zh-CN`);
				continue;
			}
			compareTrees(a, b, locale, keyPath);
		} else if (typeof a === 'string') {
			if (typeof b !== 'string') {
				fail(`[${locale}] ${keyPath} should be a string like zh-CN`);
				continue;
			}
			const missing = [...placeholdersOf(a)].filter((p) => !placeholdersOf(b).has(p));
			if (missing.length) {
				fail(`[${locale}] ${keyPath} lost placeholder(s): ${missing.join(' ')}`);
			}
		}
	}
	for (const key of Object.keys(target)) {
		if (!(key in source)) {
			const keyPath = path ? `${path}.${key}` : key;
			fail(`[${locale}] extra key not in zh-CN: ${keyPath}`);
		}
	}
}

const locales = await loadLocales();
const source = locales[SOURCE_FILE];

console.log(`Source of truth: src/i18n/${fileNameOf(SOURCE_FILE)}.ts`);
for (const locale of LOCALES) {
	if (locale === SOURCE_FILE) continue;
	console.log(`Checking src/i18n/${locale}.ts …`);
	compareTrees(source, locales[locale], locale);
}

if (issues > 0) {
	console.error(`\n✗ i18n parity check failed with ${issues} issue(s).`);
	process.exit(1);
}
console.log(`\n✓ All ${LOCALES.length - 1} locale files match zh-CN in structure and placeholders.`);
