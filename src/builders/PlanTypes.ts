/**
 * PlanTypes.ts
 * Type definitions for the Quran Planning Engine.
 * Establishes type-safe contracts across all modules.
 */

/**
 * Execution mode for plan building.
 * Prevents incompatible track combinations (e.g., can't mix Hifz with Werd).
 */
export type PlanMode = 'NONE' | 'HIFZ_ECOSYSTEM' | 'WERD_ECOSYSTEM';

/**
 * Track request types (sorted by priority during build phase).
 */
export type TrackRequestType = 'HIFZ' | 'MINOR_REVIEW' | 'MAJOR_REVIEW';

/**
 * Daily amount unit for new memorization (Hifz).
 * - 'LINES': canonical mushaf lines (default)
 * - 'AYAHS': count of whole ayahs
 */
export type HifzAmountUnit = 'LINES' | 'AYAHS';

/**
 * Internal request object for deferred execution pattern.
 */
export interface TrackRequest {
    type: TrackRequestType;
    params: any; // Polymorphic - contents vary by track type
}

/**
 * Quranic location in user-friendly coordinates.
 */
export interface LocationConfig {
    surah: number;  // 1-114
    ayah: number;   // Varies by surah
}

/**
 * Configuration for completion by duration.
 */
export interface CompletionByDurationConfig {
    from: LocationConfig;
    to: LocationConfig;
    durationDays: number;
    /** Unit used to derive the daily amount from the range. Default: 'LINES'. */
    unit?: HifzAmountUnit;
}

/**
 * Configuration for completion by daily amount (lines or ayahs).
 */
export interface CompletionByDailyAmountConfig {
    from: LocationConfig;
    to: LocationConfig;
    /** Daily capacity in mushaf lines (when unit is 'LINES' or omitted). */
    dailyLines?: number;
    /** Daily capacity in whole ayahs (shorthand for unit: 'AYAHS'). */
    dailyAyahs?: number;
    /** Explicit unit selector when passing dailyLines or dailyAyahs. */
    unit?: HifzAmountUnit;
}

/**
 * Explicit ayah-based daily amount configuration (alias for clarity).
 */
export interface CompletionByDailyAyahsConfig {
    from: LocationConfig;
    to: LocationConfig;
    dailyAyahs: number;
}

/**
 * Temporal configuration for the plan execution.
 */
export interface ScheduleConfig {
    startDate: string;       // ISO format (YYYY-MM-DD)
    daysPerWeek: number;     // 1-7 working days
    limitDays?: number;      // Max days (0 = run to completion)
    endDate?: string;        // Optional deadline
    isReverse?: boolean;     // false = Fatiha→Nas, true = Nas→Fatiha
    catchUpDayOfWeek?: number; // Optional catch-up day index (0-6)
    holidays?: string[];       // Exact YYYY-MM-DD off days
    
    // PEDAGOGICAL CONSTRAINTS (for human-optimized planning)
    /**
     * Maximum ayahs per day in LINES mode (default: 10, recommended: 5-15).
     * In AYAHS mode, the daily ayah amount itself is the ayah cap; passing a smaller
     * maxAyahPerDay than dailyAyahs throws an INVALID_INPUT PlanError.
     */
    maxAyahPerDay?: number;
    /**
     * Optional hard line cap per day in AYAHS mode.
     * Prevents N very long ayahs from producing an oversized lesson; stops at the
     * last whole ayah that fits (minimum 1 ayah — never emits an empty lesson)
     * and records 'LINE_GUARD' in appliedRules.
     */
    maxLinesPerDay?: number;
    /** Complete surah before jumping to next (default: false) */
    sequentialSurahMode?: boolean;
    /** Capacity-aware surah completion measured in mushaf lines (LINES mode) or ayahs (AYAHS mode). */
    surahCompletion?: SurahCompletionConfig;
    /** Every N days, take a consolidation day (no new hifz, only review) */
    consolidationDayInterval?: number;
    /** 
     * Strict sequential mode: never change surah until 100% complete.
     * If true: waits on consolidation days if surah completion would exceed maxAyahPerDay.
     * Kept for backwards compatibility. Hard daily constraints still run.
     */
    strictSequentialMode?: boolean;
    
    // MINOR REVIEW CONFIGURATION
    /** 
     * Surah-bounded minor review: review stays within current surah only.
     * Defaults to true. Set false only for the legacy cross-surah window.
     */
    surahBoundedMinorReview?: boolean;
    /**
     * Minor review amount in pages (15 lines = 1 page).
     * If specified, overrides lesson count for minor review.
     * Recommended: 4-5 pages for weekly review coverage.
     */
    minorReviewPagesCount?: number;

    // HIJRI CALENDAR (display only)
    /**
     * Opt-in: attach a Hijri (Umm al-Qura) date string to every generated PlanDay.
     * Zero-dependency (Intl). Display-only — never affects scheduling. Default: false.
     */
    includeHijri?: boolean;
    
    // NOTE: Stop conditions are NOT defined here to keep ScheduleConfig pure.
    // Use PlanBuilder methods (e.g., .stopWhenCompleted()) instead.
}

/**
 * Shared context passed to subsystems during build phase.
 */
export interface BuilderContext {
    isReverse: boolean;
}

/**
 * 🚀 NEW: Configuration interface for Linear Strategy
 * Explicitly defines that a track can have an optional end boundary and unit.
 */
export interface LinearTrackConfig {
    amount: number;
    unit?: HifzAmountUnit;
    endIdx?: number; // Optional: If undefined, runs to end of Quran
}

/** Optional, capacity-aware preference for finishing the current surah. */
export interface SurahCompletionConfig {
    enabled: boolean;
    /** Maximum optional overflow above the daily line limit in LINES mode. Default: 2 lines. Ignored in AYAHS mode. */
    maxOverflowLines?: number;
    /** Maximum optional overflow above the daily ayah limit in AYAHS mode. Default: 2 ayahs. */
    maxOverflowAyahs?: number;
    /** Whether surah completion may also exceed maxAyahPerDay in LINES mode. Default: false. */
    mayExceedMaxAyahs?: boolean;
}
