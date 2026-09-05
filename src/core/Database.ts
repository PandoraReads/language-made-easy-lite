// ============================================================
// Language Made Easy - IndexedDB Service (Dexie wrapper)
// Multi-language support with data isolation
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// ============================================================

import Dexie, { type Table } from 'dexie';
import type { VocabularyEntry, ReviewLog, VocabTestResult, VocabSizeState, PetState, DeletedCardTombstone, FSRSData } from '../models';
import { randomUUID } from '../mocks/crypto';
import { FREE_FLASHCARD_LIMIT } from '../config/free-limits';

// PandoraReads — 数据库层

// Default FSRS state for imported entries that arrive without one
// (mirrors DEFAULT_FSRS in ui/flashcard-manager-modal.ts).
function defaultFsrsData(now: number): FSRSData {
    return {
        due: now,
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        state: 0,
        last_review: 0,
    };
}

export class LMEDatabase extends Dexie {
    vocabulary!: Table<VocabularyEntry & { language: string }, string>;
    reviewLogs!: Table<ReviewLog & { language: string }, string>;
    vocabTests!: Table<VocabTestResult, string>;
    vocabSizeState!: Table<VocabSizeState, string>;
    petState!: Table<PetState, string>;
    meta!: Table<{ key: string; value: any }, string>;
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

    async configureVault(vaultKey: string): Promise<void> {
        const nextName = `LanguageMadeEasyDB_${LMEDatabase.hashVaultKey(vaultKey || 'default')}`;
        if (this.configuredDbName === nextName) {
            await this.open();
            return;
        }

        if (this.isOpen()) this.close();
        this.name = nextName;
        this.configuredDbName = nextName;
        await this.open();
        await this.migrateLegacyGlobalDbOnce();
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
            console.log(`[LME] Migrated legacy flashcard IndexedDB into vault database: ${this.configuredDbName}`);
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
    }

