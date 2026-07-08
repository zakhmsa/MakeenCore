import { IMovementStrategy } from './IMovementStrategy';
import { TrackState, StepResult } from '../core/types';
import { PlanContext } from '../core/PlanContext';
import { findExponentialStopIndex } from '../utils/Algorithms';

/**
 * LoopingStrategy — State-Driven Major Review
 * 
 * ARCHITECTURE FIX: This strategy now implements a **state-driven pointer**
 * instead of rule-driven generation.
 * 
 * BEHAVIOR:
 * 1. Pointer starts at configured startIdx (e.g. Surah An-Nas)
 * 2. Each day: pointer += dailyAmount (one single chunk)
 * 3. If pointer reaches the wall (memorized boundary): RESET
 *    - Emit the partial chunk up to the wall
 *    - Flag 'reset' so commitStep wraps pointer to startIdx
 *    - Next day starts fresh from startIdx
 * 4. **NEVER produce multiple chunks in one day** — prevents
 *    multi-track confusion and inconsistent direction
 * 
 * This ensures:
 * - Consistent ASC direction within each cycle
 * - One Major Review event per day
 * - Predictable coverage cycles
 * - Reset ONLY when pointer >= wall (real cycle completion)
 */
export class LoopingStrategy implements IMovementStrategy {
    calculateNextStep(
        state: TrackState, 
        context: PlanContext, 
        config: { amount: number, trackId: number, endIdx?: number, startIdx?: number }
    ): StepResult | null {
        const currentIdx = state.currentIdx;
        const maxIndex = context.cumulativeArray.length - 1;

        // Determine the wall = CEILING (boundary of memorized material)
        let wallIdx = maxIndex;
        const meTrack = context.allTracks.get(config.trackId);
        if (config.endIdx !== undefined) {
            wallIdx = Math.min(config.endIdx, maxIndex);
        } else if (meTrack) {
            const barrier = context.constraintManager.getBarrierIndex(meTrack, context.allTracks);
            if (barrier !== null) {
                wallIdx = barrier;
            }
        }

        // Determine the horizon = FLOOR (sliding lower bound). When a HorizonConstraint
        // is configured, the review may not begin before this index; as the front
        // advances the floor slides forward, turning each cycle into a "most recent
        // N lines" window. When absent, getFloorIndex is null → floorIdx stays 0 and
        // behavior is identical to the classic fixed-origin cycle (backward compatible).
        let floorIdx = 0;
        if (meTrack) {
            const floor = context.constraintManager.getFloorIndex(meTrack, context.allTracks);
            if (floor !== null && floor > floorIdx) {
                floorIdx = floor;
            }
        }

        // Effective start clamps up to the floor. After a reset (commitStep sets
        // currentIdx = resetIdx, which may sit below the slid-forward floor), this
        // snaps the next cycle to the current window instead of the original origin.
        const startIdx = Math.max(currentIdx, floorIdx);

        // Guard: nothing to review (pool is empty)
        if (wallIdx <= 0) return null;
        if (startIdx >= wallIdx) {
            // At/past the wall, or the floor caught up to the wall (window collapsed).
            // Return null; commitStep from the previous day handles the reset.
            return null;
        }

        // Calculate target position
        const currentCum = startIdx > 0 ? context.cumulativeArray[startIdx - 1] : 0;
        const targetCum = currentCum + config.amount;

        let stopIdx = findExponentialStopIndex(
            context.cumulativeArray,
            targetCum,
            startIdx,
            Math.min(wallIdx, maxIndex)
        );

        // Clamp to wall
        let hitWall = false;
        if (stopIdx >= wallIdx) {
            stopIdx = wallIdx;
            hitWall = true;
        }

        // No movement possible
        if (stopIdx <= startIdx) {
            return null;
        }

        const linesProcessed = context.cumulativeArray[stopIdx] - currentCum;

        return {
            startIdx: startIdx,
            endIdx: stopIdx,
            start: context.quranRepo.getLocationFromIndex(startIdx, context.indexMap),
            end: context.quranRepo.getLocationFromIndex(stopIdx, context.indexMap),
            linesProcessed: parseFloat(linesProcessed.toFixed(2)),
            flags: hitWall ? ['review', 'reset'] : ['review']
        };
    }
}