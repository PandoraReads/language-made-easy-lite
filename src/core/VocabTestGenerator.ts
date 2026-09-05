// @ts-nocheck
// ============================================================
// Language Made Easy - Vocabulary Test Generator
// 120-question test with 6-band SDT scoring
// ============================================================

import type { VocabTestItem } from '../models';

interface FreqBand {
    level: string;
    range: [number, number];
    rangeSize: number;
    realPerTest: number;
    pseudoPerTest: number;
    words: string[];
    pseudoWords: string[];
}

interface FreqData {
    language: string;
    totalWords: number;
    bands: FreqBand[];
}

export interface BandResult {
    band: string;
    bandIndex: number;
    hitRate: number;
    falseAlarmRate: number;
    realCount: number;
    realYes: number;
    pseudoCount: number;
    pseudoYes: number;
    estimatedSize: number;
    correctedRate: number;
}

export interface TestResult {
    estimatedSize: number;
    bandResults: BandResult[];
    pseudoHitRate: number;
    honestyIndex: number;
}

function shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export class VocabTestGenerator {
    private data: FreqData | null = null;

    async loadData(language: string): Promise<void> {
        if (this.data && this.data.language === language) return;

        // 社区免费版:仅英语词频表
        const freqModules: Record<string, () => Promise<FreqData>> = {
            english: async () => {
                const module = await import('../data/english-freq.json');
                return module.default as FreqData;
            },
        };

        const loader = freqModules[language];
        if (!loader) {
            throw new Error(`Vocabulary test not available for language: ${language}`);
        }
        this.data = await loader();
    }

    generateTest(language: string): VocabTestItem[] {
        if (!this.data) {
            throw new Error('Frequency data not loaded. Call loadData() first.');
        }
        if (this.data.language !== language) {
            throw new Error(`Data loaded for ${this.data.language}, not ${language}. Call loadData() first.`);
        }

        const items: VocabTestItem[] = [];

        for (let i = 0; i < this.data.bands.length; i++) {
            const band = this.data.bands[i];

            const sampledReal = shuffle(band.words).slice(0, band.realPerTest);
            const sampledPseudo = shuffle(band.pseudoWords).slice(0, band.pseudoPerTest);

            for (const word of sampledReal) {
                items.push({
                    word,
                    isPseudo: false,
                    band: band.level,
                    bandIndex: i,
                });
            }

            for (const word of sampledPseudo) {
                items.push({
                    word,
                    isPseudo: true,
                    band: band.level,
                    bandIndex: i,
                });
            }
        }

        return shuffle(items);
    }

    calculateResults(
        items: VocabTestItem[],
        answers: Map<string, boolean>
    ): TestResult {
        if (!this.data) {
            throw new Error('Frequency data not loaded.');
        }

        const bandResults: BandResult[] = [];
        let totalPseudoYes = 0;
        let totalPseudoCount = 0;

        for (let i = 0; i < this.data.bands.length; i++) {
            const band = this.data.bands[i];
            const bandItems = items.filter(item => item.bandIndex === i);

            const realItems = bandItems.filter(item => !item.isPseudo);
            const pseudoItems = bandItems.filter(item => item.isPseudo);

            let realYes = 0;
            for (const item of realItems) {
                if (answers.get(item.word) === true) realYes++;
            }

            let pseudoYes = 0;
            for (const item of pseudoItems) {
                if (answers.get(item.word) === true) pseudoYes++;
                totalPseudoCount++;
                if (answers.get(item.word) === true) totalPseudoYes++;
            }

            const hitRate = realItems.length > 0 ? realYes / realItems.length : 0;
            const falseAlarmRate = pseudoItems.length > 0 ? pseudoYes / pseudoItems.length : 0;

            // SDT correction: V_i = N_i * (H_i - FA_i) / (1 - FA_i)
            // If H_i <= FA_i, V_i = 0 (random guessing)
            let estimatedSize = 0;
            let correctedRate = 0;
            if (hitRate > falseAlarmRate) {
                correctedRate = (hitRate - falseAlarmRate) / (1 - falseAlarmRate);
                estimatedSize = Math.round(correctedRate * band.rangeSize);
            }

            bandResults.push({
                band: band.level,
                bandIndex: i,
                hitRate,
                falseAlarmRate,
                realCount: realItems.length,
                realYes,
                pseudoCount: pseudoItems.length,
                pseudoYes,
                estimatedSize,
                correctedRate,
            });
        }

        const globalFalseAlarmRate = totalPseudoCount > 0 ? totalPseudoYes / totalPseudoCount : 0;
        const honestyIndex = Math.max(0, 1 - globalFalseAlarmRate);

        const estimatedSize = bandResults.reduce((sum, r) => sum + r.estimatedSize, 0);

        return {
            estimatedSize,
            bandResults,
            pseudoHitRate: globalFalseAlarmRate,
            honestyIndex,
        };
    }

    getBandInfo(): { level: string; range: [number, number]; rangeSize: number }[] {
        if (!this.data) return [];
        return this.data.bands.map(b => ({ level: b.level, range: b.range, rangeSize: b.rangeSize }));
    }

    getTotalWords(): number {
        return this.data?.totalWords ?? 20000;
    }
}
