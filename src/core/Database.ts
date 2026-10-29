// ============================================================
// Language Made Easy - IndexedDB Service (Dexie wrapper)
// Multi-language support with data isolation
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// ============================================================

import Dexie, { type Table } from 'dexie';
import type { VocabularyEntry, ReviewLog, VocabTestResult, VocabSizeState, PetState, DeletedCardTombstone } from '../models';
import { planVocabularyMerge, rowsMissingIds, type ImportSummary, type MergeableVocabRow } from '../services/flashcard-backup';

// PandoraReads — 数据库层

/** 异库扫描/找回候选的只读概览。 */
export interface VaultDbCandidate {
    name: string;
    vocabularyCount: number;
    languages: string[];
    /** 最近一张卡的添加时间(ms);0 = 未知。 */
    latestAddedTime: number;
}

export class LMEDatabase extends Dexie {
    vocabulary!: Table<VocabularyEntry & { language: string }, string>;
    reviewLogs!: Table<ReviewLog & { language: string }, string>;
    vocabTests!: Table<VocabTestResult, string>;
    vocabSizeState!: Table<VocabSizeState, string>;
    petState!: Table<PetState, string>;
    meta!: Table<{ key: string; value: unknown }, string>;
    deletedCardTombstones!: Table<DeletedCardTombstone, string>;

    private static readonly LEGACY_DB_NAME = 'LanguageMadeEasyDB';
    private configuredDbName = LMEDatabase.LEGACY_DB_NAME;

    constructor(dbName: string = LMEDatabase.LEGACY_DB_NAME) {
        super(dbName);
        this.configuredDbName = dbName;

        this.version(2).stores({
            vocabulary: 'id, word, addedTime, language, &[language+word], [fsrsData.due]',
            reviewLogs: 'logId, vocabId, reviewTime, language',
        });

        this.version(3).stores({
            vocabulary: 'id, word, addedTime, language, &[language+word], [fsrsData.due]',
            reviewLogs: 'logId, vocabId, reviewTime, language',
        });

        this.version(4).stores({
            vocabulary: 'id, word, addedTime, language, &[language+word], [fsrsData.due]',
            reviewLogs: 'logId, vocabId, reviewTime, language',
            vocabTests: 'id, language, testTime',
            vocabSizeState: 'id, language',
        });

        this.version(5).stores({
            vocabulary: 'id, word, addedTime, language, &[language+word], [fsrsData.due]',
            reviewLogs: 'logId, vocabId, reviewTime, language',
            vocabTests: 'id, language, testTime',
            vocabSizeState: 'id, language',
            petState: 'id, language',
        });

        this.version(6).stores({
            vocabulary: 'id, word, addedTime, language, &[language+word], [fsrsData.due]',
            reviewLogs: 'logId, vocabId, reviewTime, language',
            vocabTests: 'id, language, testTime',
            vocabSizeState: 'id, language',
            petState: 'id, language',
            meta: 'key',
        });

        // v7: tombstones so flashcard deletions propagate across devices on sync.
        this.version(7).stores({
            vocabulary: 'id, word, addedTime, language, &[language+word], [fsrsData.due]',
            reviewLogs: 'logId, vocabId, reviewTime, language',
            vocabTests: 'id, language, testTime',
            vocabSizeState: 'id, language',
            petState: 'id, language',
            meta: 'key',
            deletedCardTombstones: 'id, language, word, deletedAt',
        });
    }

    async configureVault(vaultKey: string, legacyVaultKey?: string): Promise<void> {
        const nextName = `LanguageMadeEasyDB_${LMEDatabase.hashVaultKey(vaultKey || 'default')}`;
        if (this.configuredDbName === nextName) {
            await this.open();
            return;
        }

        if (this.isOpen()) this.close();
        this.name = nextName;
        this.configuredDbName = nextName;
        await this.open();
        // 4.2.1 前库名派生自 vault 绝对路径;升级首启时把旧路径哈希库一次性
        // 收编进新的 vaultDbId 库(调用方仅在生成新 vaultDbId 的那次传入
        // legacyVaultKey,天然只跑一次)。
        if (legacyVaultKey) await this.adoptLegacyPathDb(legacyVaultKey);
        await this.migrateLegacyGlobalDbOnce();
    }

