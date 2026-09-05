// ============================================================
// PetService — gamified learning-progress companion state machine
// Egg (L1-3) -> random hatch into one of 10 species -> 4 post-egg
// stages (baby/juvenile/adult/ultimate). Driven purely by flashcard
// reviews. Permanent progress never regresses; energy is derived in
// real time from the last-review timestamp; streak breaks reset to 1
// with zero penalty.
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com
// ============================================================

import { db } from './Database';
import type { PetState } from '../models';

// ──── Tunables ─────────────────────────────────────────────────────────
// Curve tuned so a learner reviewing ~20 cards/day reaches the ultimate
// form (L15) in about 6 months. Egg (L1-3) passes in ~3 days.
const EXP_BY_RATING: Record<number, number> = { 1: 3, 2: 5, 3: 8, 4: 10 }; // 1=Again 2=Hard 3=Good 4=Easy
const LEVEL_THRESHOLDS = [0, 200, 500, 1000, 1700, 2700, 4000, 5500, 7300, 9500, 12000, 15000, 18500, 22000, 26000]; // L1..L15
const LEVEL_LINEAR_AFTER = 26000;  // L15 threshold; L16+ adds LEVEL_LINEAR_STEP
const LEVEL_LINEAR_STEP = 3000;
const HATCH_LEVEL = 4;             // egg occupies L1-3; hatch when reaching L4
const DAILY_GOAL = 3;              // soft daily target (reviews)
const ENERGY_DECAY_PER_DAY = 8;    // -8 vitality per natural day without review
const STREAK_MILESTONES = [3, 7, 30, 100];
const STREAK_BONUS_EXP: Record<number, number> = { 3: 20, 7: 50, 30: 200, 100: 1000 };

const EGG_EMOJI = '\u{1F95A}'; // 🥚

// ──── Types ────────────────────────────────────────────────────────────
export type PetSpecies = 'eagle' | 'unicorn' | 'dino' | 'fairy' | 'tree' | 'diamond' | 'dragon' | 'butterfly' | 'robot' | 'cat';
export type PetStage = 'egg' | 'baby' | 'juvenile' | 'adult' | 'ultimate';
export type PetMood = 'ecstatic' | 'happy' | 'coaching';

export interface TodayStats {
    count: number;     // reviews done today (including the one just graded)
    correct: number;   // of those, rated Good(3) or Easy(4)
}

export interface PetSnapshot {
    level: number;
    expIntoLevel: number;
    expForNext: number;       // span of current level (progress-bar denominator)
    progressPct: number;      // 0-100
    totalExp: number;
    totalReviews: number;
    species: PetSpecies | null;
    stage: PetStage;
    formEmoji: string;
    formNameKey: string;      // e.g. 'pet.eggPhase2' (egg level 2), 'pet.formEagleBaby'
    energy: number;           // 0-100
    energyLabelKey: string;
    isSleeping: boolean;
    metDailyGoal: boolean;
    mood: PetMood;
    moodEmoji: string;
    moodLabelKey: string;
    currentStreak: number;
    longestStreak: number;
    todayReviewed: number;
}

export interface GainResult {
    snapshot: PetSnapshot;
    expGained: number;
    bonusExp: number;
    leveledUp: boolean;
    oldLevel: number;
    newLevel: number;
    hatched: boolean;            // true if the egg hatched on this grade
    newSpecies: PetSpecies | null;
    milestoneHit: number | null;
}

