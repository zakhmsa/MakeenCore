// src/core/TrackManager.ts
import { ITrack } from '../tracks/BaseTrack';
import { PlanContext } from './PlanContext';
import { ConstraintManager } from '../constraints/ConstraintManager';
import { QuranRepository } from './QuranRepository'; // Type only!
import { DateUtils } from '../utils/DateUtils';
import { HijriDateUtils } from '../utils/HijriDateUtils';
import { PlanDay, PlanEvent, PlanSnapshot } from './types';
import { EventType } from './constants'; // Import Enum
import { RuleEngine } from '../domain/planning/rules/RuleEngine';
import { RuleContext, RuleCandidate } from '../domain/planning/rules/RuleInterface';
import { AyahIntegrityRule } from '../domain/planning/rules/handlers/AyahIntegrityRule';
import { MaxAyahRule } from '../domain/planning/rules/handlers/MaxAyahRule';
import { MaxLinesRule } from '../domain/planning/rules/handlers/MaxLinesRule';
import { SurahCompletionRule } from '../domain/planning/rules/handlers/SurahCompletionRule';
import { SurahSnapRule } from '../domain/planning/rules/handlers/SurahSnapRule';
import { PageAlignmentRule } from '../domain/planning/rules/handlers/PageAlignmentRule';
import { BalanceCorrectionRule, ThematicHaltingRule } from '../domain/planning/rules/handlers/OtherRules';
import { ReferenceRepository } from '../domain/mushaf/repositories/ReferenceRepository';
import { LoadBalancerService } from '../domain/planning/services/LoadBalancerService';
import { DailyLoadWeights, TrackDefinition, TrackType } from '../domain/planning/entities/PlanConfig';
import { HifzAmountUnit } from '../builders/PlanTypes';

export interface ManagerConfig {
    startDate: string;
    endDate?: string;
    daysPerWeek: number;
    limitDays: number;
    isReverse: boolean;
    catchUpDayOfWeek?: number; // Epic 3
    holidays?: string[];       // Epic 3: 'YYYY-MM-DD'
    // Pedagogical constraints
    maxAyahPerDay?: number;
    maxLinesPerDay?: number;
    sequentialSurahMode?: boolean;
    strictSequentialMode?: boolean;      // If true, never jump surah until 100% complete
    surahCompletionMaxOverflowLines?: number;
    surahCompletionMaxOverflowAyahs?: number;
    surahCompletionMayExceedMaxAyahs?: boolean;
    consolidationDayInterval?: number; // Every N days, no new hifz (only review)
    includeHijri?: boolean;            // Opt-in: attach a Hijri (Umm al-Qura) date to each PlanDay
    derivedDailyAmount?: number;
    derivedDailyUnit?: HifzAmountUnit;
}

export type StopCondition = (tracks: Map<number, ITrack>) => boolean;

/**
 * TrackManager
 * * The core simulation engine.
 * * NOW USING: Canonical Mushaf Dataset (Hafs v18) - Ground Truth data with authentic page boundaries.
 * * Production-ready with accurate page distribution and thematic breaks from Madinah Mushaf coordinates.
 * * REFACTORED:
 * 1. Uses Constructor Injection for QuranRepository (Pure DI).
 * 2. Generates dynamic 'events' array instead of fixed fields.
 */

export class TrackManager {
    private tracks: Map<number, ITrack> = new Map();
    private constraintManager: ConstraintManager;
    private stopCondition: StopCondition | null = null;

    private ruleEngine: RuleEngine;

    // 🚀 DI: Repository is injected, not instantiated
    constructor(
        private config: ManagerConfig,
        private quranRepo: QuranRepository
    ) {
        this.constraintManager = new ConstraintManager();
        this.ruleEngine = new RuleEngine([
            new AyahIntegrityRule(),
            new SurahCompletionRule(), // 🧠 Pedagogical: complete surah before jumping (runs early)
            new SurahSnapRule(),
            new PageAlignmentRule(),
            new ThematicHaltingRule(),
            new BalanceCorrectionRule(),
            new MaxAyahRule(),
            new MaxLinesRule()        // Always last: no soft rule may bypass line capacity
        ]);
    }

