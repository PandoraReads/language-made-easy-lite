// ============================================================
// Language Made Easy - Shadowing Workshop note parsing utilities
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// ============================================================
//
// Pure helpers that derive display properties for the Workshop catalog
// from a video note's body + frontmatter. Consumed by the catalog view
// (src/views/workshop-catalog-view.ts) only. Kept type-checked and
// dependency-light so the @ts-nocheck view file can import safe shapes.
//
// Three layers of properties (see PLAN: binary-crafting-beacon.md):
//   - derived from body:    title, duration, segmentCount, wordCount, dateAdded, hasVideo, source
//   - frontmatter (Obsidian Properties panel): 频道/channel, tags, 封面/cover (image link)
//   - plugin-tracked:        practiced, practiceCount, lastPracticedAt (passed in by the view)

import type { App, TFile } from 'obsidian';

export type NoteSource = 'youtube' | 'bilibili' | 'local' | 'unknown';

/** Practice-state fragment persisted on settings.workshopProgress[path]. */
export interface WorkshopProgress {
    practiced: boolean;
    practiceCount: number;
    lastPracticedAt: number;
}

export interface WorkshopNoteProps {
    file: TFile;
    path: string;
    title: string;            // H1 if present, else basename
    basename: string;
    durationMs: number;       // 0 when the note has no timestamps
    segmentCount: number;
    wordCount: number;        // words in timestamped lines only
    dateAdded: number;        // file.stat.ctime (ms)
    hasVideo: boolean;
    source: NoteSource;
    channel: string;           // frontmatter 频道/channel, else ''
    tags: string[];           // normalized (lowercased, deduped, no leading #)
    /** frontmatter 封面/cover link (external URL or vault path, wikilink unwrapped); '' when unset */
    cover: string;
    practiced: boolean;
    practiceCount: number;
    lastPracticedAt: number;  // 0 when never practiced
}

// ── Video link detection ──
// Lifted from src/views/shadowing-view.ts (the pair the player actually uses),
// so "what the catalog calls the source" matches "what the workshop can play".
export const YOUTUBE_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)[a-zA-Z0-9_-]{11}/i;
export const BILIBILI_RE = /(?:bilibili\.com\/video\/)(?:(?:BV[a-zA-Z0-9]{10})|(?:av[0-9]+))/i;
export const B23_RE = /b23\.tv\/[a-zA-Z0-9]+/i;

// A timestamped subtitle line: `[MM:SS] text` or `[HH:MM:SS] text`.
const TS_LINE = /^\s*\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.*)$/;
const URL_RE = /https?:\/\/[^\s)>]+/i;
const EMBED_VIDEO_RE = /!\[[^\]]*\.(?:mp4|webm|mov|m4v|mkv|avi)\]\]/i;
const LOCAL_VIDEO_EXT_RE = /\.(?:mp4|webm|mov|m4v|mkv|avi)(?:$|\?)/i;
const PLACEHOLDER_RE = /REPLACE_WITH/i;

/** Normalize a frontmatter `tags` value (string | array | scalar) into a clean lowercased list. */
export function normalizeTags(raw: unknown): string[] {
    if (raw == null) return [];
    const textual = raw as string | number | bigint | boolean | symbol;
    const rawStr = raw === null || typeof raw === 'object' || typeof raw === 'function'
        ? JSON.stringify(raw)
        : String(textual);
    const arr: unknown[] = Array.isArray(raw) ? raw : rawStr.split(',');
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of arr) {
        const tag = String(item).trim().toLowerCase().replace(/^#/, '');
        if (tag && !seen.has(tag)) {
            seen.add(tag);
            out.push(tag);
        }
    }
    return out;
}

/** Format a millisecond duration as `M:SS` (or `H:MM:SS` when ≥ 1h). Empty string when 0/negative. */
export function formatDuration(ms: number): string {
    if (!ms || ms <= 0) return '';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number): string => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Image extensions accepted as a catalog cover when the link targets a vault file. */
const COVER_IMAGE_RE = /\.(?:png|jpe?g|gif|webp|svg|bmp|avif)$/i;

