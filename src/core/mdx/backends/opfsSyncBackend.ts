// @ts-nocheck — FileSystemSyncAccessHandle 在当前 TS lib 中类型不全,运行时特性检测兜底
import type { ScannerBackend } from '../ScannerBackend';

/**
 * OPFS 同步句柄后端(仅 Worker 内可用):createSyncAccessHandle 的 read(buf, {at})
 * 与桌面 fs.readSync(fd, buf, { position }) 语义一一对应。
 * iOS 16.4+ / Android WebView(Chromium 102+)起支持;不可用时上层降级内存后端。
 */
export class OpfsSyncBackend implements ScannerBackend {
    readonly size: number;
    private readonly handle: any;
    private closed = false;

    constructor(handle: any, size: number) {
        this.handle = handle;
        this.size = size;
    }

    readBuffer(offset: number, length: number): Uint8Array {
        if (this.closed) throw new Error('opfsSyncBackend: handle already closed');
        const buffer = new Uint8Array(length);
        const readedLen = this.handle.read(buffer, { at: offset });
        return buffer.slice(0, readedLen);
    }

    readNumber(offset: number, length: number): DataView {
        if (this.closed) throw new Error('opfsSyncBackend: handle already closed');
        const buffer = new Uint8Array(length);
        this.handle.read(buffer, { at: offset });
        return new DataView(buffer.buffer);
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        try {
            this.handle.close();
        } catch {
            // 忽略关闭异常
        }
    }
}
