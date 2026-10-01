import { Platform } from 'obsidian';

// Minimal crypto surface (shape of Node's crypto.randomUUID on desktop).
interface CryptoModuleLike {
    randomUUID?: () => string;
}

interface WindowWithRequire {
    require?: (id: string) => unknown;
}

let cryptoModule: CryptoModuleLike | null = null;
try {
    if (Platform.isDesktop) {
        cryptoModule = (window as WindowWithRequire).require?.('crypto') as CryptoModuleLike | undefined ?? null;
    }
} catch {
    // Silent fail
}

export const randomUUID = (): string => {
    // 1. Try modern browser API
    if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }
    if (typeof globalThis !== 'undefined' && window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }

    // 2. Try Node.js mock/original
    if (cryptoModule?.randomUUID) {
        return cryptoModule.randomUUID();
    }

    // 3. Mathematical fallback (for older browsers/environments)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const getRandomValues = (arr: ArrayBufferView & { [i: number]: number }): ArrayBufferView => {
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
        return window.crypto.getRandomValues(arr as unknown as ArrayBufferView & ArrayBufferView<ArrayBuffer>);
    }
    if (typeof globalThis !== 'undefined' && window.crypto?.getRandomValues) {
        return window.crypto.getRandomValues(arr as unknown as ArrayBufferView & ArrayBufferView<ArrayBuffer>);
    }
    const indexed = arr as unknown as { [i: number]: number; length: number };
    for (let i = 0; i < indexed.length; i++) indexed[i] = Math.floor(Math.random() * 256);
    return arr;
};

const resolved: CryptoModuleLike = cryptoModule ?? {};
export default resolved;
