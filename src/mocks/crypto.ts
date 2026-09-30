import { Platform } from 'obsidian';

let cryptoModule: unknown = null;
try {
    if (Platform.isDesktop) {
        cryptoModule = (window as unknown).require('crypto');
    }
} catch (e) {
    // Silent fail
}

export const randomUUID = () => {
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

export const getRandomValues = (arr: unknown) => {
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
        return window.crypto.getRandomValues(arr);
    }
    if (typeof globalThis !== 'undefined' && window.crypto?.getRandomValues) {
        return window.crypto.getRandomValues(arr);
    }
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return arr;
};

export default cryptoModule || {
    randomUUID,
    getRandomValues
};
