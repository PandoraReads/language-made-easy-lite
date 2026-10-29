/**
 * 闪卡数据库稳定 vault 标识的独立持久层(插件目录 sidecar vault-id.json)。
 *
 * 4.2.1 之前闪卡 IndexedDB 库名派生自 vault 绝对路径的哈希:改名或移动仓库
 * 文件夹 → 路径变 → 哈希变 → 插件打开一个全新的空库,用户看到"闪卡全没了"
 * (旧库仍留在 IndexedDB,但不再被打开)。4.2.1 起库名改由本文件持久化的
 * vaultDbId 派生:标识生成一次后随 vault 文件走,改名/移动不再换库。
 *
 * 主存储为插件目录 sidecar 而非 data.json 字段——data.json 随 vault 同步,
 * 会被同 vault 另一端的旧快照整体覆写(iCloud/Obsidian Sync;与词典"消失"、
 * workshopCatalog 被抹回默认同一根因,见 workshop-folder-store.ts 头注)。
 * 若 vaultDbId 被旧快照抹掉,本端会再生成一个新标识 → 又指向空库。sidecar
 * 单值 + updatedAt,读-合-写,同 workshop-catalog 模式。
 *
 * 冲突语义与 workshop-catalog 的"新者胜"不同,这里是"磁盘胜":
 * vaultDbId 只在本端发现磁盘无值时生成一次,此后磁盘永远有值;内存态与
 * 磁盘不一致只可能来自另一端同步来的不同标识,此时采纳磁盘值(它已经随
 * vault 传播),本端刚生成的候选直接丢弃。这样标识收敛到单一值,不会在
 * 多端间振荡。
 *
 * 零 obsidian 依赖,可被 scripts/verify-data-resilience.mjs 直接打包进 node 测试。
 */

export const VAULT_ID_STORE_VERSION = 1;

export interface VaultIdState {
    version: number;
    /** 稳定 vault 标识(随机 UUID);IndexedDB 库名 = LanguageMadeEasyDB_<hash(vaultDbId)>。 */
    vaultDbId: string;
    /** 本值最后写入时刻(ms);仅用于诊断,不参与合并裁决。 */
    updatedAt: number;
}

function str(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * 宽容解析:JSON 损坏/非对象 → null(调用方走生成新标识分支);
 * 字段缺失/类型异常逐项消毒,不视为损坏。vaultDbId 为空串视为无值
 * (等价 null),调用方重新生成。
 */
export function parseVaultIdState(raw: string): VaultIdState | null {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return null; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const r = parsed as Record<string, unknown>;
    const id = str(r.vaultDbId);
    if (!id) return null;
    return {
        version: num(r.version) || VAULT_ID_STORE_VERSION,
        vaultDbId: id,
        updatedAt: num(r.updatedAt),
    };
}

export function serializeVaultIdState(state: VaultIdState): string {
    return JSON.stringify({
        version: VAULT_ID_STORE_VERSION,
        vaultDbId: state.vaultDbId,
        updatedAt: state.updatedAt,
    });
}

export function emptyVaultIdState(): VaultIdState {
    return { version: VAULT_ID_STORE_VERSION, vaultDbId: '', updatedAt: 0 };
}

/**
 * 读-合-写合并:磁盘胜。磁盘有值 → 永远采纳磁盘(多端收敛);
 * 磁盘无值(空串/null)→ 采纳内存值(本端刚生成或镜像迁移)。
 * 幂等:merge(merge(f, m), m) 与 merge(f, m) 深相等。
 */
export function mergeVaultIdState(file: VaultIdState | null, memory: VaultIdState): VaultIdState {
    if (file && file.vaultDbId) return { ...file };
    return { ...memory, updatedAt: Math.max(memory.updatedAt, file?.updatedAt ?? 0) };
}