    async getVocabulary(id: string, language: string = 'english'): Promise<VocabularyEntry | undefined> {
        return await this.vocabulary.where('language').equals(language).get(id);
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
                const word = (changes.word as string).toLowerCase();
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

    // ──── Export / Import ─────────────────────────────────────────

    async exportLanguageData(language: string = 'english'): Promise<{
        vocabulary: (VocabularyEntry & { language: string })[];
        reviewLogs: (ReviewLog & { language: string })[];
        vocabTests: VocabTestResult[];
        vocabSizeState?: VocabSizeState;
        petState?: PetState;
        tombstones: DeletedCardTombstone[];
    }> {
        const [vocabulary, reviewLogs, vocabTests, vocabSizeState, petState, tombstones] = await Promise.all([
            this.vocabulary.where('language').equals(language).toArray(),
            this.reviewLogs.where('language').equals(language).toArray(),
            this.vocabTests.where('language').equals(language).toArray(),
            this.vocabSizeState.get(`${language}-current`),
            this.petState.get(`${language}-pet`),
            this.deletedCardTombstones.where('language').equals(language).toArray()
        ]);
        return { vocabulary, reviewLogs, vocabTests, vocabSizeState, petState, tombstones };
    }


    // ──── Mastered Detection ─────────────────────────────────

    /**
     * Smart merge import: for each incoming entry, keep the newer version
     * based on fsrsData.last_review (fallback addedTime).
     */
    async importLanguageDataWithMerge(
        language: string,
        data: {
            vocabulary?: any[];
            reviewLogs?: any[];
            vocabTests?: VocabTestResult[];
            vocabSizeState?: VocabSizeState;
            petState?: PetState;
            tombstones?: DeletedCardTombstone[];
        }
    ): Promise<{ added: number; updated: number; total: number }> {
        return await this.transaction('rw',
            [this.vocabulary, this.reviewLogs, this.deletedCardTombstones,
             this.vocabTests, this.vocabSizeState, this.petState],
            async () => {
                const incoming = data.vocabulary || [];
                let added = 0;
                let updated = 0;

                // ── Tombstones: merge (LWW by deletedAt), then reap resurrected cards.
                // By-id matches win unconditionally (deletion must beat a peer's later
                // review of the same card, or the merge never converges). By-word matches
                // only reap cards whose addedTime predates the deletion, so a card the
                // user re-created afterwards (newer addedTime) is preserved.
                const localTomb = await this.deletedCardTombstones.where('language').equals(language).toArray();
                const allTomb = new Map<string, DeletedCardTombstone>();           // id -> latest record
                for (const t of localTomb) allTomb.set(t.id, t);
                const toPutTomb: DeletedCardTombstone[] = [];
                for (const t of (data.tombstones || [])) {
                    const prev = allTomb.get(t.id);
                    const ts = t.deletedAt ?? 0;
                    if (!prev || ts > prev.deletedAt) {
                        const rec: DeletedCardTombstone = { id: t.id, language, word: t.word, deletedAt: ts };
                        allTomb.set(t.id, rec);
                        toPutTomb.push(rec);
                    }
                }
                if (toPutTomb.length > 0) await this.deletedCardTombstones.bulkPut(toPutTomb);

                const tombByWord = new Map<string, number>();                     // word -> newest deletedAt (this language)
                for (const t of allTomb.values()) {
                    tombByWord.set(t.word, Math.max(tombByWord.get(t.word) ?? 0, t.deletedAt));
                }
                const isTombstoned = (id: string, word: string, addedTime: number): boolean => {
                    if (allTomb.has(id)) return true;
                    const wt = tombByWord.get(word);
                    return wt !== undefined && addedTime < wt;
                };

                // Reap local cards deleted on a peer (resurrected by an old snapshot).
                const localVocab = await this.vocabulary.where('language').equals(language).toArray();
                const reaped: string[] = [];
                for (const c of localVocab) {
                    if (isTombstoned(c.id, c.word, c.addedTime ?? 0)) reaped.push(c.id);
                }
                if (reaped.length > 0) {
                    await this.vocabulary.bulkDelete(reaped);
                    for (const id of reaped) await this.reviewLogs.where('vocabId').equals(id).delete();
                }

                // ── Vocabulary: upsert with LWW, skipping tombstoned incoming entries.
                let mergedLogRemap: Map<string, string> | null = null;
                if (incoming.length > 0) {
                    const existingById = new Map(localVocab.map(e => [e.id, e]));
                    // A peer card with the same word under a different id violates the
                    // &[language+word] unique index and aborts the WHOLE transaction —
                    // the same ConstraintError class the 3.2.2 JSON-import fix solved.
                    // Fold such entries into the local card instead: local identity
                    // (id/fsrsData/addedTime) wins, content fields get enriched.
                    const reapedIds = new Set(reaped);
                    const existingByWord = new Map(
                        localVocab.filter(e => !reapedIds.has(e.id)).map(e => [e.word, e]));
                    const idRemap = new Map<string, string>(); // peer id -> local id it folded into
                    const toPut = new Map<string, any>();      // word -> pending record (newer wins)
                    const recTime = (r: any): number => r.fsrsData?.last_review ?? r.addedTime ?? 0;
                    const offer = (record: any) => {
                        const prev = toPut.get(record.word);
                        if (!prev || recTime(record) > recTime(prev)) toPut.set(record.word, record);
                    };
                    // 社区免费版:同步合并同样受闪卡总配额约束——已有卡的更新/折叠
                    // 不受影响,仅"净新增"卡按剩余配额截断,超出的条目跳过不合并。
                    let freeSlots = FREE_FLASHCARD_LIMIT - await this.vocabulary.count();
                    for (const entry of incoming) {
                        if (isTombstoned(entry.id, entry.word, entry.addedTime ?? 0)) continue; // resurrected — skip
                        const local = existingById.get(entry.id);
                        if (local) {
                            const syncTime = recTime(entry);
                            const localTime = recTime(local);
                            if (syncTime > localTime) {
                                offer({ ...entry, language });
                                updated++;
                            }
                            // else: local is newer, keep local (no action)
                            continue;
                        }
                        const sameWord = existingByWord.get(entry.word);
                        if (sameWord) {
                            idRemap.set(entry.id, sameWord.id);
                            offer({
                                ...sameWord,
                                phonetic: entry.phonetic ?? sameWord.phonetic,
                                definition: entry.definition ?? sameWord.definition,
                                partOfSpeech: entry.partOfSpeech ?? sameWord.partOfSpeech,
                                contextSnippet: entry.contextSnippet ?? sameWord.contextSnippet,
                                contextTranslation: entry.contextTranslation ?? sameWord.contextTranslation,
                            });
                            updated++;
                        } else {
                            // 免费版配额:仅净新增卡消耗配额,触顶后跳过(同步数据源文件不动)
                            if (freeSlots <= 0) continue;
                            freeSlots--;
                            offer({ ...entry, language });
                            added++;
                        }
                    }
                    if (toPut.size > 0) {
                        await this.vocabulary.bulkPut([...toPut.values()]);
                    }
                    // Peer review logs may reference ids that folded into a local
                    // card — remap them so those reviews count toward that card.
                    mergedLogRemap = idRemap;
                }

                // ── Review logs: deduplicate by logId, drop any whose card is tombstoned.
                if (data.reviewLogs && data.reviewLogs.length > 0) {
                    const logEntries = data.reviewLogs
                        .filter((log: any) => !allTomb.has(log.vocabId))
                        .map((log: any) => ({
                            ...log,
                            language,
                            vocabId: mergedLogRemap?.get(log.vocabId) ?? log.vocabId,
                        }));
                    if (logEntries.length > 0) await this.reviewLogs.bulkPut(logEntries);
                }

                if (data.vocabTests && data.vocabTests.length > 0) {
                    await this.vocabTests.bulkPut(data.vocabTests.map((test: VocabTestResult) => ({ ...test, language })));
                }

                if (data.vocabSizeState) {
                    const incomingState: VocabSizeState = { ...data.vocabSizeState, language, id: `${language}-current` };
                    const localState = await this.vocabSizeState.get(`${language}-current`);
                    if (!localState) {
                        await this.vocabSizeState.put(incomingState);
                    } else {
                        const incomingIds = incomingState.learnedWordIds || [];
                        const localIds = localState.learnedWordIds || [];
                        const learnedWordIds = Array.from(new Set([...localIds, ...incomingIds]));
                        const latestBase = (incomingState.lastTestTime ?? 0) > (localState.lastTestTime ?? 0)
                            ? incomingState
                            : localState;
                        await this.vocabSizeState.put({
                            ...latestBase,
                            id: `${language}-current`,
                            language,
                            learnedWordIds,
                        });
                    }
                }

                // Pet state: last-write-wins by updatedAt (idempotent milestones safe to replay)
                if (data.petState) {
                    const incomingPet: PetState = { ...data.petState, language, id: `${language}-pet` };
                    const localPet = await this.petState.get(`${language}-pet`);
                    const incomingTs = incomingPet.updatedAt ?? 0;
                    const localTs = localPet?.updatedAt ?? 0;
                    if (incomingTs >= localTs) {
                        await this.petState.put(incomingPet);
                    }
                }

                return { added, updated, total: added + updated };
            });
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
            .filter(entry => (entry as any).masteredAt != null)
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
                const ma = (entry as any).masteredAt;
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
        await this.vocabulary.update(id, { masteredAt: Date.now() } as any);
    }

    /**
     * Scan all vocabulary and update masteredAt for newly mastered cards.
     * Returns the number of newly marked cards.
     */
    async syncMasteredStatus(language: string): Promise<number> {
        const entriesWithMastery = await this.getVocabularyWithMastery(language);
        let marked = 0;

        for (const entry of entriesWithMastery) {
            const alreadyMarked = (entry as any).masteredAt != null;
            if (entry._mastered && !alreadyMarked) {
                await this.vocabulary.update(entry.id, { masteredAt: Date.now() } as any);
                marked++;
            } else if (!entry._mastered && alreadyMarked) {
                // No longer mastered (user had a bad review), remove the mark
                await this.vocabulary.update(entry.id, { masteredAt: null } as any);
            }
        }

        return marked;
    }

    // ──── Vocab Size Test ─────────────────────────────────────

    async saveTestResult(result: VocabTestResult): Promise<void> {
        await this.vocabTests.put(result);
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
    }

    async getPetState(language: string): Promise<PetState | undefined> {
        return this.petState.get(`${language}-pet`);
    }

    async savePetState(state: PetState): Promise<void> {
        await this.petState.put(state);
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
