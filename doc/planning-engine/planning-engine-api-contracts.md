# MakeenCore Public API Contracts

This document describes the current npm library `@zakhm_sa/makeen-core`. It does not define HTTP endpoints, persistence, exports, controllers, or database behavior. Those belong to the consuming application.

## Package exports

The package root exports:

- `MakeenEngine` (`EngineFacade` implementation)
- `PlanBuilder`, `TrackManager`
- `QuranRepository`, `QuranRepositoryOptimized`, `QuranDataBinary`
- `TrackId`, `WindowMode`
- builder configuration types, core plan types, DTO contracts, and errors
- `DateUtils`, `HijriDateUtils`

Internal rule classes are not a supported npm-root API. Configure them through `ScheduleConfig`.

## Builder contracts

```ts
interface LocationConfig {
  surah: number;
  ayah: number;
}

interface SurahCompletionConfig {
  enabled: boolean;
  maxOverflowLines?: number;       // default when enabled: 2
  mayExceedMaxAyahs?: boolean;     // default: false
}

interface ScheduleConfig {
  startDate: string;
  daysPerWeek: number;
  limitDays?: number;
  endDate?: string;
  isReverse?: boolean;
  catchUpDayOfWeek?: number;
  holidays?: string[];

  maxAyahPerDay?: number;          // engine default: 10
  surahCompletion?: SurahCompletionConfig;
  sequentialSurahMode?: boolean;   // legacy compatibility alias
  strictSequentialMode?: boolean;
  consolidationDayInterval?: number;

  surahBoundedMinorReview?: boolean; // default: true
  minorReviewPagesCount?: number;    // 15 lines per page
  includeHijri?: boolean;
}

interface CompletionByDailyAmountConfig {
  from: LocationConfig;
  to: LocationConfig;
  dailyLines: number;
}

interface CompletionByDurationConfig {
  from: LocationConfig;
  to: LocationConfig;
  durationDays: number;
}
```

### PlanBuilder methods

```ts
new PlanBuilder()
  .setSchedule(schedule)
  .planByDailyAmount({ from, to, dailyLines })
  // OR .planByDuration({ from, to, durationDays })
  // OR .addHifz(amountLines, start, end?)
  .addMinorReview(lessonCount, WindowMode.GRADUAL)
  .addMajorReview(amountLines, start?, end?, { horizonLines }?)
  .stopWhenCompleted()
  .build(); // TrackManager
```

Call `addMajorReview` multiple times for multiple independent counters. An explicit `end` makes a review loop independent of Hifz. Without an explicit end, wall constraints bind it to memorized material.

## Plan output

```ts
interface PlanDay {
  dayNum: number;
  date: Date;
  is_off: boolean;
  hijriDate?: string;
  events: PlanEvent[];
}

interface PlanEvent {
  trackId: number;
  trackName: string;
  eventType: EventType;
  data: {
    start: LocationObj;
    end: LocationObj;
    lines?: number;
    requestedLines?: number;
    overflowLines?: number;
    overflowReason?: 'AYAH_INTEGRITY' | 'SURAH_COMPLETION';
    appliedRules?: string[];
    is_reset?: boolean;
  };
}
```

`lines` is actual canonical mushaf load. `requestedLines` is present for Hifz. An overflow is valid only for the final whole ayah or configured surah completion.

## Facade request DTO

```ts
type PlanDirection = 'FORWARD' | 'REVERSE';
type TrackType = 'HIFZ' | 'MINOR_REVIEW' | 'MAJOR_REVIEW' | 'STABILIZATION' | 'CUSTOM';

interface CreatePlanPreviewRequestDTO {
  name: string;
  startDate: string;
  direction: PlanDirection;
  daysPerWeek: number;
  catchUpDay?: number;
  holidays?: string[];
  includeHijri?: boolean;
  tracks: TrackConfigDTO[];
}

interface TrackConfigDTO {
  type: TrackType;
  priority: number;
  amountUnit: 'LINES' | 'PAGES' | 'LESSONS' | 'CUSTOM';
  amountValue: number;
  start?: LocationDTO;
  end?: LocationDTO;
  config?: Record<string, unknown>;
}
```

`HIFZ` requires `start`. `STABILIZATION` and `CUSTOM` are contract values but are not executed by the current facade.

### Facade configuration mapping

Hifz track `config` supports:

```ts
{
  maxAyahPerDay?: number;
  sequentialSurahMode?: boolean; // legacy
  strictSequentialMode?: boolean;
  surahCompletion?: {
    enabled: boolean;
    maxOverflowLines?: number;
    mayExceedMaxAyahs?: boolean;
  };
  consolidationDayInterval?: number;
}
```

Minor-review track `config` supports:

```ts
{
  mode?: 'GRADUAL' | 'FIXED';
  surahBounded?: boolean; // default true
  pagesCount?: number;
}
```

If the minor-review track uses `amountUnit: 'PAGES'`, `amountValue` becomes its page window and overrides `config.pagesCount`.

Major-review track `config` supports:

```ts
{ horizonLines?: number }
```

`PAGES` is converted at 15 lines per page for Hifz and major review.

### Complete facade example

```ts
import { MakeenEngine } from '@zakhm_sa/makeen-core';

const response = MakeenEngine.generatePlan({
  name: 'Gold plan',
  startDate: '2026-07-18',
  direction: 'REVERSE',
  daysPerWeek: 5,
  includeHijri: true,
  tracks: [
    {
      type: 'HIFZ',
      priority: 1,
      amountUnit: 'LINES',
      amountValue: 8,
      start: { surah: 89, ayah: 1 },
      end: { surah: 59, ayah: 11 },
      config: {
        maxAyahPerDay: 8,
        surahCompletion: {
          enabled: true,
          maxOverflowLines: 2,
          mayExceedMaxAyahs: false
        },
        consolidationDayInterval: 6
      }
    },
    {
      type: 'MINOR_REVIEW',
      priority: 2,
      amountUnit: 'PAGES',
      amountValue: 5,
      config: { mode: 'GRADUAL', surahBounded: true }
    },
    {
      type: 'MAJOR_REVIEW',
      priority: 3,
      amountUnit: 'LINES',
      amountValue: 30,
      start: { surah: 114, ayah: 1 },
      config: { horizonLines: 150 }
    }
  ]
});
```

## Facade response DTO

```ts
interface CreatePlanPreviewResponseDTO {
  success: boolean;
  data: {
    estimatedCompletionDate: string;
    totalDays: number;
    plan: PlanDayDTO[];
  };
}

interface PlanEventDTO {
  trackType: TrackType;
  eventType: EventType;
  start: LocationDTO;
  end: LocationDTO;
  linesCount: number;
  appliedRules?: string[];
  requestedLines?: number;
  overflowLines?: number;
  overflowReason?: 'AYAH_INTEGRITY' | 'SURAH_COMPLETION';
}
```

## Rule pipeline contract

Rules are scoped. Memorization-only rules never run on review events.

```text
AyahIntegrityRule       priority 10  all tracks
SurahCompletionRule     priority 18  memorization only
SurahSnapRule           priority 20  memorization only
PageAlignmentRule       priority 30  memorization only
ThematicHaltingRule     priority 40  memorization only
BalanceCorrectionRule   priority 50  memorization only
MaxAyahRule             priority 55  memorization hard cap
MaxLinesRule            priority 60  memorization final line boundary
```

The pipeline does not stop at a surah end. Hard rules always execute.

## Snapshot contract

`TrackManager.exportSnapshot()` returns versioned track state including full history. Rebuild identical tracks before `importSnapshot(snapshot)`. The library owns no persistence.

## Errors and validation

- Locations must exist in the canonical dataset.
- The selected `from`/`to` order must match direction.
- Daily lines, duration, and track amounts must be positive.
- `daysPerWeek` must be 1–7 in planning modes.
- The facade returns `success: false` for caught execution errors; the builder can throw typed `PlanError` instances.

## Facade operations

The root export `MakeenEngine` currently implements exactly three static operations:

| Operation | Input | Output | Notes |
|---|---|---|---|
| `generatePlan` | `CreatePlanPreviewRequestDTO` | `CreatePlanPreviewResponseDTO` | Executes the complete plan and returns daily events. |
| `estimateTimeline` | `EstimateCompletionRequestDTO` | `EstimateCompletionResponseDTO` | Currently delegates to full generation, then returns date/day totals. It is not yet a lightweight estimator. |
| `validateDataset` | no argument | `DatasetValidationResponseDTO` | Checks forward/reverse indexes, symmetry, and the 6,236-ayah boundary count. |

