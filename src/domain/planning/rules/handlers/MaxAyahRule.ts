import { PlanningRule, RuleCandidate, RuleContext, RuleResult } from '../RuleInterface';

/**
 * MaxAyahRule
 * 
 * Enforces pedagogical constraint: maximum ayahs per day.
 * Prevents cognitive overload by limiting daily memorization chunks.
 * 
 * Default: 10 ayahs in LINES mode (based on educational research).
 * In AYAHS mode, the unit itself is the ayah cap; if an explicit maxAyahPerDay
 * is configured without surah-completion exception, it still acts as an upper bound.
 */
export class MaxAyahRule implements PlanningRule {
    name = 'MaxAyahRule';
    priority = 55; // 🧠 Run LAST - hard cap that overrides all other adjustments
    scope = 'memorization' as const;

    apply(candidate: RuleCandidate, context: RuleContext): RuleResult {
        // Skip for review tracks - they follow lesson boundaries
        if (candidate.flags?.includes('review')) {
            return { approvedEnd: candidate.proposedEnd };
        }

        if (candidate.unit === 'AYAHS') {
            // In AYAHS mode, the unit itself is the daily ayah cap (validated at setup so maxAyahPerDay >= targetAyahs).
            // If surah completion granted an overflow, allow it unless maxAyahPerDay was explicitly set smaller than
            // the completed ayah count AND surahCompletionMayExceedMaxAyahs is explicitly false.
            if (context.maxAyahPerDay === undefined) {
                return { approvedEnd: candidate.proposedEnd };
            }
            if (candidate.permittedOverflowEnd && context.surahCompletionMayExceedMaxAyahs !== false) {
                return { approvedEnd: candidate.proposedEnd };
            }
        }

        const repo = context.repository;
        const currentEnd = candidate.proposedEnd;
        
        // Get max ayah constraint (default to 10 if not specified)
        const maxAyah = context.maxAyahPerDay ?? 10;

        // A teacher may explicitly allow the capacity-aware surah-completion
        // exception to override the ayah cap. It never happens implicitly in LINES mode.
        if (candidate.permittedOverflowEnd && context.surahCompletionMayExceedMaxAyahs) {
            return { approvedEnd: currentEnd };
        }

        // Calculate how many ayahs in this step
        const startIdx = repo.getIndexFromLocation(
            candidate.start.surah, 
            candidate.start.ayah, 
            candidate.isReverse
        );
        const endIdx = repo.getIndexFromLocation(
            currentEnd.surah, 
            currentEnd.ayah, 
            candidate.isReverse
        );

        // Count ayahs (simple index difference in direction)
        const ayahCount = Math.abs(endIdx - startIdx) + 1;

        // If within limit, no adjustment needed
        if (ayahCount <= maxAyah) {
            return { approvedEnd: currentEnd };
        }

        // Need to truncate to max ayah limit
        // Find the ayah at maxAyah distance from start
        const targetIdx = startIdx + maxAyah - 1;

        // Clamp to valid range
        const clampedIdx = Math.min(
            targetIdx, 
            repo.getDirectionData(candidate.isReverse).cumulative_array.length - 1
        );

        const newEnd = repo.getLocationFromIndex(
            clampedIdx, 
            repo.getDirectionData(candidate.isReverse).index_map
        );

        return {
            approvedEnd: newEnd,
            metadata: {
                appliedRule: this.name,
                reason: `Truncated to max ${maxAyah} ayahs per day (was ${ayahCount})`,
                adjustmentLines: -1 * repo.getLinesBetween(currentEnd, newEnd, candidate.isReverse)
            }
        };
    }
}
