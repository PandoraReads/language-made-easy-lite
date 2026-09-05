// ============================================================
// SyncManager - Bidirectional flashcard + pet sync via vault files
//
// Each device writes its OWN export to {deviceId}.json inside the
// sync folder. On load, periodically, and on demand, every device
// scans that folder, silently merges any NEWER peer files, and skips
// its own. Because Database.importLanguageDataWithMerge is already
// symmetric (last-write-wins per record), data converges across any
// number of devices without clobbering.
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// ============================================================

import type LanguageMadeEasyPlugin from '../main-unified-full';
import { db } from './Database';
import { petService } from './PetService';
import { vocabSizeService } from './VocabSizeService';

const ALL_LANGUAGES = ['english', 'german', 'french', 'spanish', 'korean', 'russian', 'japanese', 'chinese'] as const;

// Tombstones are kept indefinitely: each is only 4 small fields, so even years
// of deletes stay in the KB range for a single user, and never GC-ing removes
// any chance of a long-offline device resurrecting a GC'd card. Lower this to
// age out old tombstones if storage ever matters.
const TOMBSTONE_TTL_MS = Number.MAX_SAFE_INTEGER;

export interface SyncResult {
    added: number;
    updated: number;
    totalCards: number;
    totalLogs: number;
    peers: number; // number of peer devices merged this run
}

const EMPTY_RESULT: SyncResult = { added: 0, updated: 0, totalCards: 0, totalLogs: 0, peers: 0 };

/** Folder that holds all per-device sync files (dirname of the configured path). */
function syncDir(filePath: string): string {
    const idx = filePath.lastIndexOf('/');
    return idx >= 0 ? filePath.substring(0, idx) : '';
}

/** This device's own sync file: {dir}/{deviceId}.json */
function ownFilePath(filePath: string, deviceId: string): string {
    const dir = syncDir(filePath);
    const file = `${deviceId}.json`;
    return dir ? `${dir}/${file}` : file;
}

/**
 * cyrb53 — small, fast, well-distributed 53-bit string hash (public domain).
 * Used to fingerprint a sync payload so we can skip redundant writes when the
 * data is unchanged (each write would trigger vault-sync upload traffic).
 */