There is no `generateFinalPlan`, persistence, activation, sharing, or file-export method on `MakeenEngine`.

## Exported transport contracts without an executor

The package exports the following shapes because host applications may use them at their own application boundary:

```ts
interface GenerateFinalPlanRequestDTO extends CreatePlanPreviewRequestDTO {
  presetId?: string;
}

interface GenerateFinalPlanResponseDTO {
  success: boolean;
  data: {
    planId: string;
    status: ''DRAFT'' | ''ACTIVE'' | ''PAUSED'' | ''COMPLETED'' | ''ARCHIVED'';
    shareCode: string | null;
  };
}

interface ExportRequestDTO {
  planId: string;
  format: ''excel'' | ''pdf'';
  includeTeachersNotes?: boolean;
}
```

These are declared contracts, not evidence that MakeenCore owns a database, HTTP endpoint, finalization workflow, or downloadable-file response. `GeneratePreview*` and `FinalizePlan*` are backward-compatible type aliases.

## Other public root exports

### Quran repositories

- `QuranRepository`: canonical singleton queries used by the engine.
- `QuranRepositoryOptimized`: optimized repository implementation.
- `QuranDataBinary`: bundled Quran data access.

Use repository methods for valid location/index conversion and line calculations; do not recreate Quran line arithmetic from exported plan averages.

### Date utilities

- `DateUtils`: Gregorian scheduling helpers.
- `HijriDateUtils`: Umm al-Qura display formatting.

Hijri values are presentation metadata and never participate in scheduling decisions.

### TrackManager

`PlanBuilder.build()` returns a `TrackManager`. Important public operations are:

```ts
manager.generatePlan();
manager.exportSnapshot();
manager.importSnapshot(snapshot);
manager.getTrack(trackId);
manager.hasTrack(trackId);
```

Direct manager construction and track manipulation are advanced APIs. Prefer `PlanBuilder` so dependency order, walls, and strategy selection are assembled consistently.

### Enums and errors

- `TrackId`: built-in Hifz/minor/major identifiers.
- `WindowMode`: `GRADUAL` or `FIXED`.
- `PlanError`, `PlanErrorCode`, `Severity`: typed builder/domain failures.

## DTO value boundaries

Some union values are broader than the current facade implementation:

- `TrackType` declares `STABILIZATION` and `CUSTOM`, but `generatePlan` currently ignores unsupported track types after warning.
- `DayType` declares `CATCH_UP`, but facade mapping currently emits `WORKING` or `OFF`; catch-up behavior is observable as suppressed Hifz rather than a mapped catch-up day value.
- `EventType` declares `BREAK` and `CATCH_UP`, while current facade event mapping emits memorization or review events.
- `priority` is required in each `TrackConfigDTO`, but facade composition uses track type order; callers should still provide semantic priorities `1`, `2`, and `3`.

Consumers must not infer implemented runtime branches solely from the breadth of these exported unions.

## Minor-review mode contract

```ts
builder.addMinorReview(5, WindowMode.GRADUAL);
builder.addMinorReview(5, WindowMode.FIXED);
```

- `GRADUAL` grows from completed history and excludes today.
- `FIXED` targets the requested lesson count from day one.
- `ScheduleConfig.minorReviewPagesCount` overrides the lesson count with `pages * 15` lines.
- `surahBoundedMinorReview` defaults to `true`; with this strategy both modes remain inside the active Hifz surah.

## Major-review constraint contract

`addMajorReview(amount, start?, end?, { horizonLines? })` composes several behaviors:

- An explicit `end` forms an independent cycle.
- Without an explicit `end`, `WallConstraint` supplies the upper boundary from dependent progress.
- `horizonLines` supplies a moving lower boundary behind the Hifz front.
- A loop reaching its boundary records reset state and resumes from its configured origin.

Each call creates a distinct track ID and independent counter.

## Host application and NestJS boundary

A host may expose routes such as preview, finalize, export, or dataset validation, but MakeenCore does not register those routes. A typical host split is:

- preview service: calls `MakeenEngine.generatePlan`,
- timeline service: calls `MakeenEngine.estimateTimeline`,
- dataset service: calls `MakeenEngine.validateDataset`,
- persistence/finalization service: stores plans and implements state transitions,
- export service: maps plan data into the host''s chosen Excel/PDF response.

This preserves the useful integration architecture from earlier documents without falsely presenting proposed URLs as library endpoints.
