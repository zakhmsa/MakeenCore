// src/strategies/SurahBoundedWindowStrategy.ts
import { IMovementStrategy } from './IMovementStrategy';
import { TrackState, StepResult } from '../core/types';
import { PlanContext } from '../core/PlanContext';
import { WindowMode } from '../core/constants';

interface SurahBoundedWindowStrategyConfig {
    historySourceId: number;
    count: number;
    mode: WindowMode;
    pagesCount?: number;  // Optional: specify review amount in pages (15 lines = 1 page)
}

/**
 * SurahBoundedWindowStrategy
 * 
 * Minor review strategy that respects surah boundaries:
 * 1. Never crosses surah boundaries - review is always within current surah
 * 2. Resets counter when hifz moves to a new surah
 * 3. Supports specifying review amount in pages (15 lines = 1 page)
 * 
 * This implements the teacher's requirements:
 * - المراجعة الصغرى تُربط دائماً بإطار السورة الواحدة
 * - تصفير العداد عند الانتقال لسورة جديدة
 * - يمكن تحديد مقدار المراجعة بالأوجه
 */
export class SurahBoundedWindowStrategy implements IMovementStrategy {
    calculateNextStep(
        state: TrackState,
        context: PlanContext,
        config: SurahBoundedWindowStrategyConfig
    ): StepResult | null {
        const sourceTrack = context.allTracks.get(config.historySourceId);
        if (!sourceTrack) return null;

        const fullHistory = sourceTrack.state.history;
        const todayLesson = fullHistory[fullHistory.length - 1];
        const pastLessons = fullHistory.slice(0, -1); // Exclude today's lesson

        if (!todayLesson || pastLessons.length === 0) return null;

        // The active surah is based on material actually memorized today, not
        // currentIdx (which already points at tomorrow's first ayah).
        const currentLocation = context.quranRepo.getLocationFromIndex(
            todayLesson.endIdx,
            context.indexMap
        );
        const currentSurahNum = currentLocation.surah;
        const surahStartIdx = context.quranRepo.getIndexFromLocation(currentSurahNum, 1, context.isReverse);
        const surahEndIdx = context.quranRepo.getIndexFromLocation(
            currentSurahNum,
            context.quranRepo.getAyahCount(currentSurahNum),
            context.isReverse
        );

        // Intersect lesson history with the active surah. This also handles a
        // memorization lesson that crosses a surah boundary.
        const lessonsInSurah = pastLessons.filter(
            lesson => lesson.endIdx >= surahStartIdx && lesson.startIdx <= surahEndIdx
        );
        if (lessonsInSurah.length === 0) return null;

        if (config.pagesCount !== undefined) {
            return this.calcByLines(
                lessonsInSurah,
                context,
                config.pagesCount * 15,
                surahStartIdx,
                surahEndIdx
            );
        }

        const boundedLessons = lessonsInSurah.map(lesson => ({
            ...lesson,
            startIdx: Math.max(lesson.startIdx, surahStartIdx),
            endIdx: Math.min(lesson.endIdx, surahEndIdx)
        }));

        return config.mode === WindowMode.FIXED
            ? this.calcFixed(boundedLessons, context, config.count)
            : this.calcGradual(boundedLessons, context, config.count);
    }

    private calcByLines(
        lessons: TrackState['history'],
        context: PlanContext,
        targetLines: number,
        surahStartIdx: number,
        surahEndIdx: number
    ): StepResult | null {
        if (targetLines <= 0 || lessons.length === 0) return null;

        const coverageStart = Math.max(lessons[0].startIdx, surahStartIdx);
        const coverageEnd = Math.min(lessons[lessons.length - 1].endIdx, surahEndIdx);
        if (coverageStart > coverageEnd) return null;

        // Walk backwards until the requested page/line window is met. The last
        // included ayah remains whole, mirroring memorization boundary handling.
        let startIdx = coverageEnd;
        while (startIdx > coverageStart) {
            const lines = context.quranRepo.getLinesBetween(
                context.quranRepo.getLocationFromIndex(startIdx, context.indexMap),
                context.quranRepo.getLocationFromIndex(coverageEnd, context.indexMap),
                context.isReverse
            );
            if (lines >= targetLines) break;
            startIdx--;
        }

        return this.buildResult(startIdx, coverageEnd, context);
    }

    private calcGradual(
        pastLessons: TrackState['history'],
        context: PlanContext,
        count: number
    ): StepResult | null {
        if (pastLessons.length === 0) return null;

        const window = pastLessons.slice(-count);
        const startIdx = window[0].startIdx;
        const endIdx = window[window.length - 1].endIdx;

        return this.buildResult(startIdx, endIdx, context);
    }

    private calcFixed(
        pastLessons: TrackState['history'],
        context: PlanContext,
        count: number
    ): StepResult | null {
        if (pastLessons.length === 0) return null;

        if (pastLessons.length >= count) {
            const window = pastLessons.slice(-count);
            return this.buildResult(
                window[0].startIdx,
                window[window.length - 1].endIdx,
                context
            );
        }

        // Not enough lessons in current surah - use what we have
        const window = pastLessons;
        return this.buildResult(
            window[0].startIdx,
            window[window.length - 1].endIdx,
            context
        );
    }

    private buildResult(
        startIdx: number,
        endIdx: number,
        context: PlanContext
    ): StepResult {
        return {
            startIdx,
            endIdx,
            start: context.quranRepo.getLocationFromIndex(startIdx, context.indexMap),
            end: context.quranRepo.getLocationFromIndex(endIdx, context.indexMap),
            linesProcessed: 0,
            flags: ['review']
        };
    }

}
