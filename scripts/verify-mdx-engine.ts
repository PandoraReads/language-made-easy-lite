// 引擎核心(dictEngineCore)桌面集成测试:真实牛津十数据
import { readFileSync } from 'node:fs';
import { createDictEngine } from '../src/core/mdx/dictEngineCore';
import { MemoryScannerBackend } from '../src/core/mdx/backends/memoryBackend';
import { MDX, MDD } from 'js-mdict';

const BASE = '/Users/papple/My_LifeOS/EnglishMadeEasy开发文档/词典文件/精装牛津十/OALD 2024.09';
const mdxPath = BASE + '/oaldpe.mdx';
const mddPath = BASE + '/oaldpe.mdd';
const cssPath = BASE + '/oaldpe.css';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

const engine = createDictEngine({
  mdx: { fname: 'oaldpe.mdx', backend: new MemoryScannerBackend(readFileSync(mdxPath)) },
  mdd: [{ fname: 'oaldpe.mdd', backend: new MemoryScannerBackend(readFileSync(mddPath)) }],
  css: readFileSync(cssPath, 'utf-8'),
});
const npmMdx = new MDX(mdxPath);
const npmMdd = new MDD(mddPath);

// 1. 词表规模
check('wordCount>0', engine.wordCount > 10000, String(engine.wordCount));
console.log('wordCount =', engine.wordCount);

// 2. 基础查词
const run = engine.lookup('run');
check('lookup run', !!run && run.length > 100);

// 3. 三级大小写:全大写(词典内是小写词条)
const RUN = engine.lookup('RUN');
check('uppercase retry', !!RUN && RUN === run);

// 4. @@@LINK 重定向:从 npm 结果里找一个 link 词条验证
let linkWord = '';
for (const w of ['running', 'ran', 'runs', 'easier', 'easiest']) {
  const r = npmMdx.lookup(w);
  if (r && r.definition && /^@@@link=/i.test(r.definition.trim())) { linkWord = w; break; }
}
if (linkWord) {
  const redirect = engine.lookup(linkWord);
  check('@@@LINK redirect: ' + linkWord, !!redirect && !/^\s*@@@link/i.test(redirect), redirect?.slice(0, 60));
} else {
  console.log('skip: no @@@LINK sample found in test words');
}

// 5. mdd 资源定位:从释义中抽取资源键(sound:// 前缀按 DictView 惯例剥除),
//    与 npm MDD.locate 对比 — 双方一致(同为 null 或字节相等)即通过
const resKeys: string[] = [];
const def = npmMdx.lookup('run').definition || '';
for (const m of def.matchAll(/(?:src|href)="(?!https?:|data:|#|entry:)([^"]+)"/g)) {
  resKeys.push(m[1]); if (resKeys.length >= 3) break;
}
for (const m of def.matchAll(/sound:\/\/([^\s"']+)/g)) {
  resKeys.push(m[1]); if (resKeys.length >= 6) break;
}
let anyFound = false;
for (const key of resKeys) {
  const mine = engine.getResource(key);
  const npmRes = npmMdd.locate(key);
  let expect: Buffer | null = null;
  if (npmRes && npmRes.definition) expect = Buffer.from(npmRes.definition, 'base64');
  if (mine) anyFound = true;
  const same = (mine == null && expect == null) ||
    (!!mine && !!expect && Buffer.compare(Buffer.from(mine), expect) === 0);
  check('resource: ' + key, same, `mine=${mine && mine.length}B expect=${expect && expect.length}B`);
}

// 6. 大小写/斜杠变体路径:命中过的键做变体再查,应仍能取到等价资源
if (anyFound) {
  const hit = resKeys.find((k) => !!engine.getResource(k))!;
  const variant = hit.replace(/\//g, '\\');
  const v = engine.getResource(variant);
  check('resource path variant', !!v);
}

// 7. CSS 透传
check('css', typeof engine.css === 'string' && engine.css.length > 0);

engine.close();
console.log(`\n结果: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
