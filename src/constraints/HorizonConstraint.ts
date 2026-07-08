import { IConstraint } from './ConstraintManager';
import { ITrack } from '../tracks/BaseTrack';
import { QuranRepository } from '../core/QuranRepository';
import { findExponentialStopIndex } from '../utils/Algorithms';

/**
 * HorizonConstraint
 *
 * Imposes a *floor* (lower bound) on a review track: it may not reach further
 * back than `horizonLines` behind the target track's front (e.g. the Hifz front).
 *
 * Together with WallConstraint (the ceiling), this carves out a **sliding window**
 * of the most recently memorized material:
 *
 *     [ front − horizonLines , front ]
 *
 * As the target (Hifz) advances, the floor slides forward with it, so the review
 * keeps focusing on the most recent `horizonLines` lines instead of always
 * restarting from a fixed origin.
 *
 * DIRECTION OF LIMITS — why two different methods:
 * - WallConstraint is a CEILING  → exposed via getLimitIndex (manager aggregates by MIN).
 * - HorizonConstraint is a FLOOR → exposed via getFloorIndex (manager aggregates by MAX).
 *   getLimitIndex intentionally returns null so the horizon never acts as a ceiling.
 *
 * `horizonLines` is fully configurable (see PlanBuilder.addMajorReview options /
 * TrackConfigDTO.config.horizonLines). When it is not supplied, no HorizonConstraint
 * is created and the review keeps its classic fixed-origin cycling behavior.
 */
export class HorizonConstraint implements IConstraint {
    constructor(
        private sourceTrackId: number,   // The track being limited (e.g. Major Review)
        private targetTrackId: number,   // The reference front (e.g. Hifz)
        private horizonLines: number,    // Max allowed lines behind the front
        private quranRepo: QuranRepository,
        private isReverse: boolean
    ) {}

    /**
     * Lower bound: the index sitting `horizonLines` behind the target's front.
     * @complexity O(log n) via exponential search on the cumulative array.
     */
    getFloorIndex(sourceTrack: ITrack, allTracks: Map<number, ITrack>): number | null {
        if (sourceTrack.id !== this.sourceTrackId) return null;
        if (this.horizonLines <= 0) return null;

        const target = allTracks.get(this.targetTrackId);
        if (!target) return null;

        const targetCurrentIdx = target.state.currentIdx;

        const dirData = this.quranRepo.getDirectionData(this.isReverse);
        // Cumulative lines completed up to (but not including) the front.
        const cumValue = targetCurrentIdx > 0 ? dirData.cumulative_array[targetCurrentIdx - 1] : 0;

        // Progress hasn't exceeded the window yet → no meaningful floor (review the whole thing).
        if (cumValue <= this.horizonLines) return null;

        const horizonCumValue = cumValue - this.horizonLines;

        const floorIdx = findExponentialStopIndex(
            dirData.cumulative_array,
            horizonCumValue,
            0,
            dirData.cumulative_array.length - 1
        );

        return Math.max(0, floorIdx);
    }

    /** Horizon is a floor, not a ceiling — it intentionally imposes no upper limit. */
    getLimitIndex(_sourceTrack: ITrack, _allTracks: Map<number, ITrack>): number | null {
        return null;
    }

    validate(_sourceTrack: ITrack, _allTracks: Map<number, ITrack>): boolean {
        return true;
    }
}
