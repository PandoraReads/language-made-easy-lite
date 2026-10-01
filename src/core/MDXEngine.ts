// @ts-nocheck
import { Platform } from 'obsidian';
import type { MDX, MDD } from 'js-mdict';

/** Minimal Node fs surface the dictionary engine depends on (desktop only). */
interface NodeFsLike {
    existsSync(path: string): boolean;
    readFileSync(path: string, encoding: string): string;
    readdirSync(path: string): string[];
}

// Dynamic requires for Node-only modules to prevent load failures on mobile
let fs: NodeFsLike | null = null;
let jsMdict: typeof import('js-mdict') | null = null;

try {
    if (Platform.isDesktop) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- desktop-only lazy load behind a Platform.isDesktop guard (the no-nodejs-modules sanctioned pattern)
        fs = require('fs') as NodeFsLike;
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- desktop-only lazy load behind a Platform.isDesktop guard (the no-nodejs-modules sanctioned pattern)
        jsMdict = require('js-mdict') as typeof import('js-mdict');
    }
} catch {
    console.warn('[EME] Node modules could not be pre-loaded, will retry on demand.');
}

export class MDXEngine {
    private mdx: MDX | null = null;
    // Multiple MDD files: main + numbered (.1.mdd, .2.mdd, ...)
    private mdds: MDD[] = [];
    private mdxPath: string;
    private mddPath: string;
    private cssPath: string;
    private cssContent: string | null = null;
    private mddKeysLogged = false;

    constructor(mdxPath: string, mddPath?: string, mdxCssPath?: string) {
        this.mdxPath = mdxPath;
        this.mddPath = mddPath || mdxPath.replace(/\.mdx$/i, '.mdd');
        this.cssPath = mdxCssPath || mdxPath.replace(/\.mdx$/i, '.css');
    }

    public async load(): Promise<void> {
        if (Platform.isMobile || !fs || !jsMdict) {
            console.debug('[EME] MDX is disabled on mobile or Node environment missing.');
            return;
        }

        try {
            if (!fs.existsSync(this.mdxPath)) {
                throw new Error(`MDX file not found: ${this.mdxPath}`);
            }

            // Initialize MDX
            this.mdx = new jsMdict.MDX(this.mdxPath);

            // Load all MDD files: main + numbered (.1.mdd, .2.mdd, ...)
            this.mdds = [];
            this.loadAllMdds();

            // Try loading CSS
            if (fs.existsSync(this.cssPath)) {
                try {
                    this.cssContent = fs.readFileSync(this.cssPath, 'utf-8');
                    console.debug(`[EME] MDX CSS loaded: ${this.cssPath}`);
                } catch (e) {
                    console.error(`[EME] Failed to read MDX CSS: ${this.cssPath}`, e);
                }
            }

            console.debug(`[EME] MDX loaded: ${this.mdxPath}, MDD files: ${this.mdds.length}`);
        } catch (err) {
            console.error('[EME] MDX Loading failed:', err);
            throw err;
        }
    }

