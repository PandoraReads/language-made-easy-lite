/*! Vendored from js-mdict v6.0.8 (https://github.com/terasum/js-mdict) — MIT License,
 *  Copyright (c) 2018 terasum. Local modifications marked with [LME]:
 *  scanner backend injection / pako for zlib / assert stub / Buffer removed. */
import lzo from './lzo1x.js';
function decompress(buf, initSize, blockSize) {
    const result = lzo.decompress({
        inputBuffer: buf,
        initSize: 16000,
        blockSize: 8192,
    });
    return result;
}
function compress(state) {
    return lzo.compress(state);
}
export { decompress, compress };
export default { decompress, compress };
//# sourceMappingURL=lzo1x-wrapper.js.map