    /**
     * Exposes the daily amount derived by `planByDuration` (if duration mode was used).
     */
    public getDerivedDailyAmount(): { amount: number; unit: HifzAmountUnit } | undefined {
        if (this.config.derivedDailyAmount === undefined || this.config.derivedDailyUnit === undefined) {
            return undefined;
        }
        return {
            amount: this.config.derivedDailyAmount,
            unit: this.config.derivedDailyUnit
        };
    }

    addTrack(track: ITrack) {
        this.tracks.set(track.id, track);
    }

    hasTrack(id: number): boolean {
        return this.tracks.has(id);
    }

    getTrack(id: number): ITrack | undefined {
        return this.tracks.get(id);
    }

    // Epic 3 Load Balancer configuration
    private loadWeights: DailyLoadWeights | null = null;
    private trackDefs: TrackDefinition[] = [];

    setLoadBalancing(weights: DailyLoadWeights, tracks: TrackDefinition[]) {
        this.loadWeights = weights;
        this.trackDefs = tracks;
    }

    getConstraintManager() {
        return this.constraintManager;
    }

    setStopCondition(condition: StopCondition) {
        this.stopCondition = condition;
    }

    /**
     * Exports a serializable snapshot of every track's state (positions + full history).
     * Persist this to resume the plan later from the real position.
     *
     * Typical resume flow (the consumer owns persistence & timing):
     *   1. rebuild the manager exactly as before (same tracks) but with the real resume date,
     *   2. call importSnapshot(savedSnapshot),
     *   3. call generatePlan() — it continues from the restored positions.
     */
    exportSnapshot(): PlanSnapshot {
        const tracks: Record<number, ReturnType<ITrack['exportState']>> = {};
        for (const [id, track] of this.tracks) {
            tracks[id] = track.exportState();
        }
        return { version: 1, tracks };
    }

    /**
     * Restores track states from a snapshot. Only tracks that exist on this manager
     * are restored (rebuild the same tracks first). resetIdx/config are untouched.
     */
    importSnapshot(snapshot: PlanSnapshot): void {
        for (const idStr of Object.keys(snapshot.tracks)) {
            const id = Number(idStr);
            const track = this.tracks.get(id);
            if (track) {
                track.importState(snapshot.tracks[id]);
            }
        }
    }