function cyrb53(str: string, seed = 0): number {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export class SyncManager {

    /**
     * Write THIS device's full export to {deviceId}.json — but only when the
     * data has actually changed since the last export (compared via a hash of
     * the payload). Skipping unchanged writes avoids needless vault-sync upload
     * traffic on the periodic timer. Also retires the legacy single shared
     * file on first use.
     */
    static async exportOwn(plugin: LanguageMadeEasyPlugin): Promise<void> {
        const filePath = plugin.settings.flashcardSyncFilePath;
        // Per-physical-device id (localStorage), NOT settings.deviceId (vault-level).
        const deviceId = plugin.syncDeviceId;
        if (!filePath || !deviceId || !plugin.settings.flashcardSyncEnabled) return;

        try {
            const languages = [];
            for (const lang of ALL_LANGUAGES) {
                const data = await db.exportLanguageData(lang);
                // Include a language if it has cards, vocab-size data, or a pet,
                // so progress-only records travel too.
                if (data.vocabulary.length > 0 || data.vocabTests.length > 0 || data.vocabSizeState || data.petState || data.tombstones.length > 0) {
                    languages.push({
                        language: lang,
                        vocabulary: data.vocabulary,
                        reviewLogs: data.reviewLogs,
                        vocabTests: data.vocabTests,
                        vocabSizeState: data.vocabSizeState,
                        petState: data.petState,
                        tombstones: data.tombstones,
                    });
                }
            }
            if (languages.length === 0) return;

            const adapter = plugin.app.vault.adapter;
            const dir = syncDir(filePath);
            if (dir && !(await adapter.exists(dir))) {
                await adapter.mkdir(dir);
            }
            const ownPath = ownFilePath(filePath, deviceId);

            // Skip the write when nothing changed since the last export. The
            // signature excludes exportTime (which always changes), so only real
            // data changes produce a new signature. Old files without a
            // signature fall through to a (one-time) rewrite.
            const signature = cyrb53(JSON.stringify(languages));
            try {
                const existing = JSON.parse(await adapter.read(ownPath));
                if (existing && existing.signature === signature) {
                    return; // unchanged — skip write, skip vault-sync churn
                }
            } catch { /* no/invalid prior file → proceed to write */ }

            const payload = {
                version: 4,
                exportTime: Date.now(),
                sourceDevice: deviceId,
                signature,
                languages,
            };
            await adapter.write(ownPath, JSON.stringify(payload));

            // Retire the legacy single shared file — we now write per-device.
            const legacyBase = filePath.substring(filePath.lastIndexOf('/') + 1);
            if (legacyBase === 'flashcard-sync.json' && await adapter.exists(filePath)) {
                try { await adapter.remove(filePath); } catch { /* ignore */ }
            }

            console.log(`[LME] Sync exported: ${languages.reduce((s, l) => s + l.vocabulary.length, 0)} cards`);
        } catch (e) {
            console.error('[LME] Failed to export sync file:', e);
        }
    }

    /**
     * Scan the sync folder for peer files and silently merge any newer ones.
     * Skips own file and files already ingested (per-sourceDevice watermark).
     */
    static async importAllPeers(plugin: LanguageMadeEasyPlugin): Promise<SyncResult> {
        const filePath = plugin.settings.flashcardSyncFilePath;
        const deviceId = plugin.syncDeviceId; // per-physical-device, not settings.deviceId
        if (!filePath || !deviceId || !plugin.settings.flashcardSyncEnabled) return { ...EMPTY_RESULT };

        const dir = syncDir(filePath);
        const adapter = plugin.app.vault.adapter;
        const result = { ...EMPTY_RESULT };
        if (!dir || !(await adapter.exists(dir))) return result;

        // Per-source-device watermark (migrated to an object in loadSettings).
        const raw = plugin.settings.flashcardSyncLastTime;
        const watermarks: Record<string, number> = (raw && typeof raw === 'object' && !Array.isArray(raw))
            ? { ...(raw as Record<string, number>) }
            : {};
        let watermarksChanged = false;

        let entries: string[] = [];
        try {
            entries = (await adapter.list(dir)).files || [];
        } catch (e) {
            console.error('[LME] Failed to list sync folder:', e);
            return result;
        }

        for (const entry of entries) {
            if (!entry.endsWith('.json')) continue;
            let data: any;
            try {
                data = JSON.parse(await adapter.read(entry));
            } catch {
                continue; // not a sync payload (e.g. data.json, manifest.json)
            }
            if (!data || !Array.isArray(data.languages)) continue;

            const source: string = data.sourceDevice;
            if (!source || source === deviceId) continue; // skip own / unknown-source files

            const exportTime: number = typeof data.exportTime === 'number' ? data.exportTime : 0;
            if (exportTime <= (watermarks[source] ?? 0)) continue; // already ingested this peer's version

            let imported = false;
            try {
                for (const langData of data.languages) {
                    if (!ALL_LANGUAGES.includes(langData.language)) continue;
                    const r = await db.importLanguageDataWithMerge(langData.language, {
                        vocabulary: langData.vocabulary || [],
                        reviewLogs: langData.reviewLogs || [],
                        vocabTests: langData.vocabTests || [],
                        vocabSizeState: langData.vocabSizeState,
                        petState: langData.petState,
                        tombstones: langData.tombstones || [],
                    });
                    result.added += r.added;
                    result.updated += r.updated;
                    result.totalLogs += langData.reviewLogs?.length || 0;
                }
                imported = true;
            } catch (e) {
                // One bad peer file must not crash the whole loop — and must not
                // re-crash every cycle: the watermark below only advances after a
                // successful import, so a throwing file would be retried forever.
                // Skip it (until the peer's next export re-tries with fresh data)
                // and let the remaining peers merge.
                console.error(`[LME] Peer sync file failed, skipping until its next export: ${entry}`, e);
            }
            watermarks[source] = exportTime;
            watermarksChanged = true;
            if (imported) result.peers += 1;
        }

        if (watermarksChanged) {
            plugin.settings.flashcardSyncLastTime = watermarks;
            await plugin.saveSettings();
            petService.invalidate(); // merged pet state may differ from in-memory cache
            vocabSizeService.invalidate(); // merged vocab-size state may differ from in-memory cache
        }

        // Lazily GC expired tombstones (guarded to once/day inside the DB layer).
        try {
            await db.maybeGcTombstones(TOMBSTONE_TTL_MS);
        } catch (e) {
            console.error('[LME] Tombstone GC failed:', e);
        }

        result.totalCards = result.added + result.updated;
        return result;
    }

    /**
     * Full bidirectional cycle: publish this device's state, then merge peers.
     * Used by the manual command and the periodic timer.
     */
    static async runSync(plugin: LanguageMadeEasyPlugin): Promise<SyncResult> {
        if (!plugin.settings.flashcardSyncEnabled) return { ...EMPTY_RESULT };
        await SyncManager.exportOwn(plugin);
        return SyncManager.importAllPeers(plugin);
    }
}
