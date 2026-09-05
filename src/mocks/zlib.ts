import { Platform } from 'obsidian';

let zlib: any = null;
try {
    if (Platform.isDesktop) {
        zlib = (window as any).require('zlib');
    }
} catch (e) {
    // Silent fail
}

export const inflateSync = zlib?.inflateSync || ((buf: any) => {
    console.warn('[EME] zlib.inflateSync called on non-desktop environment. Dictionary decompression might fail.');
    return buf;
});

export default zlib || {
    inflateSync
};
