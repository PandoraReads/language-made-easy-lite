/*! Vendored from js-mdict v6.0.8 (https://github.com/terasum/js-mdict) — MIT License,
 *  Copyright (c) 2018 terasum. Local modifications marked with [LME]:
 *  scanner backend injection / pako for zlib / assert stub / Buffer removed. */
export function replaceLatinies(word) {
    return word.normalize('NFD').replace(/[\u0300-\u036f]/g, '\u9999');
}
export function hasLatinies(word) {
    return word.normalize('NFD').search(/[\u0300-\u036f]/g) != -1;
}
//# sourceMappingURL=latins.js.map