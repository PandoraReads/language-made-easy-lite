// @ts-nocheck
// ============================================================
// Language Made Easy - Vocabulary Size Service
// Manages vocabulary size state and real-time updates
// ============================================================

import type { VocabSizeState, VocabTestResult } from '../models';
import { db } from './Database';
import { VocabTestGenerator, type TestResult } from './VocabTestGenerator';
import { randomUUID } from '../mocks/crypto';
import { t } from '../i18n';

export class VocabSizeService {
    private generator: VocabTestGenerator;
    private cachedState: Map<string, VocabSizeState> = new Map();

    constructor() {
        this.generator = new VocabTestGenerator();
    }

    async ensureTestAvailable(language: string): Promise<boolean> {
        try {
            await this.generator.loadData(language);
            return true;
        } catch {
            return false;
        }
    }

    async generateTest(language: string) {
        await this.generator.loadData(language);
        return this.generator.generateTest(language);
    }

    calculateResults(items: any[], answers: Map<string, boolean>): TestResult {
        return this.generator.calculateResults(items, answers);
    }

    async saveTestResult(
        language: string,
        result: TestResult
    ): Promise<VocabSizeState> {
        const testResult: VocabTestResult = {
            id: randomUUID(),
            language,
            testTime: Date.now(),
            estimatedSize: result.estimatedSize,
            bandResults: result.bandResults.map(br => ({
                band: br.band,
                hitRate: br.hitRate,
                falseAlarmRate: br.falseAlarmRate,
                estimatedSize: br.estimatedSize,
                correctedRate: br.correctedRate,
            })),
            pseudoHitRate: result.pseudoHitRate,
            honestyIndex: result.honestyIndex,
        };

        await db.saveTestResult(testResult);

        const state: VocabSizeState = {
            id: `${language}-current`,
            language,
            baseTestSize: result.estimatedSize,
            learnedWordIds: [],
            lastTestTime: Date.now(),
        };

        await db.saveVocabSizeState(state);
        this.cachedState.set(language, state);

        return state;
    }

    async getCurrentSize(language: string): Promise<number> {
        const state = await this.getState(language);
        if (!state) return 0;
        return state.baseTestSize + state.learnedWordIds.length;
    }

    async getState(language: string): Promise<VocabSizeState | undefined> {
        const cached = this.cachedState.get(language);
        if (cached) return cached;

        const state = await db.getVocabSizeState(language);
        if (state) {
            this.cachedState.set(language, state);
        }
        return state;
    }

    async hasCompletedTest(language: string): Promise<boolean> {
        const state = await this.getState(language);
        return state !== undefined && state.baseTestSize > 0;
    }

    async recordLearnedWord(language: string, vocabId: string, rating: 3 | 4): Promise<number> {
        const state = await this.getState(language);
        if (!state) return 0;

        if (state.learnedWordIds.includes(vocabId)) {
            return state.baseTestSize + state.learnedWordIds.length;
        }

        const updatedState: VocabSizeState = {
            ...state,
            learnedWordIds: [...state.learnedWordIds, vocabId],
        };

        await db.saveVocabSizeState(updatedState);
        this.cachedState.set(language, updatedState);

        return updatedState.baseTestSize + updatedState.learnedWordIds.length;
    }

    invalidate(language?: string): void {
        if (language) {
            this.cachedState.delete(language);
        } else {
            this.cachedState.clear();
        }
    }

    getCEFRLevel(vocabSize: number): string {
        if (vocabSize >= 16000) return 'C2';
        if (vocabSize >= 12000) return 'C1';
        if (vocabSize >= 6000) return 'B2';
        if (vocabSize >= 3000) return 'B1';
        if (vocabSize >= 1500) return 'A2';
        if (vocabSize >= 500) return 'A1';
        return 'Starter';
    }

    getCEFRDescription(level: string): string {
        const descriptions: Record<string, string> = {
            'Starter': t('vocabSize.starter'),
            'A1': t('vocabSize.a1'),
            'A2': t('vocabSize.a2'),
            'B1': t('vocabSize.b1'),
            'B2': t('vocabSize.b2'),
            'C1': t('vocabSize.c1'),
            'C2': t('vocabSize.c2'),
        };
        return descriptions[level] || level;
    }

