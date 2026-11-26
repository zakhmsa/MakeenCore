import { IMovementStrategy } from './IMovementStrategy';
import { TrackState, StepResult } from '../core/types';
import { PlanContext } from '../core/PlanContext';
import { findExponentialStopIndex } from '../utils/Algorithms';
import { LinearTrackConfig } from '../builders/PlanTypes';

/**
 * LinearStrategy
 * * Simple forward progression (used for new Hifz).
 * Moves by fixed amount each day until completion.
 * * 🚀 UPDATED: Supports both 'LINES' (default) and 'AYAHS' daily amount units,
 *   plus optional 'End Index' and overshoot protection.
 */
export class LinearStrategy implements IMovementStrategy {
    calculateNextStep(
        state: TrackState, 
        context: PlanContext, 
        config: LinearTrackConfig
    ): StepResult {
        const currentIdx = state.currentIdx;
        const unit = config.unit ?? 'LINES';
        
        // 1. Determine Effective Limit (The "Ceiling")
        // It's either the user-defined endIdx OR the absolute end of the Quran.
        const globalMax = context.cumulativeArray.length - 1;
        const targetMax = config.endIdx !== undefined ? config.endIdx : globalMax;
        
        // Safety clamp to ensure we never look beyond array bounds
        const effectiveMax = Math.min(targetMax, globalMax);
        const currentCum = currentIdx > 0 ? context.cumulativeArray[currentIdx - 1] : 0;

        let stopIdx: number;

        if (unit === 'AYAHS') {
            // In AYAHS mode, each array index represents one canonical whole ayah.
            // Taking N ayahs starting at currentIdx stops at currentIdx + N - 1,
            // clamped to effectiveMax.
            stopIdx = Math.min(currentIdx + config.amount - 1, effectiveMax);
        } else {
            // 2. Calculate Target Cumulative Value (LINES mode)
            const targetCum = currentCum + config.amount;

            // 3. Find Stop Index using Exponential Search (O(log n))
            // We limit the search range to 'effectiveMax' to optimize performance.
            stopIdx = findExponentialStopIndex(
                context.cumulativeArray,
                targetCum,
                currentIdx,
                effectiveMax
            );

            // Float32 prefix sums can sit microscopically below an exact line
            // boundary (for example 7.99997 instead of 8). Normalize using the same
            // two-decimal precision exposed by the engine so an unnecessary extra
            // ayah is never selected.
            while (stopIdx > currentIdx) {
                const previousLines = Number(
                    (context.cumulativeArray[stopIdx - 1] - currentCum).toFixed(2)
                );
                if (previousLines < config.amount) break;
                stopIdx--;
            }

            // 4. 🛡️ OVERSHOOT PROTECTION (Edge Case Handling)
            if (stopIdx >= effectiveMax) {
                stopIdx = effectiveMax;
            }
        }

        const linesProcessed = parseFloat((context.cumulativeArray[stopIdx] - currentCum).toFixed(2));

        const result: StepResult = {
            startIdx: currentIdx,
            endIdx: stopIdx,
            start: context.quranRepo.getLocationFromIndex(currentIdx, context.indexMap),
            end: context.quranRepo.getLocationFromIndex(stopIdx, context.indexMap),
            linesProcessed,
            unit,
            requestedLines: unit === 'LINES' ? config.amount : undefined,
            requestedAyahs: unit === 'AYAHS' ? config.amount : undefined,
            flags: ['memorization'] // Mark as memorization for rule pipeline
        };

        // 5. COMPLETION FLAG
        // If we reached (or exceeded) the effective max, mark as completed.
        if (stopIdx >= effectiveMax) {
            result.flags?.push('completed');
        }

        return result;
    }
}
