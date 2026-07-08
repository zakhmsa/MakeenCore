// src/core/types.ts
import { TrackId, EventType } from './constants';

/**
 * Core type definitions for the engine.
 */

export interface LocationObj {
    surah: number;
    ayah: number;
    is_end: boolean;
    page?: number;
    is_page_end?: boolean;
    thematic_break_type?: 'QUARTER' | 'HIZB' | 'JUZ' | 'SAJDAH' | 'NONE';
    thematic_break?: boolean;
}

/**
 * Historical record of a completed step.
 */
export interface HistoryItem {
    date: string;
    startIdx: number;
    endIdx: number;
}

export interface TrackState {
    currentIdx: number;
    history: HistoryItem[];
    isCompleted: boolean;
    extraData: Record<string, any>;
}

/**
 * Serializable snapshot of a running plan's track states.
 *
 * Persist this (e.g. when a student pauses for weeks) and re-import it to resume
 * the plan from the REAL last position — including full history — instead of
 * re-simulating from an assumed start date. History MUST be preserved: window /
 * minor-review strategies derive their output from it.
 */
export interface PlanSnapshot {
    version: number;
    /** Map of trackId → that track's full serializable state (incl. history). */
    tracks: Record<number, TrackState>;
    /** Optional ISO date of the last generated day (informational for consumers). */
    generatedThrough?: string;
}

export interface StepResult {
    start: LocationObj;
    end: LocationObj;
    startIdx: number;
    endIdx: number;
    linesProcessed: number;
    flags?: string[];
    appliedRules?: string[];  // Epic 2: track applied rules
    snapReason?: string;      // Epic 2: reason for adjustment
    warnings?: string[];      // Epic 2: rule warnings
    pageStart?: number;       // Epic 2: start page
    pageEnd?: number;         // Epic 2: end page
}

/**
 * 🚀 NEW: Dynamic Event Structure
 * Replaces hardcoded columns with a flexible event system.
 */
export interface PlanEvent {
    trackId: number | TrackId;  // Link to the source track
    trackName: string;          // Readable name (for debugging/display)
    eventType: EventType;       // Semantic type
    data: {
        start: LocationObj;
        end: LocationObj;
        lines?: number;
        is_reset?: boolean;     // For looping tracks
    };
}

/**
 * Strictly typed day in the generated plan.
 * 🚀 UPDATED: Now uses an events array instead of fixed fields.
 */
export interface PlanDay {
    dayNum: number;
    date: Date;
    is_off: boolean;
    events: PlanEvent[]; // 👈 المرونة هنا
    /**
     * Optional Hijri (Umm al-Qura) representation of `date`.
     * Populated only when the plan is generated with `includeHijri: true`.
     * Display-only — does not affect scheduling. See HijriDateUtils.
     */
    hijriDate?: string;
}