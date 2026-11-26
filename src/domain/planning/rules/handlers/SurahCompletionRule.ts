import { PlanningRule, RuleCandidate, RuleContext, RuleResult } from '../RuleInterface';

/**
 * SurahCompletionRule
 * 
 * Enforces contextual learning by completing current surah
 * before moving to the next one. This preserves thematic coherence
 * and improves retention through contextual memory.
 * 
 * When enabled, the rule snaps to surah end if:
 * 1. We're in the middle of a surah
 * 2. The remaining portion is within the configured allowance
 *    (measured in lines in LINES mode, or ayahs in AYAHS mode).
 */
export class SurahCompletionRule implements PlanningRule {
    name = 'SurahCompletionRule';
    priority = 18; // Between MaxAyah (15) and SurahSnap (20)
    scope = 'memorization' as const;

    apply(candidate: RuleCandidate, context: RuleContext): RuleResult {
        // Skip for review tracks
        if (candidate.flags?.includes('review')) {
            return { approvedEnd: candidate.proposedEnd };
        }

        // Skip if neither sequentialSurahMode nor strictSequentialMode is enabled
        if (!context.sequentialSurahMode && !context.strictSequentialMode) {
            return { approvedEnd: candidate.proposedEnd };
        }

        const repo = context.repository;
        const currentEnd = candidate.proposedEnd;
        const dirData = repo.getDirectionData(candidate.isReverse);

        // Check if we've crossed into a new surah
        if (currentEnd.surah !== candidate.start.surah) {
            // 🚫 STRICT MODE: Block ANY surah change until 100% complete
            if (context.strictSequentialMode) {
                const startSurahEndAyah = candidate.isReverse
                    ? 1
                    : repo.getAyahCount(candidate.start.surah);
                // Return to end of previous surah in traversal direction (forces completion on next day)
                const forcedEnd = repo.getLocationFromIndex(
                    repo.getIndexFromLocation(candidate.start.surah, startSurahEndAyah, candidate.isReverse),
                    dirData.index_map
                );
                return {
                    approvedEnd: forcedEnd,
                    metadata: {
                        appliedRule: this.name,
                        reason: `STRICT MODE: Cannot start Surah ${currentEnd.surah} until Surah ${candidate.start.surah} is 100% complete`,
                        adjustmentLines: -repo.getLinesBetween(forcedEnd, currentEnd, candidate.isReverse)
                    }
                };
            }
            // We crossed surah boundary - this is allowed if we completed the previous
            return { approvedEnd: currentEnd };
        }

        // Only attempt surah-completion expansion when sequentialSurahMode (surahCompletion.enabled) is true
        if (!context.sequentialSurahMode) {
            return { approvedEnd: currentEnd };
        }

        // We're still in same surah - check if we should complete it in traversal direction
        const targetSurahEndAyah = candidate.isReverse ? 1 : repo.getAyahCount(currentEnd.surah);
        const currentEndIdx = repo.getIndexFromLocation(currentEnd.surah, currentEnd.ayah, candidate.isReverse);
        const surahEndIdx = repo.getIndexFromLocation(currentEnd.surah, targetSurahEndAyah, candidate.isReverse);

        // If already at surah end in traversal direction, no action needed
        if (currentEndIdx >= surahEndIdx) {
            return { approvedEnd: currentEnd };
        }

        const remainingAyahs = surahEndIdx - currentEndIdx;

        if (remainingAyahs > 0) {
            const newEndLoc = repo.getLocationFromIndex(surahEndIdx, dirData.index_map);

            if (candidate.unit === 'AYAHS') {
                // In AYAHS mode, surah completion is measured in extra ayahs (maxOverflowAyahs, default 2).
                // maxOverflowLines is ignored in AYAHS mode.
                const overflowAllowanceAyahs = Math.max(0, context.surahCompletionMaxOverflowAyahs ?? 2);
                if (remainingAyahs <= overflowAllowanceAyahs) {
                    return {
                        approvedEnd: newEndLoc,
                        metadata: {
                            appliedRule: this.name,
                            reason: `Completed Surah ${currentEnd.surah} within ${overflowAllowanceAyahs} optional overflow ayahs`,
                            adjustmentLines: repo.getLinesBetween(currentEnd, newEndLoc, candidate.isReverse),
                            grantsLineOverflow: true
                        }
                    };
                }
                return { approvedEnd: currentEnd };
            }

            // LINES mode: Completion is governed by line capacity.
            const completedLines = repo.getLinesBetween(candidate.start, newEndLoc, candidate.isReverse);
            const overflowAllowance = Math.max(0, context.surahCompletionMaxOverflowLines ?? 2);
            const maxPermittedLines = candidate.targetLines + overflowAllowance;

            if (completedLines <= maxPermittedLines) return {
                approvedEnd: newEndLoc,
                metadata: {
                    appliedRule: this.name,
                    reason: `Completed Surah ${currentEnd.surah} within ${overflowAllowance} optional overflow lines`,
                    adjustmentLines: repo.getLinesBetween(currentEnd, newEndLoc, candidate.isReverse),
                    grantsLineOverflow: true
                }
            };
        }

        return { approvedEnd: currentEnd };
    }
}
