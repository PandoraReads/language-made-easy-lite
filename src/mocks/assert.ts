import { Platform } from 'obsidian';

let assert: unknown = null;
try {
    if (Platform.isDesktop) {
        assert = (window as unknown as { require: (id: string) => unknown }).require('assert');
    }
} catch {
    // Silent fail
}

const fallback = (condition: unknown, message?: string) => {
    if (!condition) {
        console.warn(`[EME] Assertion failed: ${message}`);
    }
};

// Add common assert methods to fallback
(fallback as unknown).ok = fallback;
(fallback as unknown).equal = (a: any, b: any, msg?: string) => fallback(a == b, msg || `${a} == ${b}`);
(fallback as unknown).deepEqual = (a: any, b: any, msg?: string) => fallback(JSON.stringify(a) === JSON.stringify(b), msg || `deepEqual failed`);
(fallback as unknown).strictEqual = (a: any, b: any, msg?: string) => fallback(a === b, msg || `${a} === ${b}`);
(fallback as unknown).notStrictEqual = (a: any, b: any, msg?: string) => fallback(a !== b, msg || `${a} !== ${b}`);

export default assert || fallback;
