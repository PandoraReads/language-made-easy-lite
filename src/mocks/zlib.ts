import { Platform } from 'obsidian';

let zlib: unknown = null;
try {
    if (Platform.isDesktop) {
        zlib = (window as unknown).require('zlib');
    }
} catch (e) {
    // Silent fail
}

export const inflateSync = zlib?.inflateSync || ((buf: unknown) => {
    console.warn('[EME] zlib.inflateSync called on non-desktop environment. Dictionary decompression might fail.');
    return buf;
});

export default zlib || {
    inflateSync
};