    /**
     * Main simulation loop.
     */
    generatePlan(): PlanDay[] {
        const plan: PlanDay[] = [];
        let currentDate = new Date(this.config.startDate);

        // Use injected repo
        const dirData = this.quranRepo.getDirectionData(this.config.isReverse);
        const endDateObj = this.config.endDate ? new Date(this.config.endDate) : null;

        // Skip to first working day
        while (!DateUtils.isWorkingDay(currentDate, this.config.daysPerWeek)) {
            currentDate = DateUtils.addDays(currentDate, 1);
        }

        let dayCounter = 1;

        while (true) {
            // Stop conditions
            if (this.config.limitDays > 0 && dayCounter > this.config.limitDays) break;
            if (endDateObj && currentDate > endDateObj) break;
            if (dayCounter > 5000) break;

            // Epic 3: Skip calculation and emit empty day if Custom Holiday
            const dateStr = currentDate.toISOString().split('T')[0];
            if (this.config.holidays && this.config.holidays.includes(dateStr)) {
                plan.push({
                    dayNum: dayCounter,
                    date: new Date(currentDate),
                    is_off: true,
                    events: [],
                    hijriDate: this.config.includeHijri ? HijriDateUtils.toHijri(currentDate) : undefined
                });
                dayCounter++;
                currentDate = DateUtils.addDays(currentDate, 1);
                while (!DateUtils.isWorkingDay(currentDate, this.config.daysPerWeek)) {
                    currentDate = DateUtils.addDays(currentDate, 1);
                }
                continue;
            }

            // Build context (Pass injected repo down to context)
            const dayContext = new PlanContext(
                currentDate,
                this.quranRepo, // 👈 Passing the injected instance
                this.constraintManager,
                this.tracks,
                this.config.isReverse,
                dirData.cumulative_array,
                dirData.index_map
            );

            // 🚀 NEW: Initialize dynamic day structure
            const currentPlanDay: PlanDay = {
                dayNum: dayCounter,
                date: new Date(currentDate),
                is_off: false,
                events: [], // Empty event container
                hijriDate: this.config.includeHijri ? HijriDateUtils.toHijri(currentDate) : undefined
            };

            // Epic 3: Load Balancing Application
            let trackAllowances = new Map<number, number>();
            if (this.loadWeights && this.trackDefs.length > 0) {
                const balancer = new LoadBalancerService();
                const isCatchUp = this.config.catchUpDayOfWeek !== undefined && currentDate.getDay() === this.config.catchUpDayOfWeek;
                const allowances = balancer.calculateDailyAllowance(this.trackDefs, this.loadWeights, isCatchUp);
                allowances.forEach(a => trackAllowances.set(a.trackId, a.allowedLines));
            }

            // Check if today is a consolidation day (no new hifz, only review)
            const isConsolidationDay = this.config.consolidationDayInterval !== undefined && 
                                      (dayCounter % this.config.consolidationDayInterval === 0);
            const isCatchUpDay = this.config.catchUpDayOfWeek !== undefined
                && currentDate.getDay() === this.config.catchUpDayOfWeek;

            // Execute tracks in ascending id order — enforces HIFZ(1)→MINOR(2)→MAJOR(3).
            // WindowStrategy depends on Hifz history already being committed before it runs.
            // Sorting here makes that invariant explicit and safe regardless of addTrack() order.
            for (const track of [...this.tracks.values()].sort((a, b) => a.id - b.id)) {
                
                // 🧠 Skip Hifz on consolidation days (only review allowed)
                if ((isConsolidationDay || isCatchUpDay) && track.type === 'linear') {
                    continue;
                }

                // A zero load-balancer allowance suppresses the track entirely;
                // calculating with amount=0 would still emit its first whole ayah.
                if (trackAllowances.get(track.id) === 0) {
                    continue;
                }

                // If there's a dynamic allowance, override the track config temporarily
                const originalLines = (track as any).config.amount;
                if (trackAllowances.has(track.id)) {
                    (track as any).config.amount = trackAllowances.get(track.id);
                }

                const rawStep = track.calculateNextStep(dayContext);

                // Restore
                if (trackAllowances.has(track.id)) {
                    (track as any).config.amount = originalLines;
                }

                const rawSteps = Array.isArray(rawStep) ? rawStep : (rawStep ? [rawStep] : []);

                for (const rs of rawSteps) {
                    const stepUnit: HifzAmountUnit = rs.unit ?? 'LINES';
                    // Epic 2: Pass candidate through rule pipeline
                    const candidate: RuleCandidate = {
                        start: rs.start,
                        proposedEnd: rs.end,
                        targetLines: rs.requestedLines ?? rs.linesProcessed,
                        unit: stepUnit,
                        targetAyahs: rs.requestedAyahs,
                        isReverse: this.config.isReverse,
                        flags: rs.flags,
                        lineLimitEnd: rs.end
                    };

                    const ruleContext: RuleContext = {
                        repository: ReferenceRepository.getInstance(),
                        trackId: track.id,
                        snapThresholdLines: 7, // default threshold
                        // 🧠 Pedagogical constraints
                        maxAyahPerDay: this.config.maxAyahPerDay,
                        maxLinesPerDay: this.config.maxLinesPerDay,
                        sequentialSurahMode: this.config.sequentialSurahMode,
                        strictSequentialMode: this.config.strictSequentialMode,
                        surahCompletionMaxOverflowLines: this.config.surahCompletionMaxOverflowLines,
                        surahCompletionMaxOverflowAyahs: this.config.surahCompletionMaxOverflowAyahs,
                        surahCompletionMayExceedMaxAyahs: this.config.surahCompletionMayExceedMaxAyahs
                    };

                    const ruleResult = this.ruleEngine.evaluate(candidate, ruleContext);

                    // Rebuild step with approved end
                    const approvedIdx = this.quranRepo.getIndexFromLocation(ruleResult.approvedEnd.surah, ruleResult.approvedEnd.ayah, this.config.isReverse);
                    const finalLines = this.quranRepo.getLinesBetween(candidate.start, ruleResult.approvedEnd, this.config.isReverse);
                    const ayahsCount = Math.abs(approvedIdx - rs.startIdx) + 1;
                    const completedByRule = (ruleResult.metadata?.appliedRule.includes('SurahCompletionRule') ?? false)
                        && (ruleResult.approvedEnd.is_end || (this.config.isReverse && ruleResult.approvedEnd.ayah === 1));
                    
                    const step: typeof rs = {
                        ...rs,
                        end: ruleResult.approvedEnd,
                        endIdx: approvedIdx,
                        linesProcessed: finalLines,
                        appliedRules: ruleResult.metadata ? ruleResult.metadata.appliedRule.split(', ') : [],
                        snapReason: ruleResult.metadata?.reason,
                        warnings: ruleResult.warnings,
                        pageStart: candidate.start.page,
                        pageEnd: ruleResult.approvedEnd.page
                    };

                    // 🛡️ Guard: If RuleEngine truncated the step, it might not be completed yet!
                    // Conversely, if SurahCompletionRule expanded the step to reach/pass the track's endIdx,
                    // mark it completed so the track stops cleanly.
                    const trackEndIdx = (track as any).config?.endIdx ?? (dirData.cumulative_array.length - 1);
                    if (approvedIdx < rs.endIdx && step.flags) {
                        step.flags = step.flags.filter(f => f !== 'completed');
                    } else if (approvedIdx >= trackEndIdx && track.type === 'linear') {
                        step.flags = step.flags ?? [];
                        if (!step.flags.includes('completed')) {
                            step.flags.push('completed');
                        }
                    }

                    track.commitStep(step, currentDate);

                    // 🚀 NEW: Generic Event Creation
                    // Determines event type based on track type/name logic
                    let eType = EventType.REVIEW;
                    if (track.type === 'linear') eType = EventType.MEMORIZATION;

                    // Correct Canonical Order
                    let eStart = step.start;
                    let eEnd = step.end;

                    const isLinearAyahs = track.type === 'linear' && stepUnit === 'AYAHS';
                    const isLinearLines = track.type === 'linear' && stepUnit === 'LINES';
                    const overflowLines = isLinearLines
                        ? Math.max(0, Number((finalLines - candidate.targetLines).toFixed(2)))
                        : undefined;
                    const requestedAyahs = isLinearAyahs ? rs.requestedAyahs : undefined;
                    const overflowAyahs = isLinearAyahs && requestedAyahs !== undefined
                        ? Math.max(0, ayahsCount - requestedAyahs)
                        : undefined;

                    let overflowReason: 'AYAH_INTEGRITY' | 'SURAH_COMPLETION' | undefined = undefined;
                    if (isLinearLines && overflowLines !== undefined && overflowLines > 0) {
                        overflowReason = completedByRule ? 'SURAH_COMPLETION' : 'AYAH_INTEGRITY';
                    } else if (isLinearAyahs && overflowAyahs !== undefined && overflowAyahs > 0 && completedByRule) {
                        overflowReason = 'SURAH_COMPLETION';
                    }

                    const event: PlanEvent = {
                        trackId: track.id,
                        trackName: track.name,
                        eventType: eType,
                        data: {
                            start: eStart,
                            end: eEnd,
                            lines: step.linesProcessed,
                            ayahsCount,
                            ...(isLinearLines ? {
                                requestedLines: candidate.targetLines,
                                overflowLines,
                                ...(overflowReason ? { overflowReason } : {})
                            } : {}),
                            ...(isLinearAyahs ? {
                                requestedAyahs,
                                overflowAyahs,
                                ...(overflowReason ? { overflowReason } : {})
                            } : {}),
                            appliedRules: step.appliedRules,
                            is_reset: step.flags?.includes('reset')
                        }
                    };

                    currentPlanDay.events.push(event);
                }
            }

            plan.push(currentPlanDay);

            if (this.stopCondition && this.stopCondition(this.tracks)) {
                break;
            }

            // Advance time
            dayCounter++;
            currentDate = DateUtils.addDays(currentDate, 1);

            while (!DateUtils.isWorkingDay(currentDate, this.config.daysPerWeek)) {
                currentDate = DateUtils.addDays(currentDate, 1);
            }
        }

        return plan;
    }
}
