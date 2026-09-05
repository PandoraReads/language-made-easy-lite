/**
 * Unit tests for the SRT parser (src/utils/srt.ts).
 *
 * The util is dependency-free, so we bundle it with the project's existing
 * esbuild dependency into a temp CJS module and assert on representative
 * SRT inputs (basic, multi-line cues, CRLF+BOM, dot-ms separator, skipped
 * cues, hour rollover, end-to-end note body, empty/garbage input).
 *
 * Run:  npm run test:srt   (or:  node scripts/verify-srt-parser.mjs)
 */
import esbuild from 'esbuild';
import { writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TMP = join(__dirname, '.tmp-srt-parser.cjs');

let passed = 0;
let failed = 0;
function assert(name, cond, detail = '') {
	if (cond) {
		passed++;
		console.log(`  ✓ ${name}`);
	} else {
		failed++;
		console.error(`  ✗ ${name} ${detail}`);
	}
}
function eq(name, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	assert(name, ok, `\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
}

try {
	const result = await esbuild.build({
		entryPoints: [join(ROOT, 'src/utils/srt.ts')],
		bundle: true,
		format: 'cjs',
		platform: 'node',
		target: 'es2020',
		write: false,
		logLevel: 'silent',
	});
	writeFileSync(TMP, result.outputFiles[0].text);
	const require = createRequire(import.meta.url);
	const { parseSrt, formatTimestampForNote, segmentsToTimestampLines, buildSubtitleNoteBody } = require(TMP);

	console.log('SRT parser tests\n-----------------');

	// 1. Basic parse: count, times, text, cue index.
	const BASIC = '1\n00:00:01,000 --> 00:00:04,000\nHello world.\n\n2\n00:00:04,500 --> 00:00:06,000\nSecond line.\n';
	let s = parseSrt(BASIC);
	eq('basic: count', s.length, 2);
	eq('basic: start1', s[0].startSec, 1);
	eq('basic: end1', s[0].endSec, 4);
	eq('basic: text1', s[0].text, 'Hello world.');
	eq('basic: start2', s[1].startSec, 4.5);
	eq('basic: index2', s[1].index, 2);

	// 2. Multi-line cue collapses to a single space-joined line.
	s = parseSrt('1\n00:00:10,000 --> 00:00:12,000\nLine one\nLine two\n');
	eq('multiline: collapsed', s[0].text, 'Line one Line two');

	// 3. Tolerates BOM + CRLF + extra blank lines.
	const MESSY = '﻿1\r\n00:00:01,000 --> 00:00:02,000\r\nA\r\n\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nB\r\n';
	s = parseSrt(MESSY);
	eq('messy: count', s.length, 2);
	eq('messy: text0', s[0].text, 'A');
	eq('messy: text1', s[1].text, 'B');

	// 4. Accepts `.` ms separator and 1-digit hours, sub-second precision.
	s = parseSrt('1\n0:00:05.500 --> 0:00:07.250\nDot ms\n');
	eq('dot: start', s[0].startSec, 5.5);
	eq('dot: end', s[0].endSec, 7.25);

	// 5. Cues with no timestamp or empty text are skipped.
	s = parseSrt('1\n00:00:01,000 --> 00:00:02,000\n\n2\n00:00:03,000 --> 00:00:04,000\n   \n3\n00:00:05,000 --> 00:00:06,000\nReal\n');
	eq('skipped: count', s.length, 1);
	eq('skipped: text', s[0].text, 'Real');

	// 6. Timestamp formatting: <1h vs hour rollover.
	eq('fmt <1h', formatTimestampForNote(65), '[01:05]');
	eq('fmt >=1h', formatTimestampForNote(3723), '[1:02:03]');

	// 7. End-to-end: note lines + full body.
	const lines = segmentsToTimestampLines(parseSrt(BASIC));
	eq('lines', lines, '[00:01] Hello world.\n[00:04] Second line.');
	const body = buildSubtitleNoteBody('T', 'H', parseSrt(BASIC));
	assert('body: frontmatter', body.startsWith('---\n标题: "T"\n语言: ""\n时长: ""\n频道: ""\n链接: ""\n封面: ""\n创建: "'));
	assert('body: title', body.includes('\n# T\n'));
	assert('body: section', body.includes('## Subtitles\n'));
	assert('body: line', body.includes('[00:01] Hello world.'));

	// 8. Empty / garbage input is safe.
	eq('empty', parseSrt('').length, 0);
	eq('garbage', parseSrt('not an srt at all').length, 0);

	console.log(`\n${passed} passed, ${failed} failed`);
} catch (e) {
	console.error('SRT parser test harness error:', e);
	failed++;
} finally {
	try { unlinkSync(TMP); } catch { /* temp already gone */ }
}

if (failed > 0) process.exit(1);
