import { Platform } from 'obsidian';

let fs: any = null;
try {
    if (Platform.isDesktop) {
        fs = (window as any).require('fs');
    }
} catch (e) {
    // Silent fail
}

const fallback = {
    existsSync: () => false,
    readFileSync: (path: string) => {
        console.warn(`[EME] fs.readFileSync called for ${path} on non-desktop environment.`);
        return null;
    },
    statSync: () => { return { isDirectory: () => false }; },
    openSync: () => null,
    closeSync: () => { },
    readSync: () => 0,
    fstatSync: () => { return { size: 0 }; }
};

export const existsSync = fs?.existsSync || fallback.existsSync;
export const readFileSync = fs?.readFileSync || fallback.readFileSync;
export const statSync = fs?.statSync || fallback.statSync;
export const openSync = fs?.openSync || fallback.openSync;
export const closeSync = fs?.closeSync || fallback.closeSync;
export const readSync = fs?.readSync || fallback.readSync;
export const fstatSync = fs?.fstatSync || fallback.fstatSync;

export default fs || {
    ...fallback,
    existsSync,
    readFileSync,
    statSync,
    openSync,
    closeSync,
    readSync,
    fstatSync
};