// ──── Species roster (4 emojis each: baby / juvenile / adult / ultimate) ─
const SPECIES_LIST: PetSpecies[] = ['eagle', 'unicorn', 'dino', 'fairy', 'tree', 'diamond', 'dragon', 'butterfly', 'robot', 'cat'];
const SPECIES_EMOJI: Record<PetSpecies, string[]> = {
    eagle:     ['\u{1F423}', '\u{1F426}', '\u{1F985}', '\u{1F985}'], // 🐣 🐦 🦅 🦅
    unicorn:   ['\u{1F434}', '\u{1F984}', '\u{1F984}', '\u{1F308}'], // 🐴 🦄 🦄 🌈
    dino:      ['\u{1F995}', '\u{1F996}', '\u{1F409}', '\u{1F432}'], // 🦕 🦖 🐉 🐲
    fairy:     ['✨', '\u{1F9DA}', '\u{1F47C}', '\u{1F9DA}‍♀️'], // ✨ 🧚 👼 🧚‍♀️
    tree:      ['\u{1F331}', '\u{1F33F}', '\u{1F333}', '\u{1F332}'], // 🌱 🌿 🌳 🌲
    diamond:   ['\u{1F535}', '\u{1F48A}', '\u{1F48E}', '\u{1F451}'], // 🔷 💠 💎 👑
    dragon:    ['\u{1F40D}', '\u{1F409}', '\u{1F432}', '\u{1F432}'], // 🐍 🐉 🐲 🐲
    butterfly: ['\u{1F41B}', '\u{1FAB2}', '\u{1F98B}', '\u{1F98B}'], // 🐛 🪲 🦋 🦋
    robot:     ['⚙️', '\u{1F916}', '\u{1F9BE}', '\u{1F47E}'], // ⚙️ 🤖 🦾 👾
    cat:       ['\u{1F431}', '\u{1F408}', '\u{1F42F}', '\u{1F981}'], // 🐱 🐈 🐯 🦁
};
const STAGE_INDEX: Record<Exclude<PetStage, 'egg'>, number> = { baby: 0, juvenile: 1, adult: 2, ultimate: 3 };

function randomSpecies(): PetSpecies {
    return SPECIES_LIST[Math.floor(Math.random() * SPECIES_LIST.length)];
}

