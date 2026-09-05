// ============================================================
// Language Made Easy - SRT subtitle parsing utilities
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// ============================================================
//
// Pure, dependency-free helpers for converting SRT subtitle files into
// the plugin's `[MM:SS] text` note format. Shared by:
//   - the "SRT → subtitle note" command (main-unified-full.ts)
//   - the shadowing workshop's auto SRT loader (shadowing-view.ts)
//
// Keeping this module free of Obsidian / AIService imports makes it
// trivially unit-testable (see scripts/verify-srt-parser.mjs).

/** One parsed SRT entry. `index` is the original 1-based cue number. */
export interface SrtSegment {
    index: number;
    /** Cue start, in seconds (float, sub-second precision kept). */
    startSec: number;
    /** Cue end, in seconds (float). */
    endSec: number;
    /** Cue text, single-line (multi-line cues joined with a space), trimmed. */
    text: string;
}

export interface SubtitleNoteMetadata {
    title?: string;
    language?: string;
    duration?: string;
    channel?: string;
    link?: string;
    cover?: string;
    created?: string;
}

function yamlString(value: string | undefined): string {
    return JSON.stringify(value || '');
}

/** Build the canonical frontmatter shared by every subtitle note flow. */
export function buildSubtitleNoteFrontmatter(metadata: SubtitleNoteMetadata = {}): string {
    const created = metadata.created || new Date().toISOString().slice(0, 10);
    return [
        '---',
        `标题: ${yamlString(metadata.title)}`,
        `语言: ${yamlString(metadata.language)}`,
        `时长: ${yamlString(metadata.duration)}`,
        `频道: ${yamlString(metadata.channel)}`,
        `链接: ${yamlString(metadata.link)}`,
        `封面: ${yamlString(metadata.cover)}`,
        `创建: ${yamlString(created)}`,
        '---',
    ].join('\n');
}

/**
 * Parse a standard SRT subtitle string into ordered segments.
 *
 * Tolerates: CRLF / CR line endings, a leading BOM, extra blank lines
 * between cues, 1-2 digit hours, and either `,` or `.` as the millisecond
 * separator. Cues without a parseable timestamp or with empty text are
 * skipped. Returns `[]` for empty / unparseable input.
 */
export function parseSrt(content: string): SrtSegment[] {
    if (!content) return [];

    // Normalize endings + strip BOM.
    const normalized = content
        .replace(/^\uFEFF/, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

    // Each cue is separated by one or more blank lines.
    const entries = normalized.split(/\n[ \t]*\n+/);

    // HH:MM:SS,mmm --> HH:MM:SS,mmm  (lenient: 1-2 digit hours, , or . ms)
    const TIME_RE = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

    const toSec = (h: string, m: string, s: string, ms: string): number => {
        const msPadded = (ms + '000').slice(0, 3); // normalize 1-3 digits → 3
        return (
            parseInt(h, 10) * 3600 +
            parseInt(m, 10) * 60 +
            parseInt(s, 10) +
            parseInt(msPadded, 10) / 1000
        );
    };

    const segments: SrtSegment[] = [];

    for (const entry of entries) {
        const lines = entry.split('\n');
        // Locate the timestamp line (it may be the 2nd line, after the cue number).
        const tsLineIdx = lines.findIndex(l => TIME_RE.test(l));
        if (tsLineIdx === -1) continue;

        const match = lines[tsLineIdx].match(TIME_RE);
        if (!match) continue;

        const startSec = toSec(match[1], match[2], match[3], match[4]);
        const endSec = toSec(match[5], match[6], match[7], match[8]);

        // Text = everything after the timestamp line; multi-line cues collapse to one line.
        const text = lines
            .slice(tsLineIdx + 1)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!text) continue;

        // Prefer the explicit cue number when present, else fall back to output order.
        const cueNum = parseInt(lines[0], 10);
        segments.push({
            index: Number.isFinite(cueNum) && cueNum > 0 ? cueNum : segments.length + 1,
            startSec,
            endSec,
            text,
        });
    }

    return segments;
}

/**
 * Format a number of seconds as the plugin's bracketed note timestamp:
 * `[MM:SS]` under one hour, `[H:MM:SS]` otherwise. Mirrors the format the
 * shadowing workshop recognizes (`ShadowingView` timestamp regex).
 */
export function formatTimestampForNote(sec: number): string {
    const total = Math.max(0, Math.floor(sec));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `[${h}:${mm}:${ss}]` : `[${mm}:${ss}]`;
}

/** Convert segments to `[MM:SS] text` lines (the note timestamp format). */
export function segmentsToTimestampLines(segs: SrtSegment[]): string {
    return segs.map(sg => `${formatTimestampForNote(sg.startSec)} ${sg.text}`).join('\n');
}

/**
 * Build the full markdown body for a subtitle note: a title line, a short
 * provenance hint, and the `## Subtitles` section the shadowing workshop
 * loads from. `title` and `hint` are already i18n-localized by the caller.
 */
export function buildSubtitleNoteBody(
    title: string,
    hint: string,
    segs: SrtSegment[],
    metadata: SubtitleNoteMetadata = {}
): string {
    const lines = segmentsToTimestampLines(segs);
    return `${buildSubtitleNoteFrontmatter({ ...metadata, title: metadata.title || title })}\n\n# ${title}\n\n${hint}\n\n## Subtitles\n\n${lines}\n`;
}
