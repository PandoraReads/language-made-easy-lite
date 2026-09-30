// @ts-nocheck
import { Platform } from 'obsidian';

// Dynamic requires for Node-only modules to prevent load failures on mobile
let fs: unknown = null;
let jsMdict: unknown = null;

try {
    if (Platform.isDesktop) {
        fs = require('fs');
        jsMdict = require('js-mdict');
    }
} catch (e) {
    console.warn('[EME] Node modules could not be pre-loaded, will retry on demand.');
}

export class MDXEngine {
    private mdx: unknown = null;
    private mdd: unknown = null;
    private mdxPath: string;
    private mddPath: string;
    private cssPath: string;
    private cssContent: string | null = null;

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

            // Try loading MDD if it exists
            if (fs.existsSync(this.mddPath)) {
                this.mdd = new jsMdict.MDD(this.mddPath);
                console.debug(`[EME] MDD loaded: ${this.mddPath}`);
            }

            // Try loading CSS
            if (fs.existsSync(this.cssPath)) {
                try {
                    this.cssContent = fs.readFileSync(this.cssPath, 'utf-8');
                    console.debug(`[EME] MDX CSS loaded: ${this.cssPath}`);
                } catch (e) {
                    console.error(`[EME] Failed to read MDX CSS: ${this.cssPath}`, e);
                }
            }

            console.debug(`[EME] MDX loaded: ${this.mdxPath}`);
        } catch (err) {
            console.error('[EME] MDX Loading failed:', err);
            throw err;
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

            if (html && typeof html === 'string' && followRedirects && html.startsWith('@@@link=')) {
                const target = html.replace('@@@link=', '').trim();
                return this.lookup(target, false);
            }

            return typeof html === 'string' ? html : null;
        } catch (err) {
            console.error('[EME] MDX Lookup Error:', err);
            return null;
        }
    }

    public async getResource(resourcePath: string): Promise<Buffer | null> {
        if (Platform.isMobile || !this.mdd) return null;

        let normalized = resourcePath.replace(/\//g, '\\');
        if (!normalized.startsWith('\\')) normalized = '\\' + normalized;

        try {
            const item = this.mdd.lookupKeyBlockByWord(normalized);
            if (!item) return null;

            const buffer = this.mdd.lookupRecordByKeyBlock(item);
            if (!buffer) return null;
            return typeof Buffer !== 'undefined' ? Buffer.from(buffer) : buffer;
        } catch (err) {
            console.error('[EME] MDD Resource Error:', err, normalized);
            return null;
        }
    }

    public getCSS(): string | null {
        return this.cssContent;
    }
}
