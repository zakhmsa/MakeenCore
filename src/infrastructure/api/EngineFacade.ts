import { 
    CreatePlanPreviewRequestDTO, 
    CreatePlanPreviewResponseDTO,
    EstimateCompletionRequestDTO,
    EstimateCompletionResponseDTO,
    DatasetValidationResponseDTO
} from './contracts';
import { PlanBuilder } from '../../builders/PlanBuilder';
import { TrackManager } from '../../core/TrackManager';
import { WindowMode } from '../../core/constants';
import { PlanError, PlanErrorCode, Severity } from '../../errors';
import { PlanDay } from '../../core/types';
import { QuranRepository } from '../../core/QuranRepository';

/**
 * EngineFacade
 * Top-level application boundary for consuming the MakeenCore engine.
 * Maps standard API DTOs into domain logic execution and serializes output.
 */
export class EngineFacade {
    
    /**
     * Generates a fully calculated plan based on constraints.
     */
    public static generatePlan(request: CreatePlanPreviewRequestDTO): CreatePlanPreviewResponseDTO {
        try {
            const builder = new PlanBuilder();
            const hifzConfig = request.tracks.find(track => track.type === 'HIFZ')?.config ?? {};
            const minorTrack = request.tracks.find(track => track.type === 'MINOR_REVIEW');

            // Set global schedule configuration
            builder.setSchedule({
                startDate: request.startDate,
                daysPerWeek: request.daysPerWeek,
                limitDays: 0, // 0 = continuous until completed
                isReverse: request.direction === 'REVERSE',
                catchUpDayOfWeek: request.catchUpDay,
                holidays: request.holidays,
                includeHijri: request.includeHijri,
                maxAyahPerDay: hifzConfig.maxAyahPerDay,
                maxLinesPerDay: hifzConfig.maxLinesPerDay,
                sequentialSurahMode: hifzConfig.sequentialSurahMode,
                strictSequentialMode: hifzConfig.strictSequentialMode,
                surahCompletion: hifzConfig.surahCompletion,
                consolidationDayInterval: hifzConfig.consolidationDayInterval,
                surahBoundedMinorReview: minorTrack?.config?.surahBounded ?? true,
                minorReviewPagesCount: minorTrack?.amountUnit === 'PAGES'
                    ? minorTrack.amountValue
                    : minorTrack?.config?.pagesCount
            });

            // Map DTO tracks into the domain builder
            for (const track of request.tracks) {
                if (track.amountUnit === 'AYAHS' && track.type !== 'HIFZ') {
                    throw new PlanError(
                        PlanErrorCode.INVALID_INPUT,
                        Severity.ERROR,
                        `وحدة AYAHS مدعومة فقط لمسار الحفظ الجديد (HIFZ)، ولا تدعم المسار ${track.type}.`,
                        { trackType: track.type, amountUnit: track.amountUnit }
                    );
                }

                switch(track.type) {
                    case 'HIFZ':
                        if (!track.start) {
                            throw new PlanError(
                                PlanErrorCode.INVALID_INPUT,
                                Severity.ERROR,
                                'مسار الحفظ (HIFZ) يتطلب تحديد موقع البداية (start).'
                            );
                        }
                        if (track.amountUnit === 'AYAHS') {
                            builder.addHifz(
                                track.amountValue,
                                { surah: track.start.surah, ayah: track.start.ayah },
                                track.end ? { surah: track.end.surah, ayah: track.end.ayah } : undefined,
                                { unit: 'AYAHS' }
                            );
                        } else {
                            builder.addHifz(
                                track.amountUnit === 'PAGES' ? track.amountValue * 15 : track.amountValue,
                                { surah: track.start.surah, ayah: track.start.ayah },
                                track.end ? { surah: track.end.surah, ayah: track.end.ayah } : undefined
                            );
                        }
                        break;
                    case 'MINOR_REVIEW':
                        builder.addMinorReview(
                            track.amountUnit === 'PAGES' ? track.amountValue * 15 : track.amountValue,
                            track.config?.mode === 'FIXED' ? WindowMode.FIXED : WindowMode.GRADUAL
                        );
                        break;
                    case 'MAJOR_REVIEW':
                        builder.addMajorReview(
                            track.amountUnit === 'PAGES' ? track.amountValue * 15 : track.amountValue,
                            track.start ? { surah: track.start.surah, ayah: track.start.ayah } : undefined,
                            track.end ? { surah: track.end.surah, ayah: track.end.ayah } : undefined,
                            track.config?.horizonLines !== undefined ? { horizonLines: track.config.horizonLines } : undefined
                        );
                        break;
                    default:
                        // Ignore unsupported track types in engine execution
                        console.warn(`Tracking type ${track.type} is not yet supported in this version of MakeenCore`);
                        break;
                }
            }

            builder.stopWhenCompleted();

            const manager: TrackManager = builder.build();
            const plan: PlanDay[] = manager.generatePlan();

            // Format standard JSON DTO response
            return {
                success: true,
                data: {
                    estimatedCompletionDate: plan.length > 0 ? plan[plan.length - 1].date.toISOString().split('T')[0] : request.startDate,
                    totalDays: plan.length,
                    plan: plan.map(day => ({
                        dayNumber: day.dayNum,
                        date: day.date.toISOString().split('T')[0],
                        hijriDate: day.hijriDate,
                        dayType: day.is_off ? 'OFF' : 'WORKING',
                        totalLoad: day.events.reduce((sum, ev) => sum + (ev.data.lines || 0), 0),
                        events: day.events.map(ev => {
                            // Determine semantic boundaries based on domain event types
                            const trackType = ev.trackId === 1 ? 'HIFZ' : 
                                              ev.trackId === 2 ? 'MINOR_REVIEW' : 'MAJOR_REVIEW';
                            const eventType = ev.eventType === 'MEMORIZATION' ? 'MEMORIZATION' : 'REVIEW';
                            
                            return {
                                trackType,
                                eventType,
                                start: { surah: ev.data.start.surah, ayah: ev.data.start.ayah },
                                end: { surah: ev.data.end.surah, ayah: ev.data.end.ayah },
                                linesCount: ev.data.lines || 0,
                                ayahsCount: ev.data.ayahsCount,
                                appliedRules: ev.data.appliedRules ?? [],
                                ...(ev.data.requestedLines !== undefined ? { requestedLines: ev.data.requestedLines } : {}),
                                ...(ev.data.overflowLines !== undefined ? { overflowLines: ev.data.overflowLines } : {}),
                                ...(ev.data.requestedAyahs !== undefined ? { requestedAyahs: ev.data.requestedAyahs } : {}),
                                ...(ev.data.overflowAyahs !== undefined ? { overflowAyahs: ev.data.overflowAyahs } : {}),
                                ...(ev.data.overflowReason !== undefined ? { overflowReason: ev.data.overflowReason } : {})
                            };
                        })
                    }))
                }
            };
        } catch (error) {
            console.error("[MakeenCore] EngineFacade payload execution failed:", error);
            return {
                success: false,
                data: {
                    plan: [],
                    totalDays: 0,
                    estimatedCompletionDate: ''
                },
                error: error instanceof PlanError ? error.message : String(error)
            } as unknown as CreatePlanPreviewResponseDTO;
        }
    }