/**
 * Normalize a frontmatter cover value (`封面`/`cover`) down to a bare link.
 * Accepts external URLs as-is; unwraps `![[a.png]]` / `[[a.png|alias]]` /
 * `![alt](a.png)` down to the vault link text. Returns '' when empty.
 */
export function normalizeCover(raw: unknown): string {
    if (raw == null) return '';
    const first = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
    const nonNull: unknown = first ?? '';
    const v = String(nonNull).trim();
    if (!v) return '';
    const wiki = v.match(/^!?\[\[([^|\]]+)(?:\|[^\]]*)?\]\]$/);
    if (wiki) return wiki[1].trim();
    const md = v.match(/^!?\[[^\]]*\]\(([^)]+)\)$/);
    if (md) return md[1].trim();
    return v;
}

/**
 * Resolve a normalized cover link to a displayable <img> src. External
 * http(s) URLs pass through; vault links resolve via the metadata cache to
 * an app resource path (sync + cheap, so it is safe to call per render).
 * Returns '' when the link cannot be resolved to an image.
 */
export function resolveCoverSrc(app: App, link: string, sourcePath: string): string {
    if (!link) return '';
    if (/^https?:\/\//i.test(link)) return link;
    const dest = app.metadataCache.getFirstLinkpathDest(link, sourcePath);
    if (!dest || !COVER_IMAGE_RE.test(dest.name)) return '';
    return app.vault.getResourcePath(dest);
}

/**
 * Derive all catalog properties for a note. `progress` is the plugin-tracked
 * practice entry for this file's path (undefined/empty for never-practiced).
 */
export async function parseWorkshopNote(
    file: TFile,
    app: App,
    progress?: Partial<WorkshopProgress>  ,
): Promise<WorkshopNoteProps> {
    const body: string = await app.vault.cachedRead(file);
    const fm = (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;

    // Title: first H1 in body, else frontmatter, else basename.
    let title = file.basename;
    const h1 = body.match(/^\s*#\s+(.+?)\s*$/m);
    if (h1 && h1[1]) title = h1[1];

    // Timestamps + word count (single pass over timestamped lines).
    let maxSec = -1;
    let segmentCount = 0;
    let wordCount = 0;
    for (const line of body.split('\n')) {
        const m = line.match(TS_LINE);
        if (!m) continue;
        segmentCount++;
        const sec = m[3] != null
            ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)
            : Number(m[1] || 0) * 60 + Number(m[2] || 0);
        if (sec > maxSec) maxSec = sec;
        const text = m[4] || '';
        wordCount += (text.match(/\S+/g) || []).length;
    }

    // Source + hasVideo.
    const urlMatch = body.match(URL_RE);
    const url = urlMatch ? urlMatch[0].replace(/[.,;:!]+$/, '') : '';
    const embedMatch = EMBED_VIDEO_RE.test(body);
    const urlValid = !!(url && !PLACEHOLDER_RE.test(url));
    let source: NoteSource = 'unknown';
    if (urlValid) {
        if (YOUTUBE_RE.test(url)) source = 'youtube';
        else if (BILIBILI_RE.test(url) || B23_RE.test(url)) source = 'bilibili';
        else if (LOCAL_VIDEO_EXT_RE.test(url)) source = 'local';
    }
    if (source === 'unknown' && embedMatch) source = 'local';
    const hasVideo = urlValid || embedMatch;

    // Channel: frontmatter 频道/channel, else ''.
    const rawChannel = fm['频道'] ?? fm.channel ?? '';
    const channelText = rawChannel as string | number | bigint | boolean | symbol;
    const channel = (rawChannel === null || typeof rawChannel === 'object'
        ? JSON.stringify(rawChannel)
        : String(channelText)).trim();

    return {
        file,
        path: file.path,
        title,
        basename: file.basename,
        durationMs: maxSec < 0 ? 0 : maxSec * 1000,
        segmentCount,
        wordCount,
        dateAdded: file.stat.ctime,
        hasVideo,
        source,
        channel,
        tags: normalizeTags(fm.tags),
        cover: normalizeCover(fm['封面'] ?? fm.cover ?? fm.Cover),
        practiced: !!(progress && progress.practiced),
        practiceCount: (progress && progress.practiceCount) || 0,
        lastPracticedAt: (progress && progress.lastPracticedAt) || 0,
    };
}
