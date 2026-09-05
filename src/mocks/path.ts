import { Platform } from 'obsidian';

let path: any = null;
try {
    if (Platform.isDesktop) {
        path = (window as any).require('path');
    }
} catch (e) {
    // Silent fail
}

export const join = path?.join || ((...args: string[]) => args.join('/'));
export const dirname = path?.dirname || ((p: string) => p.split('/').slice(0, -1).join('/') || '.');
export const basename = path?.basename || ((p: string) => p.split('/').pop() || '');
export const extname = path?.extname || ((p: string) => {
    const base = p.split('/').pop() || '';
    const idx = base.lastIndexOf('.');
    return idx < 1 ? '' : base.slice(idx);
});

export default path || {
    join,
    dirname,
    basename,
    extname
};
