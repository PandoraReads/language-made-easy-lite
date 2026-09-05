/*! Vendored from js-mdict v6.0.8 (https://github.com/terasum/js-mdict) — MIT License,
 *  Copyright (c) 2018 terasum. Local modifications marked with [LME]:
 *  scanner backend injection / pako for zlib / assert stub / Buffer removed. */
import { Mdict } from './mdict.js';
import common from './utils.js';
const BASE64ENCODER = function (arrayBuffer) {
    // [LME] Buffer.from(x).toString('base64') -> utils.u8ToBase64
    return common.u8ToBase64(arrayBuffer);
};
export class MDD extends Mdict {
    /**
     * locate the resource key
     * @param resourceKey resource key
     * @returns the keyText and definition
     */
    locate(resourceKey) {
        const item = this.lookupKeyBlockByWord(resourceKey);
        if (!item) {
            return {
                keyText: resourceKey,
                definition: null
            };
        }
        const meaningBuff = this.lookupRecordByKeyBlock(item);
        if (!meaningBuff) {
            return {
                keyText: resourceKey,
                definition: null
            };
        }
        return {
            keyText: resourceKey,
            definition: BASE64ENCODER(meaningBuff)
        };
    }
}
//# sourceMappingURL=mdd.js.map