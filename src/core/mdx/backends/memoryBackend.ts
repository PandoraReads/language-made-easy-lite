import type { ScannerBackend } from '../ScannerBackend';

/**
 * 整文件内存后端:一次 ArrayBuffer 全量驻留,查词零 IO。
 * 用于移动端 PoC 与降级档(词典体积白名单内),以及单元测试。
 * 文件较大时请改用 OPFS 同步句柄后端(见 PLAN-mobile-mdx.md 步骤 2)。
 */
export class MemoryScannerBackend implements ScannerBackend {
    readonly size: number;
    private readonly view: Uint8Array;

    constructor(data: ArrayBuffer | Uint8Array) {
        this.view = data instanceof Uint8Array ? data : new Uint8Array(data);
        this.size = this.view.length;
    }

    readBuffer(offset: number, length: number): Uint8Array {
        return this.view.slice(offset, offset + length);
    }

    readNumber(offset: number, length: number): DataView {
        return new DataView(this.view.buffer, this.view.byteOffset + offset, length);
    }

    close(): void {
        // 底层缓冲区归调用方所有,无需释放
    }
}
