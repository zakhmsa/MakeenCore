export type PlanDirection = 'FORWARD' | 'REVERSE';
export type TrackType = 'HIFZ' | 'MINOR_REVIEW' | 'MAJOR_REVIEW' | 'STABILIZATION' | 'CUSTOM';
export type DayType = 'WORKING' | 'OFF' | 'CATCH_UP';
export type EventType = 'MEMORIZATION' | 'REVIEW' | 'BREAK' | 'CATCH_UP';

export interface CreatePlanPreviewRequestDTO {
    name: string;
    startDate: string;
    direction: PlanDirection;
    daysPerWeek: number;
    catchUpDay?: number;
    holidays?: string[];
    tracks: TrackConfigDTO[];
    /** Opt-in: include a Hijri (Umm al-Qura) date on each returned day. */
    includeHijri?: boolean;
}

export interface TrackConfigDTO {
    type: TrackType;
    priority: number;
    amountUnit: 'LINES' | 'PAGES' | 'AYAHS' | 'LESSONS' | 'CUSTOM';
    amountValue: number;
    start?: LocationDTO;
    end?: LocationDTO;
    config?: Record<string, any>;
}

export interface LocationDTO {
    surah: number;
    ayah: number;
}

export interface PlanEventDTO {
    trackType: TrackType;
    eventType: EventType;
    start: LocationDTO;
    end: LocationDTO;
    linesCount: number;
    /** Count of whole ayahs from start to end inclusive. */
    ayahsCount?: number;
    appliedRules?: string[];
    requestedLines?: number;
    overflowLines?: number;
    /** Configured daily ayah target (present when Hifz uses amountUnit: 'AYAHS'). */
    requestedAyahs?: number;
    /** Extra ayahs above requestedAyahs (present when Hifz uses amountUnit: 'AYAHS'). */
    overflowAyahs?: number;
    overflowReason?: 'AYAH_INTEGRITY' | 'SURAH_COMPLETION';
}

export interface PlanDayDTO {
    dayNumber: number;
    date: string;
    /** Hijri (Umm al-Qura) date string, present only when includeHijri was requested. */
    hijriDate?: string;
    dayType: DayType;
    totalLoad: number;
    events: PlanEventDTO[];
}

export interface CreatePlanPreviewResponseDTO {
    success: boolean;
    data: {
        estimatedCompletionDate: string;
        totalDays: number;
        plan: PlanDayDTO[];
    };
}

export interface GenerateFinalPlanRequestDTO extends CreatePlanPreviewRequestDTO {
    presetId?: string;
}

export interface GenerateFinalPlanResponseDTO {
    success: boolean;
    data: {
        planId: string;
        status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
        shareCode: string | null;
    };
}

export interface EstimateCompletionRequestDTO {
    startDate: string;
    daysPerWeek: number;
    direction: PlanDirection;
    tracks: TrackConfigDTO[];
}

export interface EstimateCompletionResponseDTO {
    success: boolean;
    data: {
        estimatedCompletionDate: string;
        estimatedDays: number;
    };
}

export interface ExportRequestDTO {
    planId: string;
    format: 'excel' | 'pdf';
    includeTeachersNotes?: boolean;
}

export interface DatasetValidationDTO {
    datasetVersion?: string;
}

export interface DatasetValidationResponseDTO {
    success: boolean;
    data: {
        valid: boolean;
        checks: Array<{ name: string; passed: boolean }>;
    };
}

// Backward-compatible aliases for older naming in existing integrations.
export type GeneratePreviewRequestDTO = CreatePlanPreviewRequestDTO;
export type GeneratePreviewResponseDTO = CreatePlanPreviewResponseDTO;
export type FinalizePlanRequestDTO = GenerateFinalPlanRequestDTO;
export type FinalizePlanResponseDTO = GenerateFinalPlanResponseDTO;