    /**
     * Load the user-specified MDD, plus auto-discover all related MDD files
     * in the same directory. Different dictionaries use different naming:
     *   - Standard split: oaldpe.mdd, oaldpe.1.mdd, oaldpe.2.mdd
     *   - Custom names: dict.mdd, dict_audio.mdd
     * Strategy: load user's MDD + scan for all .mdd files sharing the MDX stem name.
     */
    private loadAllMdds(): void {
        if (!this.mddPath) return;
        const loadedPaths = new Set<string>();

        // 1. Load user-specified MDD
        if (fs.existsSync(this.mddPath)) {
            try {
                const mdd = new jsMdict.MDD(this.mddPath);
                this.mdds.push(mdd);
                loadedPaths.add(this.mddPath);
                console.debug(`[EME] MDD loaded: ${this.mddPath} (${mdd.keywordList?.length || 0} keys)`);
            } catch (e) {
                console.warn(`[EME] Failed to load MDD: ${this.mddPath}`, (e instanceof Error ? e.message : String(e)));
            }
        } else {
            console.warn(`[EME] MDD not found: ${this.mddPath}`);
        }

        // 2. Auto-discover all related MDD files in the same directory
        // Use MDX filename stem (e.g. "oaldpe") to find oaldpe*.mdd files
        const dir = this.mdxPath.substring(0, this.mdxPath.lastIndexOf('/'));
        const mdxName = this.mdxPath.substring(this.mdxPath.lastIndexOf('/') + 1);
        const stem = mdxName.replace(/\.mdx$/i, '');

        try {
            const files = fs.readdirSync(dir);
            const mddFiles = files.filter(f =>
                f.toLowerCase().endsWith('.mdd') &&
                f.toLowerCase().startsWith(stem.toLowerCase())
            );

            for (const mddFile of mddFiles) {
                const fullPath = dir + '/' + mddFile;
                if (loadedPaths.has(fullPath)) continue; // Already loaded

                try {
                    const mdd = new jsMdict.MDD(fullPath);
                    this.mdds.push(mdd);
                    loadedPaths.add(fullPath);
                    const audioCount = mdd.keywordList?.filter(k => /\.(mp3|wav|ogg|spx|aac|m4a)/i.test(k.keyText)).length || 0;
                    console.debug(`[EME] MDD auto-loaded: ${fullPath} (${mdd.keywordList?.length || 0} keys, ${audioCount} audio)`);
                } catch (e) {
                    console.warn(`[EME] Failed to load MDD: ${fullPath}`, (e instanceof Error ? e.message : String(e)));
                }
            }
        } catch (e) {
            console.warn(`[EME] Failed to scan directory for MDD files:`, (e instanceof Error ? e.message : String(e)));
        }
    }

    public async lookup(word: string, followRedirects: boolean = true): Promise<string | null> {
        if (Platform.isMobile || !this.mdx) return null;

        try {
            const result = this.mdx.lookup(word);
            let html = result ? result.definition : null;

            if (html && typeof html !== 'string' && (
                (typeof Buffer !== 'undefined' && Buffer.isBuffer(html)) ||
                html instanceof ArrayBuffer
            )) {
                html = new TextDecoder().decode(html);
            }

            if (!html) {
                const html2 = this.mdx.lookup(word.toLowerCase())?.definition;
                if (html2) html = html2;
                else {
                    const capitalized = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                    const html3 = this.mdx.lookup(capitalized)?.definition;
                    if (html3) html = html3;
                }
            }

            if (html && typeof html === 'string' && followRedirects) {
                // MDX redirects look like "@@@LINK=run" (case varies by dictionary;
                // OALD10 emits uppercase, with trailing CRLF/NUL). Capture the target
                // token up to the first line/NULL terminator and follow one hop.
                const linkMatch = html.match(/^@@@link=([^\r\n\0]+)/i);
                if (linkMatch) {
                    return this.lookup(linkMatch[1].trim(), false);
                }
            }

            return typeof html === 'string' ? html : null;
        } catch (err) {
            console.error('[EME] MDX Lookup Error:', err);
            return null;
        }
    }

