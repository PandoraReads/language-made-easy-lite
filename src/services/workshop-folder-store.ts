/**
 * 跟读工坊目录文件夹的独立持久层(插件目录 sidecar workshop-catalog.json)。
 *
 * 该设置曾存于 settings → data.json——data.json 随 vault 同步,会被同 vault
 * 另一端的 saveSettings 用旧全量快照覆写(iCloud/Obsidian Sync),桌面端设置的
 * 自定义路径被手机端的高频写盘(练习记录/闪卡同步水位)抹回默认
 * 'LME Workshop'(与词典"消失"、aiPrompts 清空、YouTube 订阅丢失同一根因,
 * 见 youtube-rss-store.ts 头注)。3.6.0 起主存储迁至本 sidecar:单值 +
 * updatedAt 时间戳,读-合-写取新者胜,本进程的旧快照不再能抹掉另一端刚写入的路径。
 *
 * 旧 data.json 字段保留两个用途:启动时的一次性迁移源(seedWorkshopFolder 用
 * updatedAt: 0 落盘,保证磁盘上真实的对端值始终能赢过本地播种值),以及给尚未
 * 升级的旧版本 build 做兼容镜像(旧端只认 data.json)。
 *
 * 零 obsidian 依赖,可被 scripts/verify-workshop-folder.mjs 直接打包进 node 测试。
 */

export const WORKSHOP_FOLDER_STORE_VERSION = 1;

export interface WorkshopFolderState {
    version: number;
    /** 目录页读取的文件夹('' = 默认 'LME Workshop')。 */
    folder: string;
    /** 本值最后写入时刻(ms);合并时新者胜。播种值用 0(任何真实写入都能压过)。 */
    updatedAt: number;
}

export function emptyFolderState(): WorkshopFolderState {
    return { version: WORKSHOP_FOLDER_STORE_VERSION, folder: '', updatedAt: 0 };
}

function str(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * 宽容解析:JSON 损坏/非对象 → null(调用方保留内存态并继续);
 * 字段缺失/类型异常逐项消毒,不视为损坏。
 */
export function parseFolderState(raw: string): WorkshopFolderState | null {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return null; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const r = parsed as Record<string, unknown>;
    return {
        version: num(r.version) || WORKSHOP_FOLDER_STORE_VERSION,
        folder: str(r.folder),
        updatedAt: num(r.updatedAt),
    };
}

export function serializeFolderState(state: WorkshopFolderState): string {
    return JSON.stringify({
        version: WORKSHOP_FOLDER_STORE_VERSION,
        folder: state.folder,
        updatedAt: state.updatedAt,
    });
}

/**
 * 对称合并:updatedAt 新者胜;同刻取 file 侧(未变更的一方保持磁盘值,幂等)。
 * 幂等:mergeFolderState(mergeFolderState(f, m), m) 与 mergeFolderState(f, m) 深相等。
 */
export function mergeFolderState(file: WorkshopFolderState, memory: WorkshopFolderState): WorkshopFolderState {
    return memory.updatedAt > file.updatedAt ? { ...memory } : { ...file };
}
