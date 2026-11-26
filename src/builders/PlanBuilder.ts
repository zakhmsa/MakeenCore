// src/builders/PlanBuilder.ts
import { TrackManager } from '../core/TrackManager';
import {
    PlanMode,
    ScheduleConfig,
    LocationConfig,
    TrackRequest,
    CompletionByDurationConfig,
    CompletionByDailyAmountConfig,
    CompletionByDailyAyahsConfig,
    HifzAmountUnit
} from './PlanTypes';
import { HifzSystem } from './HifzSystem';
import { QuranRepository } from '../core/QuranRepository';
import { WindowMode, TrackId } from '../core/constants';
import { PlanError, PlanErrorCode, Severity } from '../errors';
import { findExponentialStopIndex } from '../utils/Algorithms';
import { DateUtils } from '../utils/DateUtils';

/**
 * PlanBuilder
 * * Fluent API for building complex plans.
 * * REFACTORED: Injects QuranRepository into TrackManager.
 */
export class PlanBuilder {
    private requests: TrackRequest[] = [];
    private scheduleConfig: ScheduleConfig | null = null;
    private currentMode: PlanMode = 'NONE';
    private stopOnCompletion: boolean = false;
    private derivedDailyAmountValue?: number;
    private derivedDailyAmountUnit?: HifzAmountUnit;

    /**
     * Returns the daily amount derived by `planByDuration`, if duration mode was used.
     */
    public getDerivedDailyAmount(): { amount: number; unit: HifzAmountUnit } | undefined {
        if (this.derivedDailyAmountValue === undefined || this.derivedDailyAmountUnit === undefined) {
            return undefined;
        }
        return {
            amount: this.derivedDailyAmountValue,
            unit: this.derivedDailyAmountUnit
        };
    }

    private getScheduleOrThrow(): ScheduleConfig {
        if (!this.scheduleConfig) {
            throw new PlanError(
                PlanErrorCode.MISSING_SCHEDULE,
                Severity.ERROR,
                'يجب استدعاء setSchedule() قبل تحديد وضع الخطة.'
            );
        }

        return this.scheduleConfig;
    }

    private validateHifzAmount(amount: number, unit: HifzAmountUnit, schedule: ScheduleConfig): void {
        if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
            throw new PlanError(
                PlanErrorCode.INVALID_INPUT,
                Severity.ERROR,
                'الكمية اليومية يجب أن تكون أكبر من صفر.',
                { amount, unit }
            );
        }

