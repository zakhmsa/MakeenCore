import { PlanningRule, RuleCandidate, RuleContext, RuleResult } from '../RuleInterface';

/**
 * Final hard line boundary for new memorization.
 *
 * The raw strategy boundary already represents the one whole ayah that meets or
 * crosses the requested line capacity. Soft rules may not move beyond it unless
 * a capacity-aware rule explicitly grants an exception boundary.
 */
export class MaxLinesRule implements PlanningRule {
    name = 'MaxLinesRule';
    priority = 60;
    scope = 'memorization' as const;

    apply(candidate: RuleCandidate, context: RuleContext): RuleResult {
        const hardEnd = candidate.permittedOverflowEnd ?? candidate.lineLimitEnd;
        if (!hardEnd) return { approvedEnd: candidate.proposedEnd };

        const repo = context.repository;
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