    /**
     * 一次性收编 4.2.1 之前的路径哈希库:全表拷入当前库后删除旧库。
     * 源库用无 schema 的裸 Dexie 打开——只读拷贝不触发 v2→v7 升级,
     * 失败时旧库原样保留,下次升级首启还会再试。
     */
    private async adoptLegacyPathDb(legacyVaultKey: string): Promise<void> {
        const legacyName = `LanguageMadeEasyDB_${LMEDatabase.hashVaultKey(legacyVaultKey || 'default')}`;
        if (legacyName === this.configuredDbName) return;
        try {
            const names = await LMEDatabase.listIndexedDbNames();
            if (!names.includes(legacyName)) return;

            const rows = await LMEDatabase.readAllFromNamedDb(legacyName);
            const hasData = Object.values(rows).some(list => list.length > 0);
            if (hasData) {
                await this.mergeExternalRows(rows);
                console.debug(`[LME] Adopted legacy path-keyed flashcard db: ${legacyName} -> ${this.configuredDbName}`);
            }
            await LMEDatabase.deleteNamedDb(legacyName);
        } catch (error) {
            console.warn('[LME] Legacy path-keyed db adoption skipped:', error);
        }
    }

    private async migrateLegacyGlobalDbOnce(): Promise<void> {
        if (this.configuredDbName === LMEDatabase.LEGACY_DB_NAME) return;
        const migrationKey = 'legacy-global-db-migrated';
        const migrated = await this.meta.get(migrationKey);
        if (migrated?.value === true) return;

        const legacy = new LMEDatabase(LMEDatabase.LEGACY_DB_NAME);
        try {
            await legacy.open();
            const [vocabulary, reviewLogs, vocabTests, vocabSizeState, petState] = await Promise.all([
                legacy.vocabulary.toArray(),
                legacy.reviewLogs.toArray(),
                legacy.vocabTests.toArray(),
                legacy.vocabSizeState.toArray(),
                legacy.petState.toArray(),
            ]);

            const hasLegacyData = vocabulary.length > 0 || reviewLogs.length > 0 || vocabTests.length > 0 || vocabSizeState.length > 0 || petState.length > 0;
            if (!hasLegacyData) {
                await this.meta.put({ key: migrationKey, value: true });
                return;
            }

            const ownerKey = 'lme.flashcardLegacyDbOwner';
            try {
                const owner = window.localStorage.getItem(ownerKey);
                if (owner && owner !== this.configuredDbName) {
                    await this.meta.put({ key: migrationKey, value: true });
                    return;
                }
                if (!owner) {
                    window.localStorage.setItem(ownerKey, this.configuredDbName);
                }
            } catch {
                // If localStorage is unavailable, continue with the per-vault meta guard.
            }

            await this.transaction('rw', this.vocabulary, this.reviewLogs, this.vocabTests, this.vocabSizeState, this.petState, this.meta, async () => {
                if (vocabulary.length > 0) await this.vocabulary.bulkPut(vocabulary);
                if (reviewLogs.length > 0) await this.reviewLogs.bulkPut(reviewLogs);
                if (vocabTests.length > 0) await this.vocabTests.bulkPut(vocabTests);
                if (vocabSizeState.length > 0) await this.vocabSizeState.bulkPut(vocabSizeState);
                if (petState.length > 0) await this.petState.bulkPut(petState);
                await this.meta.put({ key: migrationKey, value: true });
            });
            console.debug(`[LME] Migrated legacy flashcard IndexedDB into vault database: ${this.configuredDbName}`);
        } catch (error) {
            console.warn('[LME] Legacy flashcard IndexedDB migration skipped:', error);
            await this.meta.put({ key: migrationKey, value: true });
        } finally {
            legacy.close();
        }
    }