        if (unit === 'AYAHS') {
            if (!Number.isInteger(amount)) {
                throw new PlanError(
                    PlanErrorCode.INVALID_INPUT,
                    Severity.ERROR,
                    'عدد الآيات اليومي يجب أن يكون عدداً صحيحاً موجباً.',
                    { dailyAyahs: amount }
                );
            }

            if (schedule.maxAyahPerDay !== undefined && schedule.maxAyahPerDay < amount) {
                throw new PlanError(
                    PlanErrorCode.INVALID_INPUT,
                    Severity.ERROR,
                    `تعارض في الإعدادات: maxAyahPerDay (${schedule.maxAyahPerDay}) أصغر من المقدار اليومي بالآيات (${amount}).`,
                    { maxAyahPerDay: schedule.maxAyahPerDay, dailyAyahs: amount }
                );
            }
        }
    }

    private getStudyDaysWithinDuration(durationDays: number, daysPerWeek: number): number {
        if (durationDays <= 0) {
            throw new PlanError(
                PlanErrorCode.INVALID_INPUT,
                Severity.ERROR,
                'مدة الخطة يجب أن تكون أكبر من صفر.',
                { durationDays }
            );
        }

        if (daysPerWeek <= 0 || daysPerWeek > 7) {
            throw new PlanError(
                PlanErrorCode.INVALID_INPUT,
                Severity.ERROR,
                'عدد أيام الدراسة في الأسبوع يجب أن يكون بين 1 و 7.',
                { daysPerWeek }
            );
        }

        return Math.max(1, Math.ceil((durationDays * daysPerWeek) / 7));
    }

    /**
     * Counts effective memorization working days across `durationDays` generated study days,
     * accounting for holidays, consolidation days, and catch-up days.
     */
    private getEffectiveMemorizationDays(durationDays: number, schedule: ScheduleConfig): number {
        if (durationDays <= 0) {
            throw new PlanError(
                PlanErrorCode.INVALID_INPUT,
                Severity.ERROR,
                'مدة الخطة يجب أن تكون أكبر من صفر.',
                { durationDays }
            );
        }

        if (schedule.daysPerWeek <= 0 || schedule.daysPerWeek > 7) {
            throw new PlanError(
                PlanErrorCode.INVALID_INPUT,
                Severity.ERROR,
                'عدد أيام الدراسة في الأسبوع يجب أن يكون بين 1 و 7.',
                { daysPerWeek: schedule.daysPerWeek }
            );
        }

        let currentDate = new Date(schedule.startDate);
        while (!DateUtils.isWorkingDay(currentDate, schedule.daysPerWeek)) {
            currentDate = DateUtils.addDays(currentDate, 1);
        }

        let effectiveDays = 0;
        for (let dayCounter = 1; dayCounter <= durationDays; dayCounter++) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const isHoliday = schedule.holidays?.includes(dateStr) ?? false;
            const isConsolidation =
                schedule.consolidationDayInterval !== undefined &&
                schedule.consolidationDayInterval > 0 &&
                dayCounter % schedule.consolidationDayInterval === 0;
            const isCatchUp =
                schedule.catchUpDayOfWeek !== undefined &&
                currentDate.getDay() === schedule.catchUpDayOfWeek;

            if (!isHoliday && !isConsolidation && !isCatchUp) {
                effectiveDays++;
            }

            currentDate = DateUtils.addDays(currentDate, 1);
            while (!DateUtils.isWorkingDay(currentDate, schedule.daysPerWeek)) {
                currentDate = DateUtils.addDays(currentDate, 1);
            }
        }

        return Math.max(1, effectiveDays);
    }

    private replaceFirstHifzRequest(
        amount: number,
        startLocation: LocationConfig,
        endLocation: LocationConfig,
        unit: HifzAmountUnit = 'LINES'
    ): void {
        const hifzIndex = this.requests.findIndex((req) => req.type === 'HIFZ');
        const params = {
            amountLines: amount,
            amount,
            unit,
            startLocation,
            endLocation
        };

        if (hifzIndex >= 0) {
            this.requests[hifzIndex] = {
                type: 'HIFZ',
                params
            };
            return;
        }

        this.requests.push({
            type: 'HIFZ',
            params
        });
    }

    public planByDuration(config: CompletionByDurationConfig): PlanBuilder {
        const schedule = this.getScheduleOrThrow();
        const repo = QuranRepository.getInstance();
        const unit: HifzAmountUnit = config.unit ?? 'LINES';
        const direction = schedule.isReverse ?? false;

        if (unit === 'AYAHS') {
            const totalAyahs = repo.countAyahs(config.from, config.to, direction);
            const effectiveWorkingDays = this.getEffectiveMemorizationDays(config.durationDays, schedule);
            const derivedDailyAyahs = Math.max(1, Math.ceil(totalAyahs / effectiveWorkingDays));

            this.validateHifzAmount(derivedDailyAyahs, 'AYAHS', schedule);
            this.derivedDailyAmountValue = derivedDailyAyahs;
            this.derivedDailyAmountUnit = 'AYAHS';

            this.scheduleConfig = {
                ...schedule,
                limitDays: config.durationDays
            };

            this.replaceFirstHifzRequest(derivedDailyAyahs, config.from, config.to, 'AYAHS');
            this.currentMode = 'HIFZ_ECOSYSTEM';
            return this;
        }

        const totalLines = repo.getLinesBetween(config.from, config.to, direction);
        const studyDays = this.getStudyDaysWithinDuration(config.durationDays, schedule.daysPerWeek);
        const derivedDailyLines = Math.max(1, Math.ceil(totalLines / studyDays));

        this.derivedDailyAmountValue = derivedDailyLines;
        this.derivedDailyAmountUnit = 'LINES';

        this.scheduleConfig = {
            ...schedule,
            limitDays: config.durationDays
        };

        this.replaceFirstHifzRequest(derivedDailyLines, config.from, config.to, 'LINES');
        this.currentMode = 'HIFZ_ECOSYSTEM';
        return this;
    }

    public planByDailyAyahs(config: CompletionByDailyAyahsConfig): PlanBuilder {
        return this.planByDailyAmount({
            from: config.from,
            to: config.to,
            dailyAyahs: config.dailyAyahs,
            unit: 'AYAHS'
        });
    }

    public planByDailyAmount(config: CompletionByDailyAmountConfig): PlanBuilder {
        const schedule = this.getScheduleOrThrow();
        const repo = QuranRepository.getInstance();
        const unit: HifzAmountUnit = config.unit ?? (config.dailyAyahs !== undefined ? 'AYAHS' : 'LINES');
        const dailyAmount = unit === 'AYAHS'
            ? (config.dailyAyahs ?? config.dailyLines ?? 0)
            : (config.dailyLines ?? 0);

        this.validateHifzAmount(dailyAmount, unit, schedule);

        const direction = schedule.isReverse ?? false;
        const startIdx = repo.getIndexFromLocation(config.from.surah, config.from.ayah, direction);
        const endIdx = repo.getIndexFromLocation(config.to.surah, config.to.ayah, direction);

        if (startIdx > endIdx) {
            throw new PlanError(
                PlanErrorCode.START_AFTER_END,
                Severity.ERROR,
                `موقع البداية (${startIdx}) بعد موقع النهاية (${endIdx}).`,
                { startIdx, endIdx }
            );
        }

        const directionData = repo.getDirectionData(direction);

        let cursor = startIdx;
        let activeMemorizationDays = 0;

        if (unit === 'AYAHS') {
            while (cursor <= endIdx) {
                let stopIdx = Math.min(cursor + dailyAmount - 1, endIdx);

                if (schedule.strictSequentialMode) {
                    const startLocation = repo.getLocationFromIndex(cursor, directionData.index_map);
                    const stopLocation = repo.getLocationFromIndex(stopIdx, directionData.index_map);
                    if (stopLocation.surah !== startLocation.surah) {
                        const surahEndAyah = direction ? 1 : repo.getAyahCount(startLocation.surah);
                        stopIdx = repo.getIndexFromLocation(
                            startLocation.surah,
                            surahEndAyah,
                            direction
                        );
                    }
                } else if (schedule.surahCompletion?.enabled || schedule.sequentialSurahMode) {
                    const stopLocation = repo.getLocationFromIndex(stopIdx, directionData.index_map);
                    const surahEndAyah = direction ? 1 : repo.getAyahCount(stopLocation.surah);
                    const surahEndIdx = repo.getIndexFromLocation(stopLocation.surah, surahEndAyah, direction);
                    const remainingInSurah = surahEndIdx - stopIdx;
                    const maxOverflowAyahs = Math.max(0, schedule.surahCompletion?.maxOverflowAyahs ?? 2);
                    if (remainingInSurah > 0 && remainingInSurah <= maxOverflowAyahs) {
                        stopIdx = Math.min(surahEndIdx, endIdx);
                    }
                }

                if (schedule.maxLinesPerDay !== undefined) {
                    const startLocation = repo.getLocationFromIndex(cursor, directionData.index_map);
                    while (stopIdx > cursor) {
                        const stopLocation = repo.getLocationFromIndex(stopIdx, directionData.index_map);
                        if (repo.getLinesBetween(startLocation, stopLocation, direction) <= schedule.maxLinesPerDay) {
                            break;
                        }
                        stopIdx--;
                    }
                }

                activeMemorizationDays++;
                cursor = stopIdx + 1;
            }
        } else {
            const maxAyahs = schedule.maxAyahPerDay ?? 10;

            // Partition the exact canonical range with both hard constraints. Taking
            // max(totalLines/limit, totalAyahs/limit) is insufficient because the two
            // constraints bind on different days in mixed short/long-ayah regions.
            while (cursor <= endIdx) {
                const currentCum = cursor > 0 ? directionData.cumulative_array[cursor - 1] : 0;
                let stopIdx = findExponentialStopIndex(
                    directionData.cumulative_array,
                    currentCum + dailyAmount,
                    cursor,
                    endIdx
                );

                while (stopIdx > cursor) {
                    const previousLines = Number(
                        (directionData.cumulative_array[stopIdx - 1] - currentCum).toFixed(2)
                    );
                    if (previousLines < dailyAmount) break;
                    stopIdx--;
                }

                stopIdx = Math.min(stopIdx, cursor + maxAyahs - 1, endIdx);

                if (schedule.strictSequentialMode) {
                    const startLocation = repo.getLocationFromIndex(cursor, directionData.index_map);
                    const stopLocation = repo.getLocationFromIndex(stopIdx, directionData.index_map);
                    if (stopLocation.surah !== startLocation.surah) {
                        const surahEndAyah = direction ? 1 : repo.getAyahCount(startLocation.surah);
                        stopIdx = repo.getIndexFromLocation(
                            startLocation.surah,
                            surahEndAyah,
                            direction
                        );
                    }
                }

                activeMemorizationDays++;
                cursor = stopIdx + 1;
            }
        }

        let scheduledStudyDays = activeMemorizationDays;
        const consolidationInterval = schedule.consolidationDayInterval;
        if (consolidationInterval && consolidationInterval > 1) {
            // Every Nth generated study day is review-only. Find the smallest
            // horizon that still contains all required memorization days.
            while (scheduledStudyDays - Math.floor(scheduledStudyDays / consolidationInterval) < activeMemorizationDays) {
                scheduledStudyDays++;
            }
        }

        this.scheduleConfig = {
            ...schedule,
            // TrackManager counts generated study days, not skipped weekdays.
            limitDays: scheduledStudyDays
        };

        this.replaceFirstHifzRequest(dailyAmount, config.from, config.to, unit);
        this.currentMode = 'HIFZ_ECOSYSTEM';
        return this;
    }

    public setSchedule(config: ScheduleConfig): PlanBuilder {
        this.scheduleConfig = config;
        return this;
    }

    public addHifz(
        amount: number,
        startLocation: LocationConfig,
        endLocation?: LocationConfig,
        options?: { unit?: HifzAmountUnit }
    ): PlanBuilder {
        if (this.currentMode === 'WERD_ECOSYSTEM') throw new PlanError(
            PlanErrorCode.MODE_MIXING,
            Severity.ERROR,
            'لا يمكن الخلط بين أنظمة HIFZ و WERD في نفس الخطة.'
        );
        const unit: HifzAmountUnit = options?.unit ?? 'LINES';
        this.currentMode = 'HIFZ_ECOSYSTEM';
        this.requests.push({
            type: 'HIFZ',
            params: {
                amountLines: amount,
                amount,
                unit,
                startLocation,
                endLocation
            }
        });
        return this;
    }

    public addHifzByAyahs(
        ayahsPerDay: number,
        startLocation: LocationConfig,
        endLocation?: LocationConfig
    ): PlanBuilder {
        return this.addHifz(ayahsPerDay, startLocation, endLocation, { unit: 'AYAHS' });
    }

    public addMinorReview(
        lessonCount: number,
        mode: WindowMode = WindowMode.GRADUAL  // ← اختياري، default = سلوك قديم
    ): PlanBuilder {
        if (this.currentMode === 'NONE') this.currentMode = 'HIFZ_ECOSYSTEM';
        this.requests.push({
            type: 'MINOR_REVIEW',
            params: { lessonCount, mode }  // ← mode محفوظ في الـ request
        });
        return this;
    }


    public addMajorReview(
        amountLines: number,
        startLocation?: LocationConfig,
        endLocation?: LocationConfig,
        options?: { horizonLines?: number }   // 🚀 Optional sliding-window floor
    ): PlanBuilder {
        // ... (Logic unchanged)
        if (this.currentMode === 'NONE') this.currentMode = 'HIFZ_ECOSYSTEM';
        this.requests.push({
            type: 'MAJOR_REVIEW',
            params: { amountLines, startLocation, endLocation, horizonLines: options?.horizonLines }
        });
        return this;
    }

    public stopWhenCompleted(): PlanBuilder {
        this.stopOnCompletion = true;
        return this;
    }

    public build(): TrackManager {
        if (!this.scheduleConfig) {
            throw new PlanError(
                PlanErrorCode.MISSING_SCHEDULE,
                Severity.ERROR,
                'يجب استدعاء setSchedule() قبل build().'
            );
        }

        // Validate Hifz track requests against scheduleConfig
        for (const req of this.requests) {
            if (req.type === 'HIFZ') {
                const unit: HifzAmountUnit = req.params.unit ?? 'LINES';
                const amount: number = req.params.amount ?? req.params.amountLines;
                this.validateHifzAmount(amount, unit, this.scheduleConfig);
            }
        }

        // 🚀 DI Injection Point
        // The Builder is the "Composition Root" here (or close to it).
        const repository = QuranRepository.getInstance();

        const manager = new TrackManager({
            startDate: this.scheduleConfig.startDate,
            daysPerWeek: this.scheduleConfig.daysPerWeek,
            limitDays: this.scheduleConfig.limitDays || 0,
            endDate: this.scheduleConfig.endDate,
            isReverse: this.scheduleConfig.isReverse || false,
            catchUpDayOfWeek: this.scheduleConfig.catchUpDayOfWeek,
            holidays: this.scheduleConfig.holidays,
            // Pedagogical constraints
            maxAyahPerDay: this.scheduleConfig.maxAyahPerDay,
            maxLinesPerDay: this.scheduleConfig.maxLinesPerDay,
            sequentialSurahMode: this.scheduleConfig.surahCompletion?.enabled
                ?? this.scheduleConfig.sequentialSurahMode,
            strictSequentialMode: this.scheduleConfig.strictSequentialMode,
            surahCompletionMaxOverflowLines: this.scheduleConfig.surahCompletion?.maxOverflowLines,
            surahCompletionMaxOverflowAyahs: this.scheduleConfig.surahCompletion?.maxOverflowAyahs,
            surahCompletionMayExceedMaxAyahs: this.scheduleConfig.surahCompletion?.mayExceedMaxAyahs,
            consolidationDayInterval: this.scheduleConfig.consolidationDayInterval,
            includeHijri: this.scheduleConfig.includeHijri,
            derivedDailyAmount: this.derivedDailyAmountValue,
            derivedDailyUnit: this.derivedDailyAmountUnit
        }, repository); // Passing the dependency

        const context = { isReverse: this.scheduleConfig.isReverse || false };

        const priorityMap: Record<string, number> = {
            'HIFZ': 1,
            'MINOR_REVIEW': 2,
            'MAJOR_REVIEW': 3
        };
        this.requests.sort((a, b) => priorityMap[a.type] - priorityMap[b.type]);

        let majorReviewCounter = TrackId.MAJOR_REVIEW;

        this.requests.forEach(req => {
            switch (req.type) {
                case 'HIFZ':
                    HifzSystem.createHifzTrack(
                        manager,
                        context,
                        req.params.amount ?? req.params.amountLines,
                        req.params.startLocation,
                        req.params.endLocation,
                        req.params.unit ?? 'LINES'
                    );
                    break;
                case 'MINOR_REVIEW':
                    HifzSystem.createMinorReview(
                        manager,
                        req.params.lessonCount,
                        req.params.mode,
                        this.scheduleConfig
                    );
                    break;
                case 'MAJOR_REVIEW':
                    HifzSystem.createMajorReview(
                        manager,
                        context,
                        req.params.amountLines,
                        majorReviewCounter++,
                        req.params.startLocation,
                        req.params.endLocation,
                        req.params.horizonLines
                    );
                    break;
            }
        });

        if (this.currentMode === 'HIFZ_ECOSYSTEM' && this.stopOnCompletion) {
            manager.setStopCondition(HifzSystem.getCompletionCondition());
        }

        return manager;
    }
}
