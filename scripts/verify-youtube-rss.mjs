import esbuild from 'esbuild';
import { writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, 'scripts/.tmp-youtube-rss.cjs');
let passed = 0;
let failed = 0;
const assert = (name, condition) => condition ? (passed++, console.log(`  ✓ ${name}`)) : (failed++, console.error(`  ✗ ${name}`));

try {
    const result = await esbuild.build({ entryPoints: [join(root, 'src/services/youtube-rss.ts')], bundle: true, format: 'cjs', platform: 'node', target: 'es2020', external: ['obsidian'], write: false, logLevel: 'silent' });
    writeFileSync(tmp, result.outputFiles[0].text);
    const require = createRequire(import.meta.url);
    const rss = require(tmp);
    global.DOMParser = class {
        parseFromString(xml) {
            const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
            const text = (body, tag) => body.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] || '';
            const attr = (body) => body.match(/<link[^>]+rel="alternate"[^>]+href="([^"]+)"/)?.[1] || '';
            return { querySelector: () => null, getElementsByTagName: () => entries.map((body) => ({ getElementsByTagName: (tagName) => [{ textContent: text(body, tagName.replace('yt:', '')) }], querySelector: (selector) => {
                const tag = selector.replace('yt\\:', '').replace(' ', '>').split('>')[0];
                const value = tag === 'link' ? attr(body) : text(body, tag);
                return value ? { textContent: value, getAttribute: () => value } : null;
            }})) };
        }
    };
    const xml = '<feed><entry><id>yt:video:abcdefghijk</id><yt:channelId>UC123</yt:channelId><title>Hello</title><link rel="alternate" href="https://www.youtube.com/watch?v=abcdefghijk"/><author><name>Channel</name></author><published>2026-08-31T00:00:00Z</published></entry></feed>';
    const parsed = rss.parseYouTubeFeed(xml);
    assert('parses one entry', parsed.length === 1);
    assert('extracts video id', parsed[0]?.videoId === 'abcdefghijk');
    assert('builds thumbnail', parsed[0]?.thumbnailUrl.includes('abcdefghijk'));
    assert('extracts channel input', rss.extractChannelId('https://www.youtube.com/channel/UC_abc123456789012345') === 'UC_abc123456789012345');
    assert('extracts channel html id', rss.extractChannelIdFromHtml('<meta itemprop="channelId" content="UC_abc123456789012345">') === 'UC_abc123456789012345');
    const subscription = { id: 'one', channelId: 'UC_abc123456789012345', channelName: 'One', channelUrl: '', feedUrl: '', createdAt: 1, lastCheckedAt: 0 };
    const first = rss.mergeYouTubeItems([], parsed, subscription, 1);
    const second = rss.mergeYouTubeItems(first, [{ ...parsed[0], videoId: 'lmnopqrstuv' }], { ...subscription, id: 'two' }, 2);
    assert('merges items from multiple subscriptions', second.length === 2);
    assert('preserves prior item status', rss.mergeYouTubeItems(first.map((item) => ({ ...item, status: 'imported' })), parsed, subscription, 3)[0].status === 'imported');
    console.log(`\n${passed} passed, ${failed} failed`);
} catch (error) {
    console.error(error);
    failed++;
} finally {
    try { unlinkSync(tmp); } catch {}
}
if (failed) process.exit(1);