    private static hashVaultKey(input: string): string {
        let h1 = 0xdeadbeef;
        let h2 = 0x41c6ce57;
        for (let i = 0; i < input.length; i++) {
            const ch = input.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return ((h2 >>> 0).toString(36) + (h1 >>> 0).toString(36)).slice(0, 16);
    }

    // ──── Cross-db recovery helpers (4.2.1) ────────────────────

    private static readonly DATA_TABLE_NAMES = ['vocabulary', 'reviewLogs', 'vocabTests', 'vocabSizeState', 'petState', 'deletedCardTombstones'] as const;

    /** indexedDB.databases() 的特性探测包装;不支持(旧 WebView)或失败 → []。 */
    static async listIndexedDbNames(): Promise<string[]> {
        // 项目 tsconfig 无 DOM lib 的 IndexedDB 接口名,经 globalThis 形状访问
        const factory = (globalThis as { indexedDB?: { databases?: () => Promise<Array<{ name?: string }>> } }).indexedDB;
        if (!factory || typeof factory.databases !== 'function') return [];
        try {
            const dbs = await factory.databases();
            return dbs
                .map((d: { name?: string }) => d.name)
                .filter((n: string | undefined): n is string => typeof n === 'string');
        } catch {
            return [];
        }
    }

    /**
     * 用无 schema 的裸 Dexie 读命名库全表:不声明版本即按现有版本打开,
     * 绝不触发 schema 升级——源库可能属于另一 vault 的旧版本插件,把它
     * 升到 v7 会让那端的旧 Dexie 直接 VersionError。缺表 → 该表空数组。
     */
    private static async readAllFromNamedDb(name: string): Promise<Record<string, unknown[]>> {
        const out: Record<string, unknown[]> = {};
        const src = new Dexie(name);
        try {
            await src.open();
            for (const table of LMEDatabase.DATA_TABLE_NAMES) {
                try {
                    out[table] = await src.table(table).toArray();
                } catch {
                    out[table] = [];
                }
            }
        } catch {
            for (const table of LMEDatabase.DATA_TABLE_NAMES) out[table] = [];
        } finally {
            try { src.close(); } catch { /* already closed */ }
        }
        return out;
    }

    private static async deleteNamedDb(name: string): Promise<void> {
        try {
            await Dexie.delete(name);
        } catch (error) {
            console.warn(`[LME] Failed to remove adopted db ${name}:`, error);
        }
    }

    /**
     * 扫描本机上其他 LME 闪卡库(改名/移动前的旧库,或其他 vault 的库),
     * 只报告有卡的库。供"从其他仓库找回闪卡"列表与启动找回提示使用。
     */
    static async listOtherVaultDbs(currentName: string): Promise<VaultDbCandidate[]> {
        const names = await LMEDatabase.listIndexedDbNames();
        const candidates = names.filter(n => n.startsWith('LanguageMadeEasyDB') && n !== currentName);
        const out: VaultDbCandidate[] = [];
        for (const name of candidates) {
            const probe = new Dexie(name);
            try {
                await probe.open();
                const vocabulary: Array<{ language?: string; addedTime?: number }> = await probe.table('vocabulary').toArray();
                if (vocabulary.length === 0) continue;
                const languages = [...new Set(vocabulary.map(v => v.language ?? '').filter(Boolean))];
                const latestAddedTime = vocabulary.reduce((max, v) => Math.max(max, v.addedTime ?? 0), 0);
                out.push({ name, vocabularyCount: vocabulary.length, languages, latestAddedTime });
            } catch {
                // 打不开的库跳过,不影响其他候选
            } finally {
                try { probe.close(); } catch { /* already closed */ }
            }
        }
        return out.sort((a, b) => b.vocabularyCount - a.vocabularyCount);
    }

    /** 全表导出(自动备份/手动备份用)。 */
    async dumpAllTables(): Promise<Record<string, unknown[]>> {
        const [vocabulary, reviewLogs, vocabTests, vocabSizeState, petState, deletedCardTombstones] = await Promise.all([
            this.vocabulary.toArray(),
            this.reviewLogs.toArray(),
            this.vocabTests.toArray(),
            this.vocabSizeState.toArray(),
            this.petState.toArray(),
            this.deletedCardTombstones.toArray(),
        ]);
        return { vocabulary, reviewLogs, vocabTests, vocabSizeState, petState, deletedCardTombstones };
    }

    /**
     * 把外部行(异库或备份文件)合并进当前库:
     * - vocabulary 走 planVocabularyMerge(同词保 reps 高者,幂等);
     * - reviewLogs/vocabTests/tombstones 按主键并集;
     * - vocabSizeState/petState 只补缺,不覆盖现有状态。
     * 整批一个事务,失败整体回滚。
     */
    async mergeExternalRows(rows: Record<string, unknown[]>): Promise<ImportSummary> {
        const incomingVocab = (rows.vocabulary ?? []) as Array<VocabularyEntry & { language: string }>;
        const currentVocab = await this.vocabulary.toArray();
        const plan = planVocabularyMerge(
            currentVocab as MergeableVocabRow[],
            incomingVocab as MergeableVocabRow[],
        );

        const [currentTests, currentSizeStates, currentPets] = await Promise.all([
            this.vocabTests.toArray(),
            this.vocabSizeState.toArray(),
            this.petState.toArray(),
        ]);
        const newTests = rowsMissingIds(new Set(currentTests.map(r => r.id)), (rows.vocabTests ?? []) as VocabTestResult[]);
        const newSizeStates = rowsMissingIds(new Set(currentSizeStates.map(r => r.id)), (rows.vocabSizeState ?? []) as VocabSizeState[]);
        const newPets = rowsMissingIds(new Set(currentPets.map(r => r.id)), (rows.petState ?? []) as PetState[]);

        const keepIncoming = plan.keepIncoming as Array<VocabularyEntry & { language: string }>;
        // Dexie 单事务 >5 表需走数组重载(7 参形式超出 d.ts 覆盖)
        await this.transaction('rw',
            [this.vocabulary, this.reviewLogs, this.vocabTests, this.vocabSizeState, this.petState, this.deletedCardTombstones],
            async () => {
            if (plan.replaceCurrentIds.length > 0) await this.vocabulary.bulkDelete(plan.replaceCurrentIds);
            if (keepIncoming.length > 0) await this.vocabulary.bulkPut(keepIncoming);
            const reviewLogs = (rows.reviewLogs ?? []) as Array<ReviewLog & { language: string }>;
            if (reviewLogs.length > 0) await this.reviewLogs.bulkPut(reviewLogs);
            if (newTests.length > 0) await this.vocabTests.bulkPut(newTests);
            if (newSizeStates.length > 0) await this.vocabSizeState.bulkPut(newSizeStates);
            if (newPets.length > 0) await this.petState.bulkPut(newPets);
            const tombstones = (rows.deletedCardTombstones ?? []) as DeletedCardTombstone[];
            if (tombstones.length > 0) await this.deletedCardTombstones.bulkPut(tombstones);
        });

        this.notifyMutated();
        return { imported: plan.keepIncoming.length, skipped: plan.skipCount, replaced: plan.replaceCurrentIds.length };
    }

    /** 从另一个 LME 库(旧路径库/其他 vault)导入;合并语义同 mergeExternalRows。 */
    async importFromVaultDb(name: string): Promise<ImportSummary> {
        const rows = await LMEDatabase.readAllFromNamedDb(name);
        return await this.mergeExternalRows(rows);
    }

    // ──── Mutation hook (auto-backup dirty flag) ───────────────

    /** 数据被写入后触发(加卡/复习/删除/测试/宠物);由宿主接去调度自动备份。 */
    onDataMutated?: () => void;

    private notifyMutated(): void {
        if (!this.onDataMutated) return;
        try {
            this.onDataMutated();
        } catch (error) {
            console.warn('[LME] onDataMutated handler failed:', error);
        }
    }

    // ──── Helper: Get language-specific tables ─────────────────────

    private getLanguage(language: string) {
        return {
            vocabulary: this.vocabulary.where('language').equals(language),
            reviewLogs: this.reviewLogs.where('language').equals(language)
        };
    }

    // ──── Vocabulary CRUD ─────────────────────────────────────

    async addVocabulary(entry: VocabularyEntry, language: string = 'english'): Promise<void> {
        await this.vocabulary.put({ ...entry, language });
        this.notifyMutated();
    }

    async getVocabulary(id: string, language: string = 'english'): Promise<VocabularyEntry | undefined> {
        // Dexie 4 dropped WhereClause/Collection.get(); keep the legacy call, typed to the contract above.
        const scoped = this.vocabulary.where('language').equals(language) as unknown as {
            get(id: string): Promise<VocabularyEntry | undefined>;
        };
        return await scoped.get(id);
    }

    async getVocabularyByWord(word: string, language: string = 'english'): Promise<VocabularyEntry | undefined> {
        return await this.vocabulary
            .where('language').equals(language)
            .and(entry => entry.word === word.toLowerCase())
            .first();
    }

    async getAllVocabulary(language: string = 'english'): Promise<VocabularyEntry[]> {
        const results = await this.vocabulary
            .where('language').equals(language)
            .sortBy('addedTime');
        return results.reverse();
    }

    async getVocabularyCount(language: string = 'english'): Promise<number> {
        return this.vocabulary.where('language').equals(language).count();
    }

    /** 全部语种合计的闪卡总数(免费版配额按总量计)。 */
    async getTotalVocabularyCount(): Promise<number> {
        return this.vocabulary.count();
    }

    async updateVocabulary(id: string, changes: Partial<VocabularyEntry>): Promise<void> {
        // Editing a card's word onto a previously-deleted word counts as an
        // explicit re-create — clear that word's tombstone so peer sync doesn't
        // reap the renamed card. The review hot-path only sends fsrsData, so this
        // branch is skipped on every review (zero overhead).
        if (changes.word !== undefined) {
            const card = await this.vocabulary.get(id);
            if (card) {
                const word = (changes.word).toLowerCase();
                const stale = await this.deletedCardTombstones
                    .where('language').equals(card.language)
                    .and(t => t.word === word)
                    .toArray();
                if (stale.length > 0) {
                    await this.deletedCardTombstones.bulkDelete(stale.map(t => t.id));
                }
            }
        }
        await this.vocabulary.update(id, changes);
        this.notifyMutated();
    }

    async deleteVocabulary(id: string): Promise<void> {
        await this.transaction('rw', this.vocabulary, this.reviewLogs, this.deletedCardTombstones, async () => {
            // Record a tombstone before the row disappears, so the deletion can
            // propagate to peer devices on the next sync. Missing card = no-op.
            const card = await this.vocabulary.get(id);
            if (card) {
                await this.deletedCardTombstones.put({
                    id: card.id, language: card.language, word: card.word, deletedAt: Date.now(),
                });
            }
            await this.vocabulary.delete(id);
            await this.reviewLogs.where('vocabId').equals(id).delete();
        });
        this.notifyMutated();
    }

    // ──── Due Cards ───────────────────────────────────────────

    async getDueVocabulary(language: string = 'english', limit?: number): Promise<VocabularyEntry[]> {
        const now = Date.now();
        let col = this.vocabulary
            .filter(v => v.fsrsData.due <= now && v.language === language)
            .reverse();
        if (limit) col = col.limit(limit);
        return col.toArray();
    }

    async getDailySessionVocabulary(language: string = 'english', limit?: number, extraExcludedIds?: Set<string>): Promise<VocabularyEntry[]> {
        const now = Date.now();
        const reviewedToday = await this.getTodayReviewedVocabIds(language);
        if (extraExcludedIds) {
            extraExcludedIds.forEach(id => reviewedToday.add(id));
        }
        let col = this.vocabulary
            .filter(v => v.fsrsData.due <= now && v.language === language && !reviewedToday.has(v.id))
            .reverse();
        if (limit) col = col.limit(limit);
        return col.toArray();
    }

    async getTodayDueCount(language: string = 'english'): Promise<number> {
        const now = Date.now();
        return this.vocabulary
            .filter(v => v.fsrsData.due <= now && v.language === language)
            .count();
    }

    async getNewCards(language: string = 'english', limit: number): Promise<VocabularyEntry[]> {
        return this.vocabulary
            .filter(v => v.fsrsData.state === 0 && v.language === language)
            .limit(limit)
            .toArray();
    }

    // ──── Review Logs ─────────────────────────────────────────

    async addReviewLog(log: ReviewLog & { language: string }): Promise<void> {
        await this.reviewLogs.put(log);
        this.notifyMutated();
    }

    async getReviewLogs(vocabId: string, language: string): Promise<ReviewLog[]> {
        return this.reviewLogs.where('language').equals(language).and(log => log.vocabId === vocabId).toArray();
    }

    async getTodayReviewCount(language: string = 'english'): Promise<number> {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        return this.reviewLogs
            .where('language').equals(language)
            .and(log => log.reviewTime >= startOfDay.getTime())
            .count();
    }

    async getTodayReviewedVocabIds(language: string = 'english'): Promise<Set<string>> {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const logs = await this.reviewLogs
            .where('language').equals(language)
            .and(log => log.reviewTime >= startOfDay.getTime())
            .toArray();
        return new Set(logs.map(log => log.vocabId));
    }

    async getReviewLogsByLanguage(language: string = 'english'): Promise<ReviewLog[]> {
        return this.reviewLogs
            .where('language').equals(language)
            .toArray();
    }

    // ──── Mastered Detection ─────────────────────────────────

    /**
     * Check if a single card is mastered:
     * 2 consecutive Easy(4) OR 5 consecutive Good(3)
     */
    async isMastered(vocabId: string, language: string): Promise<boolean> {
        const logs = await this.reviewLogs
            .where('language').equals(language)
            .and(log => log.vocabId === vocabId)
            .reverse()
            .sortBy('reviewTime');

        // Take the most recent reviews
        const recent = logs.slice(0, 5);
        if (recent.length < 2) return false;

        // Check 2 consecutive Easy
        if (recent.length >= 2 && recent[0].rating === 4 && recent[1].rating === 4) {
            return true;
        }

        // Check 5 consecutive Good (rating >= 3, i.e. Good or Easy)
        if (recent.length >= 5 &&
            recent[0].rating >= 3 && recent[1].rating >= 3 &&
            recent[2].rating >= 3 && recent[3].rating >= 3 &&
            recent[4].rating >= 3) {
            return true;
        }

        return false;
    }

    /**
     * Get all vocabulary entries with computed mastery state for a language.
     * Returns entries with an additional `_mastered` boolean field.
     */
    async getVocabularyWithMastery(language: string): Promise<(VocabularyEntry & { _mastered: boolean })[]> {
        const entries = await this.vocabulary
            .where('language').equals(language)
            .toArray();

        if (entries.length === 0) return [];

        // Batch fetch all review logs for this language
        const allLogs = await this.reviewLogs
            .where('language').equals(language)
            .toArray();

        // Group logs by vocabId
        const logsByVocab = new Map<string, ReviewLog[]>();
        for (const log of allLogs) {
            const arr = logsByVocab.get(log.vocabId);
            if (arr) {
                arr.push(log);
            } else {
                logsByVocab.set(log.vocabId, [log]);
            }
        }

        // Sort each log array by reviewTime descending
        for (const [, logs] of logsByVocab) {
            logs.sort((a, b) => b.reviewTime - a.reviewTime);
        }

        return entries.map(entry => {
            const logs = logsByVocab.get(entry.id) || [];
            let mastered = false;

            // 2 consecutive Easy
            if (logs.length >= 2 && logs[0].rating === 4 && logs[1].rating === 4) {
                mastered = true;
            }
            // 5 consecutive Good+
            if (!mastered && logs.length >= 5 &&
                logs[0].rating >= 3 && logs[1].rating >= 3 &&
                logs[2].rating >= 3 && logs[3].rating >= 3 &&
                logs[4].rating >= 3) {
                mastered = true;
            }

            return { ...entry, _mastered: mastered };
        });
    }

    /**
     * Get all mastered vocabulary for a language (entries with masteredAt set).
     */
    async getMasteredVocabulary(language: string): Promise<VocabularyEntry[]> {
        return this.vocabulary
            .where('language').equals(language)
            .filter(entry => (entry as unknown).masteredAt != null)
            .toArray();
    }

    /**
     * Get mastered vocabulary entries whose masteredAt is before a given timestamp.
     * Used for auto-cleanup.
     */
    async getMasteredBefore(language: string, beforeTime: number): Promise<VocabularyEntry[]> {
        return this.vocabulary
            .where('language').equals(language)
            .filter(entry => {
                const ma = entry.masteredAt;
                return ma != null && ma < beforeTime;
            })
            .limit(50)
            .toArray();
    }

    /**
     * Batch delete vocabulary entries and their review logs.
     */
    async batchDeleteVocabulary(ids: string[]): Promise<number> {
        if (ids.length === 0) return 0;

        await this.transaction('rw', this.vocabulary, this.reviewLogs, this.deletedCardTombstones, async () => {
            // Record tombstones before the rows disappear, so deletions propagate.
            const cards = await this.vocabulary.bulkGet(ids);
            const now = Date.now();
            const tombstones: DeletedCardTombstone[] = [];
            for (const card of cards) {
                if (card) {
                    tombstones.push({ id: card.id, language: card.language, word: card.word, deletedAt: now });
                }
            }
            if (tombstones.length > 0) await this.deletedCardTombstones.bulkPut(tombstones);

            await this.vocabulary.bulkDelete(ids);
            // Delete associated review logs
            for (const id of ids) {
                await this.reviewLogs.where('vocabId').equals(id).delete();
            }
        });
        this.notifyMutated();
        return ids.length;
    }

    /**
     * Delete tombstones older than maxAgeMs. Returns the count removed.
     */
    async gcExpiredTombstones(maxAgeMs: number): Promise<number> {
        const cutoff = Date.now() - maxAgeMs;
        return await this.deletedCardTombstones.where('deletedAt').below(cutoff).delete();
    }

    /**
     * Run tombstone GC at most once per day (guarded by the meta table), so the
     * periodic sync timer can call it freely without hot-looping the scan.
     */
    async maybeGcTombstones(maxAgeMs: number): Promise<void> {
        const key = 'tombstoneGcLastRun';
        const last = await this.meta.get(key);
        const now = Date.now();
        if (last && typeof last.value === 'number' && now - last.value < 86400000) return;
        await this.gcExpiredTombstones(maxAgeMs);
        await this.meta.put({ key, value: now });
    }

    /**
     * Get vocabulary statistics grouped by mastery level.
     */
    async getVocabularyStats(language: string): Promise<{
        total: number;
        newCount: number;
        learningCount: number;
        masteredCount: number;
    }> {
        const entriesWithMastery = await this.getVocabularyWithMastery(language);

        let newCount = 0;
        let learningCount = 0;
        let masteredCount = 0;

        for (const entry of entriesWithMastery) {
            if (entry._mastered) {
                masteredCount++;
            } else if (entry.fsrsData.state === 0) {
                newCount++;
            } else {
                // state 1 (Learning) + state 2 (Review) + state 3 (Relearning) = "学习中"
                learningCount++;
            }
        }

        return {
            total: entriesWithMastery.length,
            newCount,
            learningCount,
            masteredCount,
        };
    }

    /**
     * Mark a vocabulary entry as mastered with the current timestamp.
     */
    async markAsMastered(id: string): Promise<void> {
        await this.vocabulary.update(id, { masteredAt: Date.now() });
        this.notifyMutated();
    }

    /**
     * Scan all vocabulary and update masteredAt for newly mastered cards.
     * Returns the number of newly marked cards.
     */
    async syncMasteredStatus(language: string): Promise<number> {
        const entriesWithMastery = await this.getVocabularyWithMastery(language);
        let marked = 0;

        for (const entry of entriesWithMastery) {
            const alreadyMarked = (entry as unknown).masteredAt != null;
            if (entry._mastered && !alreadyMarked) {
                await this.vocabulary.update(entry.id, { masteredAt: Date.now() });
                marked++;
            } else if (!entry._mastered && alreadyMarked) {
                // No longer mastered (user had a bad review), remove the mark
                await this.vocabulary.update(entry.id, { masteredAt: null } as unknown);
            }
        }

        if (marked > 0) this.notifyMutated();
        return marked;
    }

    // ──── Vocab Size Test ─────────────────────────────────────

    async saveTestResult(result: VocabTestResult): Promise<void> {
        await this.vocabTests.put(result);
        this.notifyMutated();
    }

    async getLatestTestResult(language: string): Promise<VocabTestResult | undefined> {
        return this.vocabTests
            .where('language').equals(language)
            .reverse()
            .sortBy('testTime')
            .then(results => results[0]);
    }

    async getVocabSizeState(language: string): Promise<VocabSizeState | undefined> {
        return this.vocabSizeState.get(`${language}-current`);
    }

    async saveVocabSizeState(state: VocabSizeState): Promise<void> {
        await this.vocabSizeState.put(state);
        this.notifyMutated();
    }

    async getPetState(language: string): Promise<PetState | undefined> {
        return this.petState.get(`${language}-pet`);
    }

    async savePetState(state: PetState): Promise<void> {
        await this.petState.put(state);
        this.notifyMutated();
    }

    async getVocabSizeHistory(language: string, limit: number = 10): Promise<VocabTestResult[]> {
        return this.vocabTests
            .where('language').equals(language)
            .reverse()
            .sortBy('testTime')
            .then(results => results.slice(0, limit));
    }
}

// Singleton
export const db = new LMEDatabase();
