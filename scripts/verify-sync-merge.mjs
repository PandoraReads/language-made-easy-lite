/**
 * 回归验证:importLanguageDataWithMerge 的同词不同 ID 冲突折叠。
 *
 * 背景(2026-09-01 修复):对端同步文件里存在与本地同 word 但不同 id 的卡片时,
 * bulkPut 撞 &[language+word] 唯一索引 → ConstraintError → 整个事务回滚 →
 * 周期同步每 3 分钟在同一文件上永久报错(watermark 永不推进)。
 * 与 3.2.2 修的 JSON 导入 ConstraintError 同源,本脚本复用其 fake-indexeddb 验证法。
 *
 * 运行:npm run test:sync-merge
 */
import esbuild from 'esbuild';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fakeIndexedDB, { IDBKeyRange } from 'fake-indexeddb';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmpDir = join(root, 'scripts/.tmp-sync-merge');
mkdirSync(tmpDir, { recursive: true });
const stub = join(tmpDir, 'obsidian-stub.cjs');
const tmp = join(tmpDir, 'db.cjs');
let passed = 0;
let failed = 0;
const assert = (name, condition) => condition ? (passed++, console.log(`  ✓ ${name}`)) : (failed++, console.error(`  ✗ ${name}`));

try {
    writeFileSync(stub, 'exports.Platform = { isDesktop: false };\n');
    const result = await esbuild.build({
        entryPoints: [join(root, 'src/core/Database.ts')],
        bundle: true, format: 'cjs', platform: 'node', target: 'es2020',
        alias: { obsidian: stub },
        write: false, logLevel: 'silent',
    });
    writeFileSync(tmp, result.outputFiles[0].text);

    globalThis.indexedDB = fakeIndexedDB;
    globalThis.IDBKeyRange = IDBKeyRange;

    const require = createRequire(import.meta.url);
    const { LMEDatabase } = require(tmp);
    const db = new LMEDatabase('verify-sync-merge');

    const NOW = 1800000000000;
    const fsrs = (last_review) => ({
        due: NOW, stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1,
        reps: 1, lapses: 0, state: 2, last_review,
    });
    const card = (over = {}) => ({
        id: 'card-A', word: 'audacious', language: 'english',
        definition: 'local def', phonetic: '', partOfSpeech: 'adj',
        contextSnippet: '', contextTranslation: '',
        addedTime: NOW - 100000, fsrsData: fsrs(NOW - 50000), ...over,
    });
    const log = (over = {}) => ({
        logId: 'log-1', vocabId: 'card-A', reviewTime: NOW - 50000,
        rating: 3, scheduledDays: 1, stateBefore: 2, language: 'english', ...over,
    });

    // ── 场景 1:对端同词不同 ID → 折叠进本地卡,不抛 ConstraintError ──
    await db.vocabulary.put(card());
    let threw = null;
    try {
        await db.importLanguageDataWithMerge('english', {
            vocabulary: [
                card({ id: 'card-B', definition: 'peer def (richer)', phonetic: '/ɔːˈdeɪʃəs/' }),
                // 同一载荷里再来一张同词第三 ID,也必须收敛成一个
                card({ id: 'card-C', definition: 'third dup' }),
            ],
            reviewLogs: [log({ logId: 'log-P', vocabId: 'card-B' })],
        });
    } catch (e) { threw = e; }
    assert('same-word different-id import no longer throws', threw === null);
    const after = await db.vocabulary.toArray();
    assert('exactly one card for the word survives', after.length === 1 && after[0].word === 'audacious');
    assert('local card identity (id) wins', after[0].id === 'card-A');
    assert('content enriched from peer (definition)', after[0].definition === 'peer def (richer)');
    assert('content enriched from peer (phonetic)', after[0].phonetic === '/ɔːˈdeɪʃəs/');
    assert('local fsrsData preserved', after[0].fsrsData.last_review === NOW - 50000);
    const logs = await db.reviewLogs.toArray();
    const peerLog = logs.find((l) => l.logId === 'log-P');
    assert('peer review log remapped to surviving card id', peerLog !== undefined && peerLog.vocabId === 'card-A');

    // ── 场景 2:同 ID 常规 LWW 语义不变 ──
    await db.importLanguageDataWithMerge('english', {
        vocabulary: [card({ definition: 'newer via same id', fsrsData: fsrs(NOW - 1000) })],
    });
    const lww = (await db.vocabulary.toArray())[0];
    assert('same-id newer peer still overwrites', lww.definition === 'newer via same id');
    await db.importLanguageDataWithMerge('english', {
        vocabulary: [card({ definition: 'stale via same id', fsrsData: fsrs(NOW - 99999) })],
    });
    const kept = (await db.vocabulary.toArray())[0];
    assert('same-id stale peer still ignored', kept.definition === 'newer via same id');

    // ── 场景 3:全新词正常插入,added 计数正确 ──
    const r3 = await db.importLanguageDataWithMerge('english', {
        vocabulary: [card({ id: 'card-D', word: 'grapple with' })],
    });
    assert('genuinely new word inserted', (await db.vocabulary.where('word').equals('grapple with').toArray()).length === 1);
    assert('added count reflects the insert', r3.added === 1);

    // ── 场景 4:墓碑仍阻止复活 ──
    await db.deletedCardTombstones.put({ id: 'card-E', language: 'english', word: 'sully', deletedAt: NOW - 10 });
    await db.importLanguageDataWithMerge('english', {
        vocabulary: [card({ id: 'card-F', word: 'sully', addedTime: NOW - 50000 })],
        tombstones: [],
    });
    assert('tombstoned word not resurrected', (await db.vocabulary.where('word').equals('sully').toArray()).length === 0);

    // ── 场景 5:被对端墓碑删除的词,其"同词折叠"目标不应复活本地已删卡 ──
    await db.vocabulary.put(card({ id: 'card-G', word: 'zephyr' }));
    await db.deletedCardTombstones.put({ id: 'card-G', language: 'english', word: 'zephyr', deletedAt: NOW - 5 });
    await db.importLanguageDataWithMerge('english', {
        vocabulary: [card({ id: 'card-H', word: 'zephyr', addedTime: NOW - 99999 })],
    });
    assert('word deleted on this device stays deleted for stale incoming', (await db.vocabulary.where('word').equals('zephyr').toArray()).length === 0);
    await db.importLanguageDataWithMerge('english', {
        vocabulary: [card({ id: 'card-I', word: 'zephyr', addedTime: NOW - 1 })], // 删除后重建(更新的 addedTime)
    });
    assert('word re-created after deletion is preserved', (await db.vocabulary.where('word').equals('zephyr').toArray()).length === 1);

    console.log(failed === 0 ? `\n全部通过 (${passed})` : `\n失败 ${failed} / ${passed + failed}`);
    process.exitCode = failed === 0 ? 0 : 1;
} finally {
    try { unlinkSync(tmp); unlinkSync(stub); } catch { /* ignore */ }
}
