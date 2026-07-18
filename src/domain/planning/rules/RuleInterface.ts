import { LocationObj } from '../../../core/types';
import { ReferenceRepository } from '../../mushaf/repositories/ReferenceRepository';

export interface RuleMetadata {
    appliedRule: string;
    reason: string;
    adjustmentLines: number; // Positive if lines were added, negative if removed
    /** Allows the final line-cap rule to preserve this exact exception boundary. */
    grantsLineOverflow?: boolean;
}

export interface RuleCandidate {
    start: LocationObj;
    proposedEnd: LocationObj;
    targetLines: number;    // The original requested line count
    isReverse: boolean;     // Direction of memorization
    flags?: string[];       // Optional flags like 'review' to identify track type
    /** Raw whole-ayah boundary selected by the movement strategy. */
    lineLimitEnd?: LocationObj;
    /** Explicit exception boundary granted by a capacity-aware soft rule. */
    permittedOverflowEnd?: LocationObj;
}

export interface RuleResult {
    approvedEnd: LocationObj;
    metadata?: RuleMetadata;
    warnings?: string[];
}

export interface RuleContext {
    repository: ReferenceRepository;
    trackId: string | number;
    // Any future config (like snap thresholds) can go here
    snapThresholdLines: number;
    // Pedagogical constraints
    maxAyahPerDay?: number;
    sequentialSurahMode?: boolean;
    strictSequentialMode?: boolean; // If true, never allow surah jumps until 100% complete
    surahCompletionMaxOverflowLines?: number;
    surahCompletionMayExceedMaxAyahs?: boolean;
}

export type RuleScope = 'all' | 'memorization' | 'review';

export interface PlanningRule {
    readonly name: string;
    readonly priority: number; // Determines explicit rule ordering
    readonly scope: RuleScope;
    
    /**
     * Applies the rule to the candidate location.
     * Returns a new RuleResult, possibly adjusting the approvedEnd.
     */
    apply(candidate: RuleCandidate, context: RuleContext): RuleResult;
}
