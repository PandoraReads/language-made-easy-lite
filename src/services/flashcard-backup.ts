/**
 * 闪卡备份文件格式、轮换与恢复合并的纯逻辑层。
 *
 * 自动备份(4.2.1,默认开启)每天把闪卡全量数据写进插件目录 backups/
 * flashcards-<时间戳>.json,保留最近 N 份。IndexedDB 是易失存储(清应用
 * 数据/换机器即丢),文件随 vault 走,是闪卡数据的最后兜底;恢复备份与
 * "从其他仓库找回闪卡"共用同一套合并语义(见 planVocabularyMerge)。
 *
 * 零 obsidian/Dexie 依赖,可被 scripts/verify-data-resilience.mjs 直接打包进 node 测试。
 */

import type { FSRSData, ReviewLog, VocabularyEntry, VocabTestResult, VocabSizeState, PetState, DeletedCardTombstone } from '../models';

export const FLASHCARD_BACKUP_VERSION = 1;
export const BACKUP_DIR_NAME = 'backups';
export const BACKUP_FILE_PREFIX = 'flashcards-';
export const DEFAULT_KEEP_BACKUPS = 7;
/** 自动备份最小间隔(ms):同一天内多次变更只落一份。 */
export const AUTO_BACKUP_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface FlashcardBackupTables {
    vocabulary: Array<VocabularyEntry & { language: string }>;
    reviewLogs: Array<ReviewLog & { language: string }>;
    vocabTests: VocabTestResult[];
    vocabSizeState: VocabSizeState[];
    petState: PetState[];
    deletedCardTombstones: DeletedCardTombstone[];
}

export interface FlashcardBackup {
    version: number;
    createdAt: number;
    /** 生成备份时的 vault 标识(诊断用;恢复端不据此选库)。 */
    vaultDbId: string;
    tables: FlashcardBackupTables;
}

export interface ImportSummary {
    /** 新放入的闪卡数(含替换现有词的高进度条目)。 */
    imported: number;
    /** 因库中已有同词且复习进度不低于来方而跳过的条数。 */
    skipped: number;
    /** 被来方更高进度条目替换掉的现有闪卡数。 */
    replaced: number;
}

type BackupTableKey = keyof FlashcardBackupTables;
const TABLE_KEYS: BackupTableKey[] = ['vocabulary', 'reviewLogs', 'vocabTests', 'vocabSizeState', 'petState', 'deletedCardTombstones'];

function rows(value: unknown): unknown[] {
    if (!Array.isArray(value)) return [];
    return value.filter(row => row !== null && typeof row === 'object');
}

/**
 * 宽容解析:JSON 损坏/非对象/缺 version → null;各表缺失或非数组 → 空表,
 * 非对象行被剔除。恢复端对逐行形状不再强校验(旧备份/异端数据以 best-effort
 * 合入,坏行在 Dexie 写入时按行报错回滚整批,不会半写)。
 */
export function parseBackup(raw: string): FlashcardBackup | null {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return null; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const r = parsed as Record<string, unknown>;
    if (typeof r.version !== 'number' || !Number.isFinite(r.version)) return null;
    const source = (r.tables && typeof r.tables === 'object' && !Array.isArray(r.tables) ? r.tables : r) as Record<string, unknown>;
    const tables = {} as FlashcardBackupTables;
    for (const key of TABLE_KEYS) {
        (tables as Record<BackupTableKey, unknown[]>)[key] = rows(source[key]);
    }
    return {
        version: r.version,
        createdAt: typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : 0,
        vaultDbId: typeof r.vaultDbId === 'string' ? r.vaultDbId : '',
        tables,
    };
}

export function serializeBackup(backup: FlashcardBackup): string {
    return JSON.stringify({
        version: backup.version,
        createdAt: backup.createdAt,
        vaultDbId: backup.vaultDbId,
        tables: backup.tables,
    });
}

// ── 备份文件名:flashcards-YYYYMMDDHHmmss.json(定宽 14 位,字典序即时间序) ──

function pad(n: number, width: number): string {
    return String(n).padStart(width, '0');
}

export function buildBackupFileName(now: Date = new Date()): string {
    const stamp = `${pad(now.getFullYear(), 4)}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}`
        + `${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`;
    return `${BACKUP_FILE_PREFIX}${stamp}.json`;
}

