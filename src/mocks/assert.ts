import { Platform } from 'obsidian';

let assert: any = null;
try {
    if (Platform.isDesktop) {
        assert = (window as any).require('assert');
    }
} catch (e) {
    // Silent fail
}

const fallback = (condition: any, message?: string) => {
    if (!condition) {
        console.warn(`[EME] Assertion failed: ${message}`);
    }
};

// Add common assert methods to fallback
(fallback as any).ok = fallback;
(fallback as any).equal = (a: any, b: any, msg?: string) => fallback(a == b, msg || `${a} == ${b}`);
(fallback as any).deepEqual = (a: any, b: any, msg?: string) => fallback(JSON.stringify(a) === JSON.stringify(b), msg || `deepEqual failed`);
(fallback as any).strictEqual = (a: any, b: any, msg?: string) => fallback(a === b, msg || `${a} === ${b}`);
(fallback as any).notStrictEqual = (a: any, b: any, msg?: string) => fallback(a !== b, msg || `${a} !== ${b}`);

export default assert || fallback;
