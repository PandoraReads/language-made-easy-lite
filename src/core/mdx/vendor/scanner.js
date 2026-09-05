/*! Vendored from js-mdict v6.0.8 (https://github.com/terasum/js-mdict) — MIT License,
 *  Copyright (c) 2018 terasum. Local modifications marked with [LME]:
 *  scanner backend injection / pako for zlib / assert stub / Buffer removed. */
// [LME] node:fs removed — a ScannerBackend is injected at construction instead.
// Backend contract: { size, readBuffer(offset,length)->Uint8Array(copy),
//                     readNumber(offset,length)->DataView, close() }
export class FileScanner {
    constructor(backend) {
        this.filepath = (backend && backend.filepath) || '';
        this.offset = 0;
        this.backend = backend;
    }
    close() {
        if (!this.backend) {
            return;
        }
        this.backend.close();
    }
    readBuffer(offset, length) {
        return this.backend.readBuffer(offset, length);
    }
    readNumber(offset, length) {
        return this.backend.readNumber(offset, length);
    }
}
//# sourceMappingURL=scanner.js.map