    /**
     * Executes a fast simulation to estimate dates without returning heavy daily payloads.
     */
    public static estimateTimeline(request: EstimateCompletionRequestDTO): EstimateCompletionResponseDTO {
        // TODO: For a fast estimate, we might only run the loops without capturing events in memory,
        // but for now, generate the plan and calculate.
        try {
            // Simplified payload
            const response = this.generatePlan({
                name: 'Estimation Plan',
                startDate: request.startDate,
                direction: request.direction,
                daysPerWeek: request.daysPerWeek,
                tracks: request.tracks
            });

            if (!response.success) throw new Error("Simulation failed");

            return {
                success: true,
                data: {
                    estimatedCompletionDate: response.data.estimatedCompletionDate,
                    estimatedDays: response.data.totalDays
                }
            };

        } catch(err) {
            return {
                success: false,
                data: { estimatedCompletionDate: 'N/A', estimatedDays: 0 }
            };
        }
    }

    /**
     * Executes a fast validation sequence on the static dataset, returning its health matrix.
     */
    public static validateDataset(): DatasetValidationResponseDTO {
        try {
            const repo = QuranRepository.getInstance();
            const fwd = repo.getDirectionData(false);
            const rev = repo.getDirectionData(true);

            const checks = [
                { name: 'Forward index loaded', passed: fwd.reverse_index.length > 0 },
                { name: 'Reverse index loaded', passed: rev.reverse_index.length > 0 },
                { name: 'Index symmetry', passed: fwd.reverse_index.length === rev.reverse_index.length },
                { name: 'Ayah boundary bounds', passed: fwd.reverse_index.length === 6236 }
            ];

            const allPassed = checks.every(c => c.passed);

            return {
                success: true,
                data: {
                    valid: allPassed,
                    checks
                }
            };
        } catch (error) {
            return {
                success: false,
                data: { valid: false, checks: [{ name: 'Engine crashed during validation payload', passed: false }] }
            };
        }
    }
}
