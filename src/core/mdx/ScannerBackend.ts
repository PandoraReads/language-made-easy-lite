/**
 * 随机读后端契约 — vendor 版 js-mdict 解析器的唯一文件 IO 出口。
 *
 * 语义对齐桌面版的 `fs.readSync(fd, buf, { position })`(scanner.js 原实现),
 * 保持同步:vendor 解析器 lookup/locate 管线是同步的,OPFS 同步句柄
 * (createSyncAccessHandle, 仅 Worker)与之天然匹配。
 *
 * 实现方:
 *  - backends/memoryBackend.ts — ArrayBuffer 整文件内存版(PoC 与降级档)
 *  - backends/fsBackend       — Node fs 版(parity 脚本内联实现,桌面插件不切换)
 *  - Worker 内 OPFS 同步句柄版 — PLAN-mobile-mdx.md 步骤 2
 */
export interface ScannerBackend {
    /** 文件总字节数 */
    readonly size: number;
    /** 从绝对偏移读 length 字节,返回拷贝(语义同 readSync 后 buffer.slice) */
    readBuffer(offset: number, length: number): Uint8Array;
    /** 从绝对偏移读 length 字节,返回仅覆盖该区段的 DataView(只读使用) */
    readNumber(offset: number, length: number): DataView;
    /** 释放底层资源(无资源则空操作) */
    close(): void;
}
