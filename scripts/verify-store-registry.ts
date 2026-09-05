/**
 * 词典注册表纯逻辑冒烟测试(splitStoreEntries / computeReconcile)。
 *
 * storeRegistry.ts 保持零 obsidian 依赖,可被 esbuild 直接打包进 node 执行
 * (仿 test:engine 模式)。OPFS 触碰(reconcileStoreDicts)不在本测试范围。
 *
 * Run:  npm run test:registry
 */
import {
    splitStoreEntries,
    computeReconcile,
    type StoreDictMap,
    type ReconcileMeta,
} from '../src/core/dictStore/storeRegistry';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
    if (cond) {
        pass++;
    } else {
        fail++;
        console.log('FAIL:', name, detail || '');
    }
}

// ── splitStoreEntries ────────────────────────────────────────────────
{
    // 混合数组:store 条目被抽出,路径条目保留,空语言键保留
    const settings = {
        localDictionaries: {
            english: [
                { id: 'p1', name: 'OALD', mdxPath: '/dict/oald.mdx' },
                { id: 's1', name: '牛津十', source: 'store', storeId: 'uuid-1', sizeBytes: 123 },
                { id: 'p2', name: '朗文', mdxPath: '/dict/longman.mdx' },
            ],
            german: [{ name: '缺id的store', source: 'store', storeId: 'uuid-2' }],
            french: [],
        },
    };
    const { clean, extracted } = splitStoreEntries(settings.localDictionaries);
    check('split: 路径条目保留', clean.english.length === 2 && clean.english[0].id === 'p1');
    check('split: store 条目抽出', extracted.length === 2 && extracted[0].entry.storeId === 'uuid-1');
    check('split: 缺 id 补 store_ 前缀', extracted[1].entry.id === 'store_uuid-2');
    check('split: 缺 sizeBytes 补 0', extracted[1].entry.sizeBytes === 0);
    check('split: 语言键保留(空数组)', Array.isArray(clean.french) && clean.french.length === 0);
    check('split: 无 store 条目的语言', clean.german.length === 0);

    // 无 store 条目 → extracted 为空(迁移早退条件)
    const { extracted: none } = splitStoreEntries({ english: [{ id: 'p1', mdxPath: '/a.mdx' }] });
    check('split: 无 store 条目时 extracted 空', none.length === 0);

    // 坏输入容错
    check('split: null 容错', splitStoreEntries(null).extracted.length === 0);
    check('split: 非数组语言容错', splitStoreEntries({ english: 'junk' }).clean.english.length === 0);

    // store 但无 storeId → 留在 clean(不可判别,不丢数据)
    const { clean: c2, extracted: e2 } = splitStoreEntries({ english: [{ id: 'x', source: 'store' }] });
    check('split: 无 storeId 的 store 条目留在原处', c2.english.length === 1 && e2.length === 0);
}

// ── computeReconcile ────────────────────────────────────────────────
{
    // 1) 注册表与 OPFS 一致 → 无变化
    const r1: StoreDictMap = { english: [{ id: 'a', name: 'A', storeId: 's-a', sizeBytes: 10 }] };
    const m1: ReconcileMeta[] = [{ id: 's-a', name: 'A', language: 'english', totalSize: 10 }];
    const o1 = computeReconcile(r1, m1);
    check('reconcile: 一致时无变化', !o1.changed && o1.missingCount === 0 && o1.restored.length === 0);

    // 2) 注册表有、OPFS 无 → 标 missing
    const o2 = computeReconcile(r1, []);
    check('reconcile: 数据被清 → 标 missing', o2.changed && o2.missingCount === 1
        && o2.next.english[0].missing === true);

    // 3) 之前 missing、OPFS 又有了 → 清除标记
    const r3: StoreDictMap = { english: [{ id: 'a', name: 'A', storeId: 's-a', sizeBytes: 10, missing: true }] };
    const o3 = computeReconcile(r3, m1);
    check('reconcile: 数据恢复 → 清 missing', o3.changed && o3.missingCount === 0
        && o3.next.english[0].missing !== true);

    // 4) OPFS 有、注册表无 → 自动恢复(确定性 id,按 meta.language 归组)
    const o4 = computeReconcile({}, [
        { id: 's-x', name: '牛津十', language: 'english', totalSize: 456 },
        { id: 's-y', name: '无语言词典' },
    ]);
    check('reconcile: 恢复条目计数', o4.changed && o4.restored.length === 2);
    const restoredX = (o4.next.english || []).find(e => e.storeId === 's-x');
    check('reconcile: 按 meta.language 归组', !!restoredX && restoredX.name === '牛津十' && restoredX.sizeBytes === 456);
    const restoredY = (o4.next.english || []).find(e => e.storeId === 's-y');
    check('reconcile: 无 language 回退 english', !!restoredY && restoredY.id === 'store_s-y');

    // 5) 恢复结果再对账一遍 → 稳定无变化(幂等)
    const o5 = computeReconcile(o4.next, [
        { id: 's-x', name: '牛津十', language: 'english', totalSize: 456 },
        { id: 's-y', name: '无语言词典', language: 'english' },
    ]);
    check('reconcile: 幂等(第二轮无变化)', !o5.changed && o5.restored.length === 0 && o5.missingCount === 0);

    // 6) ephemeral(内存档)条目:OPFS 无记录也不标 missing,原样保留
    const r6: StoreDictMap = { english: [{ id: 'e1', name: 'M', storeId: 's-e', sizeBytes: 1, ephemeral: true }] };
    const o6 = computeReconcile(r6, []);
    check('reconcile: ephemeral 不标 missing', !o6.changed && o6.missingCount === 0
        && o6.next.english[0].ephemeral === true);

    // 7) 空注册表 + 空 OPFS → 无变化
    const o7 = computeReconcile({}, []);
    check('reconcile: 双空无变化', !o7.changed && Object.keys(o7.next).length === 0);

    // 8) 缺失语言键的注册表条目 + 恢复并存:同语言合并
    const r8: StoreDictMap = { german: [{ id: 'g1', name: 'G', storeId: 's-g', sizeBytes: 1 }] };
    const o8 = computeReconcile(r8, [{ id: 's-g', name: 'G', language: 'german' },
        { id: 's-h', name: 'H', language: 'german' }]);
    check('reconcile: 同语言恢复追加在尾部', o8.next.german.length === 2
        && o8.next.german[1].storeId === 's-h');
}

console.log(`\nverify-store-registry: ${pass} passed, ${fail} failed`);
if (fail > 0) {
    process.exit(1);
}