    getBenchmarkLabel(vocabSize: number): { label: string; description: string } {
        if (vocabSize <= 3000) {
            return { label: t('vocabSize.bmBeginner'), description: t('vocabSize.bmBeginnerDesc') };
        }
        if (vocabSize <= 6000) {
            return { label: t('vocabSize.bmIntermediate'), description: t('vocabSize.bmIntermediateDesc') };
        }
        if (vocabSize <= 12000) {
            return { label: t('vocabSize.bmAdvanced'), description: t('vocabSize.bmAdvancedDesc') };
        }
        return { label: t('vocabSize.bmExpert'), description: t('vocabSize.bmExpertDesc') };
    }

    getHonestyLabel(honestyIndex: number): { text: string; color: string } {
        if (honestyIndex >= 0.8) {
            return { text: t('vocabSize.honestyHigh'), color: 'green' };
        }
        if (honestyIndex >= 0.4) {
            return { text: t('vocabSize.honestyMedium'), color: 'yellow' };
        }
        return { text: t('vocabSize.honestyLow'), color: 'red' };
    }

    getTotalWords(): number {
        return this.generator.getTotalWords();
    }

    // ============================================================
    // Language-specific proficiency level labels
    // ============================================================

    getProficiencyLabel(language: string, vocabSize: number): string | null {
        const levels = PROFICIENCY_LEVELS[language];
        if (!levels) return null;
        for (const { threshold, label } of levels) {
            if (vocabSize >= threshold) return label;
        }
        return null;
    }
}

// Language-specific proficiency level mappings
// Ordered from highest threshold to lowest
const PROFICIENCY_LEVELS: Record<string, Array<{ threshold: number; label: string }>> = {
    japanese: [
        { threshold: 12000, label: 'JLPT N1' },
        { threshold: 6000, label: 'JLPT N2' },
        { threshold: 3500, label: 'JLPT N3' },
        { threshold: 1500, label: 'JLPT N4' },
        { threshold: 500, label: 'JLPT N5' },
    ],
    korean: [
        { threshold: 12000, label: 'TOPIK 6' },
        { threshold: 8500, label: 'TOPIK 5' },
        { threshold: 5500, label: 'TOPIK 4' },
        { threshold: 3500, label: 'TOPIK 3' },
        { threshold: 1500, label: 'TOPIK 2' },
        { threshold: 500, label: 'TOPIK 1' },
    ],
    russian: [
        { threshold: 13000, label: 'ТРКИ-4' },
        { threshold: 8500, label: 'ТРКИ-3' },
        { threshold: 6000, label: 'ТРКИ-2' },
        { threshold: 3300, label: 'ТРКИ-1' },
        { threshold: 1700, label: 'ТБУ' },
        { threshold: 500, label: 'ТЭУ' },
    ],
    french: [
        { threshold: 16000, label: 'DALF C2' },
        { threshold: 12000, label: 'DALF C1' },
        { threshold: 6000, label: 'DELF B2' },
        { threshold: 3000, label: 'DELF B1' },
        { threshold: 1500, label: 'DELF A2' },
        { threshold: 500, label: 'DELF A1' },
    ],
    german: [
        { threshold: 16000, label: 'Goethe C2' },
        { threshold: 12000, label: 'Goethe C1' },
        { threshold: 6000, label: 'Goethe B2' },
        { threshold: 3000, label: 'Goethe B1' },
        { threshold: 1500, label: 'Goethe A2' },
        { threshold: 500, label: 'Goethe A1' },
    ],
    spanish: [
        { threshold: 16000, label: 'DELE C2' },
        { threshold: 12000, label: 'DELE C1' },
        { threshold: 6000, label: 'DELE B2' },
        { threshold: 3000, label: 'DELE B1' },
        { threshold: 1500, label: 'DELE A2' },
        { threshold: 500, label: 'DELE A1' },
    ],
};

export const vocabSizeService = new VocabSizeService();