    /**
     * Get a resource (audio, image, etc.) from any loaded MDD file.
     * Searches through all MDD files, tries multiple path formats,
     * and URL-decodes the path to handle %23 -> # etc.
     */
    public async getResource(resourcePath: string): Promise<Buffer | null> {
        if (Platform.isMobile || this.mdds.length === 0) {
            if (this.mdds.length === 0) {
                console.warn('[EME] getResource called but no MDD loaded for:', resourcePath);
            }
            return null;
        }

        // URL-decode the path (handles %23 -> #, %20 -> space, etc.)
        let decodedPath = resourcePath;
        try {
            decodedPath = decodeURIComponent(resourcePath);
        } catch {
            // If decode fails, use original path
        }

        // Log MDD key samples for diagnostics (once)
        if (!this.mddKeysLogged) {
            this.mddKeysLogged = true;
            for (const mdd of this.mdds) {
                if (mdd.keywordList?.length > 0) {
                    const audioKeys = mdd.keywordList
                        .filter(k => /\.(mp3|wav|ogg|spx|aac|m4a)/i.test(k.keyText))
                        .slice(0, 3)
                        .map(k => k.keyText);
                    if (audioKeys.length > 0) {
                        console.debug('[EME] MDD audio key samples:', audioKeys);
                    }
                }
            }
        }

        console.debug('[EME] getResource:', resourcePath, '-> decoded:', decodedPath);

        // Build multiple path variations to try
        const candidates = this.buildPathCandidates(decodedPath);

        // Search through ALL MDD files
        for (let mddIdx = 0; mddIdx < this.mdds.length; mddIdx++) {
            const mdd = this.mdds[mddIdx];

            // Strategy 1: Try each candidate with binary search (fast)
            for (const candidate of candidates) {
                const result = this.locateInMdd(mdd, candidate);
                if (result) {
                    console.debug(`[EME] Found in MDD #${mddIdx}: "${candidate}" (${result.length} bytes)`);
                    return result;
                }
            }

            // Strategy 2: Linear case-insensitive scan (slow but reliable)
            const result = this.linearScanInMdd(mdd, decodedPath);
            if (result) {
                console.debug(`[EME] Found via linear scan in MDD #${mddIdx}: (${result.length} bytes)`);
                return result;
            }
        }

        console.warn(`[EME] Resource not found in any MDD: "${resourcePath}"`);
        return null;
    }

    /**
     * Build multiple path format candidates from a raw resource path.
     */
    private buildPathCandidates(rawPath: string): string[] {
        const candidates: string[] = [];
        const path = rawPath.trim();

        // Variant 1: backslashes + leading backslash (most common)
        let v1 = path.replace(/\//g, '\\');
        if (!v1.startsWith('\\')) v1 = '\\' + v1;
        candidates.push(v1);

        // Variant 2: lowercase of variant 1
        candidates.push(v1.toLowerCase());

        // Variant 3: no leading backslash
        candidates.push(v1.replace(/^\\/, ''));

        // Variant 4: forward slashes, no leading slash
        candidates.push(path.replace(/^\\/, '').replace(/\\/g, '/'));

        // Variant 5: forward slashes + leading slash
        let v5 = path.replace(/\\/g, '/');
        if (!v5.startsWith('/')) v5 = '/' + v5;
        candidates.push(v5);

        // Deduplicate
        return [...new Set(candidates)];
    }

    /**
     * Try to locate a resource in a specific MDD using binary search.
     */
    private locateInMdd(mdd: MDD, key: string): Buffer | null {
        try {
            const result = mdd.locate(key);
            if (result && result.definition) {
                return Buffer.from(result.definition, 'base64');
            }
        } catch {
            // Continue to next candidate
        }
        return null;
    }

    /**
     * Linear scan through a specific MDD's keys (handles case/path mismatches).
     */
    private linearScanInMdd(mdd: MDD, rawPath: string): Buffer | null {
        const list = mdd.keywordList;
        if (!list || list.length === 0) return null;

        const normalized = rawPath.replace(/\\/g, '/').toLowerCase().replace(/^\//, '');

        for (let i = 0; i < list.length; i++) {
            const keyText = list[i].keyText;
            const keyNormalized = keyText.replace(/\\/g, '/').toLowerCase().replace(/^\//, '');

            if (keyNormalized === normalized) {
                try {
                    const record = mdd.lookupRecordByKeyBlock(list[i]);
                    if (record) {
                        return Buffer.from(record);
                    }
                } catch (err) {
                    console.error(`[EME] Failed to read resource at index ${i}:`, err);
                }
            }
        }

        return null;
    }

    public getCSS(): string | null {
        return this.cssContent;
    }
}