// ──── Date helpers (local-day based; decoupled from heatmap's UTC) ─────
export function localDayKey(d: Date | number): string {
    const date = typeof d === 'number' ? new Date(d) : d;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseDayKey(key: string): Date | null {
    if (!key) return null;
    const parts = key.split('-').map(Number);
    if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null;
    const [y, m, d] = parts;
    return new Date(y, m - 1, d); // local midnight
}

function dayDiff(fromKey: string, toKey: string): number {
    const from = parseDayKey(fromKey);
    const to = parseDayKey(toKey);
    if (!from || !to) return 0;
    return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

function shiftDayKey(key: string, deltaDays: number): string {
    const d = parseDayKey(key);
    if (!d) return key;
    d.setDate(d.getDate() + deltaDays);
    return localDayKey(d);
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// ──── Pure derivation functions (unit-testable, no IO) ─────────────────
function thresholdForLevel(level: number): number {
    if (level <= 1) return 0;
    if (level <= LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[level - 1];
    return LEVEL_LINEAR_AFTER + (level - LEVEL_THRESHOLDS.length) * LEVEL_LINEAR_STEP;
}

export function levelFromExp(totalExp: number): number {
    let level = 1;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
        if (totalExp >= LEVEL_THRESHOLDS[i]) level = i + 1; else break;
    }
    if (level >= LEVEL_THRESHOLDS.length && totalExp >= LEVEL_LINEAR_AFTER) {
        const extra = Math.floor((totalExp - LEVEL_LINEAR_AFTER) / LEVEL_LINEAR_STEP);
        level = LEVEL_THRESHOLDS.length + extra;
    }
    return level;
}

export function stageFromLevel(level: number): PetStage {
    if (level <= 3) return 'egg';
    if (level <= 6) return 'baby';
    if (level <= 9) return 'juvenile';
    if (level <= 12) return 'adult';
    return 'ultimate';
}

function speciesEmoji(species: PetSpecies, stage: Exclude<PetStage, 'egg'>): string {
    return SPECIES_EMOJI[species][STAGE_INDEX[stage]];
}

export function moodFromAccuracy(correct: number, total: number): PetMood {
    if (total <= 0) return 'happy';
    const rate = correct / total;
    if (rate >= 0.85) return 'ecstatic';
    if (rate >= 0.60) return 'happy';
    return 'coaching';
}

function moodEmoji(mood: PetMood): string {
    switch (mood) {
        case 'ecstatic': return '\u{1F606}'; // 😆
        case 'happy': return '\u{1F60A}';    // 😊
        case 'coaching': return '\u{1F4AA}'; // 💪
    }
}

function moodLabelKey(mood: PetMood): string {
    return `pet.mood${cap(mood)}`;
}

export function computeEnergy(now: number, lastReviewTs: number, todayCount: number): {
    energy: number; daysSince: number; metDailyGoal: boolean; isSleeping: boolean;
} {
    const metDailyGoal = todayCount >= DAILY_GOAL;
    if (!lastReviewTs) {
        return { energy: 100, daysSince: 0, metDailyGoal, isSleeping: false };
    }
    const daysSince = dayDiff(localDayKey(lastReviewTs), localDayKey(now));
    const energy = clamp(100 - daysSince * ENERGY_DECAY_PER_DAY, 0, 100);
    return { energy, daysSince, metDailyGoal, isSleeping: energy === 0 };
}

function energyLabelKey(energy: number, isSleeping: boolean): string {
    if (isSleeping) return 'pet.energySleeping';
    if (energy >= 80) return 'pet.energyFull';
    if (energy >= 50) return 'pet.energyOkay';
    if (energy >= 20) return 'pet.energyTired';
    return 'pet.energyWeak';
}

// ──── Service (singleton) ──────────────────────────────────────────────
export class PetService {
    private cache = new Map<string, PetState>();

    private defaultState(language: string): PetState {
        const now = Date.now();
        return {
            id: `${language}-pet`,
            language,
            totalExp: 0,
            totalReviews: 0,
            species: null,
            lastReviewTimestamp: now,
            lastReviewDayKey: localDayKey(now),
            currentStreak: 0,
            longestStreak: 0,
            awardedStreakMilestones: [],
            lastStreakDayKey: '',
            updatedAt: now,
        };
    }

    /** Get (cache-first), initializing a fresh pet on first use. Also
     *  backfills species for legacy records that pre-date the species field. */
    async getState(language: string): Promise<PetState> {
        const cached = this.cache.get(language);
        if (cached) return cached;
        let state = await db.getPetState(language);
        if (!state) {
            state = this.defaultState(language);
            await db.savePetState(state);
        } else if (state.species === undefined) {
            state.species = null; // legacy record without the species field
        }
        // Compatibility: hatched level but no species -> assign a random one
        if (levelFromExp(state.totalExp) >= HATCH_LEVEL && !state.species) {
            state.species = randomSpecies();
            await db.savePetState(state);
        }
        this.cache.set(language, state);
        return state;
    }

    /** Full UI snapshot. todayStats optional (energy stays correct without it). */
    async getSnapshot(language: string, todayStats?: TodayStats): Promise<PetSnapshot> {
        const state = await this.getState(language);
        return this.buildSnapshot(state, todayStats);
    }

    private buildSnapshot(state: PetState, todayStats?: TodayStats): PetSnapshot {
        const now = Date.now();
        const level = levelFromExp(state.totalExp);
        const stage = stageFromLevel(level);
        const curThr = thresholdForLevel(level);
        const nextThr = thresholdForLevel(level + 1);
        const span = Math.max(1, nextThr - curThr);
        const expIntoLevel = state.totalExp - curThr;
        const progressPct = clamp(Math.round((expIntoLevel / span) * 100), 0, 100);
        const todayCount = todayStats?.count ?? 0;
        const { energy, metDailyGoal, isSleeping } = computeEnergy(now, state.lastReviewTimestamp, todayCount);
        const mood = moodFromAccuracy(todayStats?.correct ?? 0, todayStats?.count ?? 0);
        const species = state.species as PetSpecies | null;
        const formEmoji = stage === 'egg' ? EGG_EMOJI : speciesEmoji(species as PetSpecies, stage);
        return {
            level,
            expIntoLevel,
            expForNext: span,
            progressPct,
            totalExp: state.totalExp,
            totalReviews: state.totalReviews,
            species,
            stage,
            formEmoji,
            formNameKey: stage === 'egg'
                ? `pet.eggPhase${Math.min(Math.max(level, 1), 3)}`
                : `pet.form${cap(species as string)}${cap(stage)}`,
            energy,
            energyLabelKey: energyLabelKey(energy, isSleeping),
            isSleeping,
            metDailyGoal,
            mood,
            moodEmoji: moodEmoji(mood),
            moodLabelKey: moodLabelKey(mood),
            currentStreak: state.currentStreak,
            longestStreak: state.longestStreak,
            todayReviewed: todayCount,
        };
    }

    /**
     * Core entry: called once per flashcard grade.
     * Order: +exp (+streak bonus) → streak recompute → level check →
     * hatch (L3->L4) if needed → persist → return result for UI.
     * Never mutates the cached state; writes a fresh record.
     */
    async gainExp(rating: number, language: string, todayStats?: TodayStats): Promise<GainResult> {
        const prev = await this.getState(language);
        const now = Date.now();
        const todayKey = localDayKey(now);

        const oldLevel = levelFromExp(prev.totalExp);
        const expGain = EXP_BY_RATING[rating] ?? 5;
        const streak = this.recomputeStreak(prev, todayKey); // pure, no mutation
        const newTotalExp = prev.totalExp + expGain + streak.bonusExp;
        const newLevel = levelFromExp(newTotalExp);

        // Hatch the egg the first time we cross into L4
        const shouldHatch = newLevel >= HATCH_LEVEL && !prev.species;
        const species: PetSpecies | null = shouldHatch ? randomSpecies() : (prev.species as PetSpecies | null);

        const next: PetState = {
            ...prev,
            totalExp: newTotalExp,
            totalReviews: prev.totalReviews + 1,
            lastReviewTimestamp: now,
            lastReviewDayKey: todayKey,
            currentStreak: streak.currentStreak,
            longestStreak: streak.longestStreak,
            lastStreakDayKey: streak.lastStreakDayKey,
            awardedStreakMilestones: streak.awarded,
            species,
            updatedAt: now,
        };

        await db.savePetState(next);
        this.cache.set(language, next);

        const stats: TodayStats = todayStats ?? { count: 1, correct: rating >= 3 ? 1 : 0 };
        const snapshot = this.buildSnapshot(next, stats);

        return {
            snapshot,
            expGained: expGain,
            bonusExp: streak.bonusExp,
            leveledUp: newLevel > oldLevel,
            oldLevel,
            newLevel,
            hatched: shouldHatch,
            newSpecies: shouldHatch ? species : null,
            milestoneHit: streak.milestone,
        };
    }

    /**
     * Zero-penalty streak step. Same day = no change; yesterday = +1;
     * otherwise reset to 1 (a fresh run, NOT a punishment). Milestone
     * bonuses are idempotent (awarded only on first reach).
     */
    private recomputeStreak(prev: PetState, todayKey: string): {
        currentStreak: number; longestStreak: number; lastStreakDayKey: string;
        awarded: number[]; bonusExp: number; milestone: number | null; streakDelta: number;
    } {
        if (prev.lastStreakDayKey === todayKey) {
            return {
                currentStreak: prev.currentStreak,
                longestStreak: prev.longestStreak,
                lastStreakDayKey: prev.lastStreakDayKey,
                awarded: prev.awardedStreakMilestones,
                bonusExp: 0,
                milestone: null,
                streakDelta: 0,
            };
        }
        const yesterdayKey = shiftDayKey(todayKey, -1);
        const currentStreak = prev.lastStreakDayKey === yesterdayKey ? prev.currentStreak + 1 : 1;
        const longestStreak = Math.max(prev.longestStreak, currentStreak);
        const milestone = STREAK_MILESTONES.find(m => m === currentStreak && !prev.awardedStreakMilestones.includes(m)) ?? null;
        const bonusExp = milestone != null ? (STREAK_BONUS_EXP[milestone] ?? 0) : 0;
        const awarded = milestone != null ? [...prev.awardedStreakMilestones, milestone] : prev.awardedStreakMilestones;
        return { currentStreak, longestStreak, lastStreakDayKey: todayKey, awarded, bonusExp, milestone, streakDelta: 1 };
    }

    /** Invalidate cache after an external write (e.g. sync import). */
    invalidate(language?: string): void {
        if (language) this.cache.delete(language);
        else this.cache.clear();
    }
}

export const petService = new PetService();
