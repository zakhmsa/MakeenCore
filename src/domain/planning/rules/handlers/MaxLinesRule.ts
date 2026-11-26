import { PlanningRule, RuleCandidate, RuleContext, RuleResult } from '../RuleInterface';

/**
 * Final hard line boundary for new memorization.
 *
 * - In LINES mode: the raw strategy boundary already represents the one whole ayah
 *   that meets or crosses the requested line capacity. Soft rules may not move beyond
 *   it unless a capacity-aware rule explicitly grants an exception boundary.
 * - In AYAHS mode: line counts do not cap the lesson unless `maxLinesPerDay` (optional
 *   line guard) is configured. When `maxLinesPerDay` binds, the lesson stops at the
 *   last whole ayah that fits within `maxLinesPerDay` (minimum 1 ayah — never empty)
 *   and records `LINE_GUARD` in `appliedRules`.
 */
export class MaxLinesRule implements PlanningRule {
    name = 'MaxLinesRule';
    priority = 60;
    scope = 'memorization' as const;

    apply(candidate: RuleCandidate, context: RuleContext): RuleResult {
        const repo = context.repository;

        if (candidate.unit === 'AYAHS') {
            if (context.maxLinesPerDay === undefined) {
                return { approvedEnd: candidate.proposedEnd };
            }

            const maxLines = context.maxLinesPerDay;
            const dirData = repo.getDirectionData(candidate.isReverse);
            const startIdx = repo.getIndexFromLocation(
                candidate.start.surah,
                candidate.start.ayah,
                candidate.isReverse
            );
            const currentEndIdx = repo.getIndexFromLocation(
                candidate.proposedEnd.surah,
                candidate.proposedEnd.ayah,
                candidate.isReverse
            );

            const currentLines = repo.getLinesBetween(
                candidate.start,
                candidate.proposedEnd,
                candidate.isReverse
            );

            if (currentLines <= maxLines) {
                return { approvedEnd: candidate.proposedEnd };
            }

            // Walk back to the last whole ayah that fits within maxLines,
            // guaranteeing a minimum of 1 ayah (startIdx).
            let guardIdx = currentEndIdx;
            while (guardIdx > startIdx) {
                const candidateLoc = repo.getLocationFromIndex(guardIdx, dirData.index_map);
                const lines = repo.getLinesBetween(candidate.start, candidateLoc, candidate.isReverse);
                if (lines <= maxLines) {
                    break;
                }
                guardIdx--;
            }

            const guardedEnd = repo.getLocationFromIndex(guardIdx, dirData.index_map);
            const removedLines = repo.getLinesBetween(guardedEnd, candidate.proposedEnd, candidate.isReverse);

            return {
                approvedEnd: guardedEnd,
                metadata: {
                    appliedRule: 'LINE_GUARD',
                    reason: `Line guard bound at ${maxLines} maxLinesPerDay (emitted ${guardIdx - startIdx + 1} ayah(s))`,
                    adjustmentLines: -removedLines
                }
            };
        }

        const hardEnd = candidate.permittedOverflowEnd ?? candidate.lineLimitEnd;
        if (!hardEnd) return { approvedEnd: candidate.proposedEnd };

        const currentIdx = repo.getIndexFromLocation(
            candidate.proposedEnd.surah,
            candidate.proposedEnd.ayah,
            candidate.isReverse
        );
        const hardIdx = repo.getIndexFromLocation(hardEnd.surah, hardEnd.ayah, candidate.isReverse);

        if (currentIdx <= hardIdx) return { approvedEnd: candidate.proposedEnd };

        const removedLines = repo.getLinesBetween(hardEnd, candidate.proposedEnd, candidate.isReverse);
        return {
            approvedEnd: hardEnd,
            metadata: {
                appliedRule: this.name,
                reason: `Truncated soft-rule expansion to the daily whole-ayah line boundary (${candidate.targetLines} requested lines)`,
                adjustmentLines: -removedLines
            }
        };
    }
}
