/**
 * TypeScript declarations for the vendored js-mdict (v6.0.8, MIT, terasum).
 * Runtime is plain ESM under ./vendor/*.js; this file only supplies types.
 * Local modifications: options.backend (ScannerBackend) is required.
 */
import type { ScannerBackend } from '../ScannerBackend';

export interface MdictLookupResult {
    keyText: string;
    /** Raw record text (mdx) or base64 payload (mdd); null when not found */
    definition: string | null;
}

export interface MdictKeyWordItem {
    keyText: string;
    recordStartOffset: number;
    recordEndOffset: number;
}

export interface MdictOptions {
    passcode?: string;
    debug?: boolean;
    resort?: boolean;
    isStripKey?: boolean;
    isCaseSensitive?: boolean;
    encryptType?: number;
    /** [LME] injected random-access backend — required in the vendored build */
    backend: ScannerBackend;
}

export declare class Mdict {
    constructor(fname: string, options?: MdictOptions);
    protected lookupKeyBlockByWord(word: string, isAssociate?: boolean): MdictKeyWordItem | undefined;
    protected lookupRecordByKeyBlock(item: MdictKeyWordItem): Uint8Array;
    close(): void;
}

export declare class MDX extends Mdict {
    lookup(word: string): MdictLookupResult;
    associate(phrase: string): MdictKeyWordItem[];
    fuzzy_search(word: string, fuzzy_size: number, ed_gap: number): Array<{ key: string; idx: string }>;
}

export declare class MDD extends Mdict {
    locate(resourceKey: string): MdictLookupResult;
}
