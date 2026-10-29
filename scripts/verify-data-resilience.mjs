// Verifies the pure logic behind flashcard data resilience (4.2.1):
// 1) vault-id-store  — stable vault identity sidecar (rename/move-proof DB name)
// 2) flashcard-backup — backup parse/serialize, file-name rotation, restore merge
// Bundles the TS services with esbuild, so it also catches syntax errors.
// Run: node scripts/verify-data-resilience.mjs

import esbuild from 'esbuild';
import { writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmpVaultId = join(root, 'scripts/.tmp-vault-id-store.cjs');
const tmpBackup = join(root, 'scripts/.tmp-flashcard-backup.cjs');
let passed = 0;
let failed = 0;
const assert = (name, condition) => condition ? (passed++, console.log(`  ✓ ${name}`)) : (failed++, console.error(`  ✗ ${name}`));

try {
    const bundle = (entry) => esbuild.build({
        entryPoints: [join(root, 'src/services', entry)],
        bundle: true, format: 'cjs', platform: 'node', target: 'es2020',
        external: ['obsidian'], write: false, logLevel: 'silent',
    });
    const require = createRequire(import.meta.url);
    writeFileSync(tmpVaultId, (await bundle('vault-id-store.ts')).outputFiles[0].text);
    const vaultId = require(tmpVaultId);
    writeFileSync(tmpBackup, (await bundle('flashcard-backup.ts')).outputFiles[0].text);
    const backup = require(tmpBackup);

    // ── vault-id-store ────────────────────────────────────────────
    console.log('vault-id-store');
    assert('round-trips through serialize/parse', (() => {
        const state = { version: 1, vaultDbId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', updatedAt: 1725000000000 };
        const back = vaultId.parseVaultIdState(vaultId.serializeVaultIdState(state));
        return back !== null && back.vaultDbId === state.vaultDbId && back.updatedAt === state.updatedAt;
    })());
    assert('corrupt "{" -> null', vaultId.parseVaultIdState('{') === null);
    assert('non-object "[]" -> null', vaultId.parseVaultIdState('[]') === null);
    assert('empty vaultDbId -> null (regenerate path)', vaultId.parseVaultIdState('{"version":1,"vaultDbId":"","updatedAt":1}') === null);
    assert('missing updatedAt tolerated (0)', (() => {
        const back = vaultId.parseVaultIdState('{"version":1,"vaultDbId":"abc"}');
        return back !== null && back.vaultDbId === 'abc' && back.updatedAt === 0;
    })());
    assert('merge: disk wins over memory candidate', (() => {
        const file = { version: 1, vaultDbId: 'disk-id', updatedAt: 100 };
        const memory = { version: 1, vaultDbId: 'fresh-id', updatedAt: 200 };
        return vaultId.mergeVaultIdState(file, memory).vaultDbId === 'disk-id';
    })());
    assert('merge: no disk value -> memory adopted', (() => {
        const memory = { version: 1, vaultDbId: 'fresh-id', updatedAt: 200 };
        const merged = vaultId.mergeVaultIdState(null, memory);
        return merged.vaultDbId === 'fresh-id' && merged.updatedAt === 200;
    })());
    assert('merge is idempotent', (() => {
        const file = { version: 1, vaultDbId: 'disk-id', updatedAt: 100 };
        const memory = { version: 1, vaultDbId: 'fresh-id', updatedAt: 200 };
        const once = vaultId.mergeVaultIdState(file, memory);
        const twice = vaultId.mergeVaultIdState(once, memory);
        return JSON.stringify(once) === JSON.stringify(twice);
    })());

    // ── flashcard-backup: parse / serialize ───────────────────────
    console.log('flashcard-backup parse/serialize');
    assert('round-trips a full backup', (() => {
        const payload = {
            version: 1, createdAt: 1725000000000, vaultDbId: 'v-1',
            tables: {
                vocabulary: [{ id: 'a', word: 'apple', language: 'english', fsrsData: { reps: 3 } }],
                reviewLogs: [{ logId: 'l1', vocabId: 'a' }],
                vocabTests: [{ id: 't1' }], vocabSizeState: [{ id: 'english' }],
                petState: [{ id: 'pet' }], deletedCardTombstones: [{ id: 'gone' }],
            },
        };
        const back = backup.parseBackup(backup.serializeBackup(payload));
        return back !== null && back.version === 1 && back.createdAt === 1725000000000
            && back.tables.vocabulary.length === 1 && back.tables.reviewLogs.length === 1
            && back.tables.vocabTests.length === 1 && back.tables.vocabSizeState.length === 1
            && back.tables.petState.length === 1 && back.tables.deletedCardTombstones.length === 1;
    })());
    assert('corrupt JSON -> null', backup.parseBackup('not json') === null);
    assert('array -> null', backup.parseBackup('[1,2]') === null);
    assert('missing version -> null', backup.parseBackup('{"createdAt":1,"tables":{}}') === null);
    assert('missing tables -> empty tables, not null', (() => {
        const back = backup.parseBackup('{"version":1}');
        return back !== null && back.tables.vocabulary.length === 0 && back.tables.reviewLogs.length === 0;
    })());
    assert('null/non-object rows filtered out', (() => {
        const back = backup.parseBackup('{"version":1,"tables":{"vocabulary":[null,5,{"id":"a"},"x"],"reviewLogs":[]}}');
        return back !== null && back.tables.vocabulary.length === 1 && back.tables.vocabulary[0].id === 'a';
    })());

    // ── flashcard-backup: file names & rotation ───────────────────
    console.log('flashcard-backup file names & rotation');
    assert('file name has fixed-width 14-digit stamp', (() => {
        const name = backup.buildBackupFileName(new Date(2026, 9, 29, 8, 5, 3));
        return name === 'flashcards-20261029080503.json';
    })());
    assert('file name round-trips to its timestamp', (() => {
        const when = new Date(2026, 9, 29, 8, 5, 3);
        return backup.parseBackupFileName(backup.buildBackupFileName(when)) === when.getTime();
    })());
    assert('non-backup file name -> null', backup.parseBackupFileName('data.json') === null);
    assert('lexicographic order equals time order (same century)', (() => {
        const a = backup.buildBackupFileName(new Date(2026, 0, 1, 0, 0, 0));
        const b = backup.buildBackupFileName(new Date(2026, 11, 31, 23, 59, 59));
        return a < b;
    })());
    assert('rotation keeps newest N, drops older & foreign names', (() => {
        const names = [
            'flashcards-20260101000000.json',
            'flashcards-20260601120000.json',
            'flashcards-20261029120000.json',
            'flashcards-20261028120000.json',
            'notes.md', 'flashcards-broken.json', 'data.json',
            'flashcards-20260315090000.json',
        ];
        const kept = backup.selectBackupsToKeep(names, 3);
        return kept.length === 3 && kept[0] === 'flashcards-20261029120000.json'
            && kept[1] === 'flashcards-20261028120000.json'
            && kept[2] === 'flashcards-20260601120000.json';
    })());
    assert('rotation keep is at least 1', backup.selectBackupsToKeep(['flashcards-20260101000000.json'], 0).length === 1);

    // ── flashcard-backup: restore merge plan ──────────────────────
    console.log('flashcard-backup restore merge plan');
    const row = (id, word, reps, language = 'english') => ({ id, word, language, fsrsData: { reps } });
    assert('new words are kept', (() => {
        const plan = backup.planVocabularyMerge([], [row('a', 'apple', 0)]);
        return plan.keepIncoming.length === 1 && plan.skipCount === 0 && plan.replaceCurrentIds.length === 0;
    })());
    assert('duplicate word, incoming lower reps -> skipped', (() => {
        const plan = backup.planVocabularyMerge([row('cur', 'apple', 10)], [row('new', 'apple', 3)]);
        return plan.keepIncoming.length === 0 && plan.skipCount === 1 && plan.replaceCurrentIds.length === 0;
    })());
    assert('duplicate word, incoming higher reps -> replaces current', (() => {
        const plan = backup.planVocabularyMerge([row('cur', 'apple', 10)], [row('old', 'apple', 50)]);
        return plan.keepIncoming.length === 1 && plan.keepIncoming[0].id === 'old'
            && plan.replaceCurrentIds.length === 1 && plan.replaceCurrentIds[0] === 'cur' && plan.skipCount === 0;
    })());
    assert('equal reps -> keep current (re-import is idempotent)', (() => {
        const plan = backup.planVocabularyMerge([row('cur', 'apple', 10)], [row('other', 'apple', 10)]);
        return plan.keepIncoming.length === 0 && plan.skipCount === 1;
    })());
    assert('same word in different languages does not collide', (() => {
        const plan = backup.planVocabularyMerge([row('cur', 'hand', 1, 'english')], [row('de', 'hand', 1, 'german')]);
        return plan.keepIncoming.length === 1 && plan.skipCount === 0;
    })());
    assert('incoming internal duplicates: only highest reps survives', (() => {
        const plan = backup.planVocabularyMerge([], [row('x', 'apple', 2), row('y', 'apple', 9), row('z', 'apple', 5)]);
        return plan.keepIncoming.length === 1 && plan.keepIncoming[0].id === 'y' && plan.skipCount === 2;
    })());
    assert('missing fsrsData treated as reps 0, not a crash', (() => {
        const plan = backup.planVocabularyMerge([row('cur', 'apple', 0)], [{ id: 'n', word: 'apple', language: 'english' }]);
        return plan.skipCount === 1;
    })());
    assert('same id & word with equal reps -> no self-replacement', (() => {
        const plan = backup.planVocabularyMerge([row('a', 'apple', 7)], [row('a', 'apple', 7)]);
        return plan.keepIncoming.length === 0 && plan.replaceCurrentIds.length === 0 && plan.skipCount === 1;
    })());

    // ── flashcard-backup: state-table merge ───────────────────────
    console.log('flashcard-backup state-table merge');
    assert('rows with existing ids are dropped, new ids pass', (() => {
        const kept = backup.rowsMissingIds(new Set(['english']), [{ id: 'english' }, { id: 'german' }]);
        return kept.length === 1 && kept[0].id === 'german';
    })());
} catch (error) {
    failed++;
    console.error('✗ verify crashed:', error);
} finally {
    for (const tmp of [tmpVaultId, tmpBackup]) {
        try { unlinkSync(tmp); } catch { /* already gone */ }
    }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