/** 从备份文件名解析时间戳;非备份文件名 → null。 */
export function parseBackupFileName(name: string): number | null {
    const m = /^flashcards-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.json$/.exec(name);
    if (!m) return null;
    const ts = new Date(
        Number(m[1]), Number(m[2]) - 1, Number(m[3]),
        Number(m[4]), Number(m[5]), Number(m[6]),
    ).getTime();
    return Number.isFinite(ts) ? ts : null;
}

/** 给定目录内全部文件名,返回应保留的备份名(新→旧截取前 keep 份);keep 最小为 1。 */
export function selectBackupsToKeep(names: string[], keep: number = DEFAULT_KEEP_BACKUPS): string[] {
    const effectiveKeep = Math.max(1, Math.floor(keep));
    return names
        .map(name => ({ name, ts: parseBackupFileName(name) }))
        .filter((x): x is { name: string; ts: number } => x.ts !== null)
        .sort((a, b) => b.ts - a.ts)
        .slice(0, effectiveKeep)
        .map(x => x.name);
}

// ── 恢复/找回共用的合并语义 ──────────────────────────────────────────

/** 合并裁决所需的最小行形状(兼容 VocabularyEntry 与备份/异端原始行)。 */
export interface MergeableVocabRow {
    id: string;
    word: string;
    language?: string;
    fsrsData?: Partial<FSRSData> | null;
}

function repsOf(row: MergeableVocabRow): number {
    const reps = row.fsrsData?.reps;
    return typeof reps === 'number' && Number.isFinite(reps) ? reps : 0;
}

function wordKeyOf(row: MergeableVocabRow): string {
    return `${row.language ?? ''}\u0000${row.word}`;
}

export interface VocabularyMergePlan {
    /** 将写入的来方行(新词 + 胜出的替换行)。 */
    keepIncoming: MergeableVocabRow[];
    /** 现库中将被替换删除的行 id(来方同词且 reps 更高)。 */
    replaceCurrentIds: string[];
    /** 跳过的来方行数(现库已有同词且 reps 不低于来方;含来方内部重复)。 */
    skipCount: number;
}

/**
 * 闪卡合并计划:以 [language+word] 为冲突键(与库上唯一索引一致),
 * 双方都有该词时保留 fsrsData.reps 更大的一方(复习进度是用户最不想
 * 丢的东西);reps 相同保现库(重放同一份备份/同一来源幂等,不会反复
 * 替换)。来方内部重复同词同理只保留 reps 最高的一条。
 */
export function planVocabularyMerge(currentRows: MergeableVocabRow[], incomingRows: MergeableVocabRow[]): VocabularyMergePlan {
    const currentByKey = new Map<string, MergeableVocabRow>();
    for (const row of currentRows) {
        const key = wordKeyOf(row);
        const existing = currentByKey.get(key);
        if (!existing || repsOf(row) > repsOf(existing)) currentByKey.set(key, row);
    }

    // 第一遍:来方内部按冲突键去重,同词只留 reps 最高的一条(平局留先到)。
    const incomingByKey = new Map<string, MergeableVocabRow>();
    let internalDupCount = 0;
    for (const row of incomingRows) {
        const key = wordKeyOf(row);
        const best = incomingByKey.get(key);
        if (!best) { incomingByKey.set(key, row); continue; }
        if (repsOf(row) > repsOf(best)) incomingByKey.set(key, row);
        internalDupCount++;
    }

    // 第二遍:与现库裁决。
    const plan: VocabularyMergePlan = { keepIncoming: [], replaceCurrentIds: [], skipCount: internalDupCount };
    for (const row of incomingByKey.values()) {
        const existing = currentByKey.get(wordKeyOf(row));
        if (!existing) {
            plan.keepIncoming.push(row);
            continue;
        }
        if (repsOf(row) > repsOf(existing)) {
            if (existing.id !== row.id) plan.replaceCurrentIds.push(existing.id);
            plan.keepIncoming.push(row);
        } else {
            plan.skipCount++;
        }
    }
    return plan;
}

/** 主键已在目标库存在的行被剔除(用于"不覆盖现有状态"的单值表:词汇量/宠物)。 */
export function rowsMissingIds<T extends { id: string }>(existingIds: ReadonlySet<string>, incoming: T[]): T[] {
    return incoming.filter(row => !existingIds.has(row.id));
}
