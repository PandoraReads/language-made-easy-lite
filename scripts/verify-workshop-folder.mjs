import esbuild from 'esbuild';
import { writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, 'scripts/.tmp-workshop-folder-store.cjs');
let passed = 0;
let failed = 0;
const assert = (name, condition) => condition ? (passed++, console.log(`  ✓ ${name}`)) : (failed++, console.error(`  ✗ ${name}`));

try {
    const result = await esbuild.build({ entryPoints: [join(root, 'src/services/workshop-folder-store.ts')], bundle: true, format: 'cjs', platform: 'node', target: 'es2020', external: ['obsidian'], write: false, logLevel: 'silent' });
    writeFileSync(tmp, result.outputFiles[0].text);
    const require = createRequire(import.meta.url);
    const store = require(tmp);

    // ── parse / serialize ────────────────────────────────────────────
    assert('round-trips through serialize/parse', (() => {
        const state = { version: 1, folder: '我的跟读/英语', updatedAt: 1725000000000 };
        const back = store.parseFolderState(store.serializeFolderState(state));
        return back !== null && back.folder === '我的跟读/英语' && back.updatedAt === 1725000000000;
    })());
    assert('corrupt "{" -> null', store.parseFolderState('{') === null);
    assert('corrupt "null" -> null', store.parseFolderState('null') === null);
    assert('corrupt "[]" -> null', store.parseFolderState('[]') === null);
    assert('corrupt "42" -> null', store.parseFolderState('42') === null);
    assert('tolerates missing fields', (() => {
        const s = store.parseFolderState('{"version":1}');
        return s !== null && s.folder === '' && s.updatedAt === 0;
    })());
    assert('sanitizes junk field types', (() => {
        const s = store.parseFolderState(JSON.stringify({ version: 'x', folder: 42, updatedAt: 'soon' }));
        return s !== null && s.folder === '' && s.updatedAt === 0 && s.version === 1;
    })());
    assert('emptyFolderState shape', (() => {
        const e = store.emptyFolderState();
        return e.version === 1 && e.folder === '' && e.updatedAt === 0;
    })());

    // ── mergeFolderState ─────────────────────────────────────────────
    const A = { version: 1, folder: 'A', updatedAt: 100 };
    const B = { version: 1, folder: 'B', updatedAt: 200 };
    assert('disk newer wins (peer update adopted)', store.mergeFolderState(B, A).folder === 'B');
    assert('memory newer wins (local edit kept)', store.mergeFolderState(A, B).folder === 'B');
    assert('tie keeps disk value', store.mergeFolderState(A, { ...A, folder: 'other' }).folder === 'A');
    assert('seed (updatedAt 0) loses to any real write', store.mergeFolderState(A, { version: 1, folder: 'seed', updatedAt: 0 }).folder === 'A');
    assert('merge is idempotent', (() => {
        const once = store.mergeFolderState(B, A);
        const twice = store.mergeFolderState(once, A);
        return JSON.stringify(once) === JSON.stringify(twice);
    })());
    assert('merge result is a copy, not an alias', (() => {
        const merged = store.mergeFolderState(A, B);
        merged.folder = 'mutated';
        return B.folder === 'B';
    })());

    console.log(failed === 0 ? `\n全部通过 (${passed})` : `\n失败 ${failed} / ${passed + failed}`);
    process.exitCode = failed === 0 ? 0 : 1;
} finally {
    try { unlinkSync(tmp); } catch { /* 忽略清理失败 */ }
}
