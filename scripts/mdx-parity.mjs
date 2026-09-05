#!/usr/bin/env node
/**
 * MDX vendor 保真校验(PLAN-mobile-mdx.md 步骤 1 合入门槛)
 *
 * 同一词典文件,npm 版 js-mdict(fs 随机读) vs vendor 版(注入 FsBackend,
 * 内存拷贝随机读),对比 lookup 输出全等;若提供 .mdd,再从释义中抽取
 * 资源键(sound://、src/href)对比 locate 输出。
 *
 * 用法:
 *   node scripts/mdx-parity.mjs <dict.mdx> [dict2.mdx ...] [--mdd res.mdd]
 *                                [--words w1,w2,...] [--limit 200]
 *
 * 退出码: 0 = 全等; 1 = 存在差异或加载失败。
 */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { MDX, MDD } from 'js-mdict';
import { MDX as VendorMDX, MDD as VendorMDD } from '../src/core/mdx/vendor/index.js';

const BASE_WORDS = [
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it',
  'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this',
  'example', 'run', 'time', 'word', 'look', 'make', 'use', 'water', 'long', 'hand',
];

/** Node fs 后端:整文件读入内存(与移动端 memory 后端同一语义,数据源等价)。 */
class FsBackend {
  constructor(path) {
    this.buf = new Uint8Array(readFileSync(path));
    this.size = this.buf.length;
  }
  readBuffer(offset, length) {
    return this.buf.slice(offset, offset + length);
  }
  readNumber(offset, length) {
    return new DataView(this.buf.buffer, this.buf.byteOffset + offset, length);
  }
  close() {}
}

function harvestWords(mdx, limit) {
  const found = new Set();
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const prefixes = [];
  for (const ch of letters) prefixes.push(ch, ch + 'e', ch + 'a', ch + 'i');
  for (const prefix of prefixes) {
    if (found.size >= limit) break;
    try {
      const items = mdx.associate(prefix);
      const step = Math.max(1, Math.floor(items.length / 12));
      for (let i = 0; i < items.length; i += step) {
        found.add(items[i].keyText);
        if (found.size >= limit) break;
      }
    } catch {
      // associate 对个别前缀可能失败,跳过即可
    }
  }
  return [...found];
}

function safeRun(fn) {
  try {
    const r = fn();
    return { ok: true, keyText: r.keyText, definition: r.definition };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

function extractResourceKeys(definitions, limit) {
  const keys = new Set();
  const patterns = [
    /sound:\/\/([^\s"'<>]+)/g,
    /(?:src|href)="(?!https?:|data:|#|entry:\/\/)([^"]+)"/g,
    /(?:src|href)='(?!https?:|data:|#|entry:\/\/)([^']+)'/g,
  ];
  for (const def of definitions) {
    if (!def) continue;
    for (const re of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(def)) !== null) {
        keys.add(m[1]);
        if (keys.size >= limit) return [...keys];
      }
    }
  }
  return [...keys];
}

function parseArgs(argv) {
  const args = { paths: [], mdd: null, words: null, limit: 200 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mdd') args.mdd = argv[++i];
    else if (a === '--words') args.words = argv[++i].split(',').map((w) => w.trim()).filter(Boolean);
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10) || 200;
    else args.paths.push(a);
  }
  return args;
}

function parityCheck(label, words, runRef, runVendor) {
  const diffs = [];
  for (const w of words) {
    const r1 = safeRun(() => runRef(w));
    const r2 = safeRun(() => runVendor(w));
    if (JSON.stringify(r1) !== JSON.stringify(r2)) {
      diffs.push({ word: w, npm: r1, vendor: r2 });
    }
  }
  if (diffs.length > 0) {
    console.log(`[FAIL] ${label}: ${diffs.length}/${words.length} 不一致`);
    for (const d of diffs.slice(0, 8)) {
      console.log(`  word=${JSON.stringify(d.word)}`);
      console.log(`    npm   = ${JSON.stringify(d.npm).slice(0, 200)}`);
      console.log(`    vendor= ${JSON.stringify(d.vendor).slice(0, 200)}`);
    }
    if (diffs.length > 8) console.log(`  ...另有 ${diffs.length - 8} 处`);
  } else {
    console.log(`[PASS] ${label}: ${words.length}/${words.length} 全等`);
  }
  return diffs.length;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.paths.length === 0) {
    console.log('用法: node scripts/mdx-parity.mjs <dict.mdx> [...] [--mdd res.mdd] [--words w1,w2] [--limit 200]');
    process.exit(1);
  }
  let totalDiffs = 0;

  for (const path of args.paths) {
    console.log(`\n===== ${path} =====`);
    let npmMdx, vendorMdx;
    try {
      let t0 = performance.now();
      npmMdx = new MDX(path);
      const tNpm = performance.now() - t0;
      t0 = performance.now();
      vendorMdx = new VendorMDX(path, { backend: new FsBackend(path) });
      const tVendor = performance.now() - t0;
      console.log(`加载: npm=${tNpm.toFixed(0)}ms vendor=${tVendor.toFixed(0)}ms`);
    } catch (e) {
      console.log(`[FAIL] 加载失败: ${e && e.message}`);
      console.log(e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : '');
      totalDiffs += 1;
      continue;
    }

    const words = args.words || [...new Set([...BASE_WORDS, ...harvestWords(npmMdx, args.limit)])];
    console.log(`对比词表: ${words.length} 词`);
    totalDiffs += parityCheck('mdx lookup', words,
      (w) => npmMdx.lookup(w),
      (w) => vendorMdx.lookup(w));

    // 收集命中释义,抽取资源键做 mdd locate 对比
    const foundDefs = words.map((w) => {
      try { return npmMdx.lookup(w).definition; } catch { return null; }
    });
    const resKeys = extractResourceKeys(foundDefs, 20);
    if (args.mdd && resKeys.length > 0) {
      try {
        const npmMdd = new MDD(args.mdd);
        const vendorMdd = new VendorMDD(args.mdd, { backend: new FsBackend(args.mdd) });
        console.log(`mdd 资源键: ${resKeys.length} 个`);
        totalDiffs += parityCheck('mdd locate', resKeys,
          (k) => npmMdd.locate(k),
          (k) => vendorMdd.locate(k));
      } catch (e) {
        console.log(`[FAIL] mdd 加载失败: ${e && e.message}`);
        totalDiffs += 1;
      }
    } else if (args.mdd) {
      console.log('mdd: 释义中未抽取到资源键,跳过 locate 对比');
    }
    npmMdx.close();
    vendorMdx.close();
  }

  console.log(totalDiffs === 0 ? '\n结论: PARITY OK' : `\n结论: ${totalDiffs} 项差异`);
  process.exit(totalDiffs === 0 ? 0 : 1);
}

main();
