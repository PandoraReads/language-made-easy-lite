import esbuild from 'esbuild';
import { writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, 'scripts/.tmp-youtube-rss-store.cjs');
let passed = 0;
let failed = 0;
const assert = (name, condition) => condition ? (passed++, console.log(`  ✓ ${name}`)) : (failed++, console.error(`  ✗ ${name}`));

try {
    const result = await esbuild.build({ entryPoints: [join(root, 'src/services/youtube-rss-store.ts')], bundle: true, format: 'cjs', platform: 'node', target: 'es2020', external: ['obsidian'], write: false, logLevel: 'silent' });
    writeFileSync(tmp, result.outputFiles[0].text);
    const require = createRequire(import.meta.url);
    const store = require(tmp);
    const NOW = 1800000000000;

    const sub = (over = {}) => ({
        id: 'sub-1', channelId: 'UCxxxxxxxxxxxxxxxxxxx1', channelName: 'One',
        channelUrl: 'https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxx1',
        feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxxxxxxxxxxxxxxxxx1',
        createdAt: 100, lastCheckedAt: 200, ...over,
    });
    const item = (over = {}) => ({
        videoId: 'abcdefghijk', title: 'Hello', url: 'https://www.youtube.com/watch?v=abcdefghijk',
        channelId: 'UCxxxxxxxxxxxxxxxxxxx1', channelName: 'One',
        publishedAt: new Date(NOW - 86400000).toISOString(), updatedAt: new Date(NOW - 86400000).toISOString(),
        thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
        itemId: 'sub-1:abcdefghijk', subscriptionId: 'sub-1', discoveredAt: 300, status: 'new', ...over,
    });

    // ── parse / serialize ────────────────────────────────────────────
    const sample = store.emptyStore();
    sample.subscriptions.push(sub());
    sample.items.push(item());
    assert('round-trips through serialize/parse', (() => {
        const back = store.parseStore(store.serializeStore(sample));
        return back !== null && back.subscriptions.length === 1 && back.items[0].itemId === 'sub-1:abcdefghijk';
    })());
    assert('corrupt "{" -> null', store.parseStore('{') === null);
    assert('corrupt "null" -> null', store.parseStore('null') === null);
    assert('corrupt "[]" -> null', store.parseStore('[]') === null);
    assert('tolerates missing fields', (() => {
        const s = store.parseStore('{"version":1}');
        return s !== null && s.subscriptions.length === 0 && s.categories.length === 0 && s.items.length === 0;
    })());
    assert('sanitizes junk entries', (() => {
        const s = store.parseStore(JSON.stringify({ subscriptions: [{ channelId: '' }, null, 'x'], items: [{}], categories: [42, 'ok'], removed: { subscriptions: { a: 'bad', b: 5 } } }));
        return s !== null && s.subscriptions.length === 0 && s.items.length === 0
            && s.categories.length === 1 && s.categories[0] === 'ok' && s.removed.subscriptions.b === 5;
    })());
    assert('tolerates newer version', (() => {
        const s = store.parseStore(JSON.stringify({ version: 99, subscriptions: [sub()] }));
        return s !== null && s.subscriptions.length === 1;
    })());

    // ── migrateFromSettings ──────────────────────────────────────────
    {
        const { store: s, changed } = store.migrateFromSettings(store.emptyStore(), { subscriptions: [sub()], items: [item()], categories: ['News'] });
        assert('migrates legacy into empty store', changed === true && s.subscriptions.length === 1 && s.items.length === 1 && s.categories[0] === 'News');
    }
    {
        const base = store.emptyStore();
        base.subscriptions.push(sub({ category: 'Kept' }));
        base.items.push(item({ status: 'imported', notePath: 'notes/a.md' }));
        const { store: s, changed } = store.migrateFromSettings(base, {
            subscriptions: [sub({ category: 'Legacy' }), sub({ id: 'sub-2', channelId: 'UCyyyyyyyyyyyyyyyyyyy2', createdAt: 500 })],
            items: [item({ status: 'read' }), item({ itemId: 'sub-2:zzzzzzzzzzz', subscriptionId: 'sub-2' })],
            categories: ['Kept', 'Extra'],
        });
        assert('sidecar wins on existing channelId', s.subscriptions.find((x) => x.channelId === sub().channelId).category === 'Kept');
        assert('appends missing subscription', s.subscriptions.some((x) => x.id === 'sub-2'));
        assert('appends missing item', s.items.some((x) => x.itemId === 'sub-2:zzzzzzzzzzz'));
        assert('existing item untouched', s.items.find((x) => x.itemId === 'sub-1:abcdefghijk').status !== 'read');
    }
    {
        const base = store.emptyStore();
        base.removed.subscriptions[sub().channelId] = 900;
        const blocked = store.migrateFromSettings(base, { subscriptions: [sub({ createdAt: 100 })] });
        assert('tombstone blocks legacy resurrection', blocked.store.subscriptions.length === 0 && blocked.changed === false);
        const readd = store.migrateFromSettings(base, { subscriptions: [sub({ id: 'sub-new', createdAt: 1000 })] });
        assert('re-added (new createdAt) passes tombstone', readd.store.subscriptions.length === 1 && readd.changed === true);
    }
    {
        const { store: s } = store.migrateFromSettings(store.emptyStore(), { subscriptions: [], items: [item({ subscriptionId: 'ghost' })] });
        assert('drops orphan legacy items', s.items.length === 0);
    }

    // ── mergeStores ──────────────────────────────────────────────────
    {
        const f = store.emptyStore();
        f.subscriptions.push(sub());
        f.categories.push('A', 'B');
        const m = store.emptyStore();
        m.subscriptions.push(sub({ id: 'sub-1m', createdAt: 150, lastCheckedAt: 180, etag: 'W/"m"', category: 'News' }), sub({ id: 'sub-2', channelId: 'UCyyyyyyyyyyyyyyyyyyy2', createdAt: 400 }));
        m.categories.push('B', 'C');
        const merged = store.mergeStores(f, m, NOW);
        assert('unions subscriptions by channelId', merged.subscriptions.length === 2);
        const one = merged.subscriptions.find((x) => x.channelId === sub().channelId);
        assert('createdAt takes min', one.createdAt === 100);
        assert('lastCheckedAt takes max', one.lastCheckedAt === 200);
        assert('etag from newer side (file)', one.etag === undefined);
        assert('id from file side', one.id === 'sub-1');
        assert('merges channelUrl/feedUrl intact', one.channelUrl === sub().channelUrl && one.feedUrl === sub().feedUrl);
        assert('category from memory side', one.category === 'News');
        assert('categories union file-order-first', JSON.stringify(merged.categories) === JSON.stringify(['A', 'B', 'C']));
    }
    {
        const f = store.emptyStore();
        f.removed.subscriptions['UCxxxxxxxxxxxxxxxxxxx1'] = 900;
        const m = store.emptyStore();
        m.subscriptions.push(sub({ createdAt: 100 }));
        const merged = store.mergeStores(f, m, NOW);
        assert('tombstone blocks stale-memory resurrection', merged.subscriptions.length === 0);
        assert('tombstone preserved through merge', merged.removed.subscriptions['UCxxxxxxxxxxxxxxxxxxx1'] === 900);
        const m2 = store.emptyStore();
        m2.subscriptions.push(sub({ id: 'sub-new', createdAt: 1000 }));
        assert('re-add (new createdAt) survives merge', store.mergeStores(f, m2, NOW).subscriptions.length === 1);
    }
    {
        const f = store.emptyStore();
        f.removed.categories['Old'] = 900;
        f.categories.push('Old', 'Kept');
        const m = store.emptyStore();
        m.categories.push('Old', 'New');
        const merged = store.mergeStores(f, m, NOW);
        assert('tombstoned category skipped', !merged.categories.includes('Old') && merged.categories.includes('Kept') && merged.categories.includes('New'));
    }
    {
        const mk = (status, over = {}) => { const f = store.emptyStore(); f.subscriptions.push(sub()); f.items.push(item({ status, ...over })); return f; };
        assert('rank: read beats new', store.mergeStores(mk('read'), mk('new'), NOW).items[0].status === 'read');
        assert('rank: failed beats read', store.mergeStores(mk('read'), mk('failed', { error: 'boom' }), NOW).items[0].status === 'failed');
        assert('rank: imported beats failed', store.mergeStores(mk('failed', { error: 'boom' }), mk('imported'), NOW).items[0].status === 'imported');
        assert('both failed: non-empty error wins', store.mergeStores(mk('failed', { error: '' }), mk('failed', { error: 'boom' }), NOW).items[0].error === 'boom');
        assert('notePath: non-empty wins over higher rank', store.mergeStores(mk('imported'), mk('read', { notePath: 'notes/x.md' }), NOW).items[0].notePath === 'notes/x.md');
        assert('discoveredAt takes min', store.mergeStores(mk('new', { discoveredAt: 500 }), mk('read', { discoveredAt: 300 }), NOW).items[0].discoveredAt === 300);
    }
    {
        const f = store.emptyStore();
        f.subscriptions.push(sub());
        f.items.push(item());
        const m = store.emptyStore();
        m.items.push(item({ itemId: 'ghost:abcdefghijk', subscriptionId: 'ghost' }));
        assert('orphan items dropped on merge', store.mergeStores(f, m, NOW).items.length === 1);
    }
    {
        const f = store.emptyStore();
        f.subscriptions.push(sub());
        f.items.push(item({ status: 'read' }));
        const m = store.emptyStore();
        m.subscriptions.push(sub());
        m.items.push(item({ status: 'read' }));
        const once = store.serializeStore(store.mergeStores(f, m, NOW));
        const twice = store.serializeStore(store.mergeStores(store.parseStore(once), m, NOW));
        assert('merge is idempotent', once === twice);
    }

    // ── transforms ───────────────────────────────────────────────────
    {
        const base = store.emptyStore();
        base.removed.subscriptions['UCxxxxxxxxxxxxxxxxxxx1'] = 900;
        base.removed.categories['News'] = 900;
        const upserted = store.upsertSubscription(base, sub({ createdAt: 1000 }));
        assert('upsertSubscription clears tombstone', upserted.removed.subscriptions['UCxxxxxxxxxxxxxxxxxxx1'] === undefined);
        assert('addCategoryToStore clears tombstone', store.addCategoryToStore(upserted, 'News').removed.categories['News'] === undefined);
    }
    {
        const base = store.emptyStore();
        base.subscriptions.push(sub());
        base.items.push(item(), item({ videoId: 'lmnopqrstuv', itemId: 'sub-1:lmnopqrstuv' }));
        const deleted = store.deleteSubscription(base, 'sub-1', 999);
        assert('deleteSubscription removes sub and items', deleted.subscriptions.length === 0 && deleted.items.length === 0);
        assert('deleteSubscription writes tombstone', deleted.removed.subscriptions['UCxxxxxxxxxxxxxxxxxxx1'] === 999);
        assert('deleteSubscription is idempotent', store.deleteSubscription(deleted, 'sub-1', 1000) === deleted);
    }
    {
        const base = store.emptyStore();
        base.categories.push('News');
        base.subscriptions.push(sub({ category: 'News' }));
        const removed = store.removeCategoryFromStore(base, 'News', 999);
        assert('removeCategory detaches subs', removed.subscriptions[0].category === undefined);
        assert('removeCategory tombstones name', removed.removed.categories['News'] === 999);
    }
    {
        const base = store.emptyStore();
        base.items.push(item({ status: 'imported', notePath: 'a.md' }));
        const patched = store.patchItem(base, 'sub-1:abcdefghijk', { status: 'failed', error: 'boom' });
        assert('patchItem replaces status', patched.items[0].status === 'failed');
        assert('patchItem preserves untouched fields', patched.items[0].notePath === 'a.md');
    }
    {
        const base = store.emptyStore();
        base.subscriptions.push(sub());
        base.items.push(item({ status: 'read' }));
        const refreshed = store.upsertItems(base, [item({ status: 'new' })]);
        assert('upsertItems rank-merges (read survives refresh)', refreshed.items[0].status === 'read');
    }

    // ── retention / tombstone pruning ────────────────────────────────
    {
        const base = store.emptyStore();
        base.subscriptions.push(sub());
        const old = item({ videoId: 'oldoldold01', itemId: 'sub-1:oldoldold01', publishedAt: new Date(NOW - 91 * 86400000).toISOString() });
        const recent = item({ videoId: 'recentvide1', itemId: 'sub-1:recentvide1', publishedAt: new Date(NOW - 86400000).toISOString() });
        const broken = item({ videoId: 'broketime1', itemId: 'sub-1:broketime1', publishedAt: 'not-a-date' });
        const retained = store.applyRetention({ ...base, items: [old, recent, broken] }, NOW);
        assert('retention drops items older than window', !retained.items.some((i) => i.itemId === 'sub-1:oldoldold01'));
        assert('retention keeps recent and unparseable', retained.items.length === 2);
    }
    {
        const base = store.emptyStore();
        for (let i = 0; i < 2001; i++) base.items.push(item({ videoId: `vid${String(i).padStart(11, '0').slice(0, 11)}`, itemId: `sub-1:vid${i}`, publishedAt: new Date(NOW - i * 60000).toISOString() }));
        assert('retention caps at MAX_ITEMS', store.applyRetention(base, NOW).items.length === 2000);
    }
    {
        const base = store.emptyStore();
        for (let i = 1; i <= 150; i++) base.removed.subscriptions[`UC${String(i).padStart(22, '0')}`] = i;
        const pruned = store.pruneTombstones(base);
        assert('prunes tombstones to newest 100', Object.keys(pruned.removed.subscriptions).length === 100 && pruned.removed.subscriptions['UC' + String(150).padStart(22, '0')] === 150 && pruned.removed.subscriptions['UC' + String(50).padStart(22, '0')] === undefined);
    }

    console.log(`\n${passed} passed, ${failed} failed`);
} catch (error) {
    console.error(error);
    failed++;
} finally {
    try { unlinkSync(tmp); } catch {}
}
if (failed) process.exit(1);
