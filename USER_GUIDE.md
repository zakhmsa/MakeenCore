# MakeenCore User Guide

This is the behavior guide for consumers of `@zakhm_sa/makeen-core`. It describes the current public library. Internal scenario files and historical planning documents are not API contracts.

## Choose an API

Use `MakeenEngine.generatePlan(...)` when your application already has track DTOs. Use `PlanBuilder` when you need planning by duration/daily amount, snapshots, multiple independent review loops, or direct access to a `TrackManager`.

## New memorization (Hifz)

Hifz moves linearly from `from` to `to` in the selected direction. It always emits complete ayahs.

### Daily capacity

`dailyLines` is a daily capacity, not a loose target. The raw lesson stops at the first whole-ayah boundary that meets the capacity. An actual lesson can exceed it only when:

1. the final indivisible ayah crosses the boundary (`AYAH_INTEGRITY`), or
2. the teacher explicitly allows a small surah-completion overage (`SURAH_COMPLETION`).

`maxAyahPerDay` is a separate hard cap. If eight short ayahs occupy only three lines, a configured eight-ayah cap stops the lesson at three lines.

Each memorization event exposes:

```ts
{
  lines: 8.5,                 // actual canonical amount
  requestedLines: 8,
  overflowLines: 0.5,
  overflowReason: 'AYAH_INTEGRITY',
  appliedRules: ['MaxLinesRule']
}
```

### Capacity-aware surah completion

```ts
surahCompletion: {
  enabled: true,
  maxOverflowLines: 2,
  mayExceedMaxAyahs: false
}
```

The engine measures the remaining portion in lines. If completing the surah would exceed the configured allowance, the remainder moves to the next memorization day. New integrations should use this object. `sequentialSurahMode` remains only as a compatibility alias.

`strictSequentialMode` prevents a raw lesson from crossing into the next surah; it does not disable the final hard limits.

## Minor review

Minor review is a moving window over completed Hifz history.

- Today's Hifz lesson is never included.
- The default is surah-bounded review.
- When Hifz actually starts a new surah, the previous-surah minor window is cleared.
- A lesson crossing a surah boundary is clipped to the active surah.
- `GRADUAL` grows from available history.
- `FIXED` targets a fixed number of completed lessons; the legacy unbounded strategy can fill missing history from pre-plan material.

### Pages versus lessons

```ts
.setSchedule({
  // ...
  surahBoundedMinorReview: true,
  minorReviewPagesCount: 5
})
.addMinorReview(5, WindowMode.GRADUAL)
```

When `minorReviewPagesCount` is set, it overrides lesson count. Five pages means a 75-line recent-history window, rounded only to keep the oldest boundary ayah whole. It never crosses the active surah boundary.

Set `surahBoundedMinorReview: false` only when you intentionally need the legacy cross-surah window.

### Window modes

`WindowMode.GRADUAL` and `WindowMode.FIXED` are both implemented public modes; they are not merely suggested teaching presets.

| Mode | Source of the window | Typical use |
|---|---|---|
| `GRADUAL` | Completed lessons before today; grows until it reaches the requested count | A student starting new memorization with no assumed earlier history |
| `FIXED` | Requests the full count from day one; the legacy cross-surah strategy may fill from material before the plan start | A student who already memorized material before this plan |

With the default surah-bounded strategy, both modes remain restricted to the active Hifz surah. Therefore `FIXED` cannot manufacture material outside that surah merely to reach the requested count.

## Major and independent review

`addMajorReview` creates a stateful looping track. It advances by its own daily amount and resets automatically when it reaches its wall or explicit end.

```ts
builder.addMajorReview(
  30,                              // daily lines
  { surah: 114, ayah: 1 },         // cycle start
  { surah: 67, ayah: 30 },         // explicit independent end
  { horizonLines: 150 }            // optional recent-window floor
);
```

- With an explicit `end`, the review is an independent cycle.
- Without an explicit `end`, a `WallConstraint` prevents it from reviewing beyond Hifz/minor-review progress.
- `horizonLines` optionally keeps it within the most recently memorized N lines.
- Add multiple major reviews to create multiple independent counters.

### Review-only plan

```ts
const days = new PlanBuilder()
  .setSchedule({
    startDate: '2026-07-18',
    daysPerWeek: 5,
    limitDays: 60,
    isReverse: true
  })
  .addMajorReview(75, { surah: 114, ayah: 1 }, { surah: 67, ayah: 30 })
  .addMajorReview(150, { surah: 78, ayah: 1 }, { surah: 67, ayah: 30 })
  .build()
  .generatePlan();
```

Always give a review-only plan `limitDays` or `endDate`; there is no Hifz completion condition to terminate an indefinite cycle.

## Scheduling

```ts
.setSchedule({
  startDate: '2026-07-18',
  daysPerWeek: 5,
  isReverse: true,
  maxAyahPerDay: 8,
  surahCompletion: { enabled: true, maxOverflowLines: 2 },
  consolidationDayInterval: 6,
  includeHijri: true
})
```

- `daysPerWeek`: working days selected by the engine's weekday policy.
- `consolidationDayInterval`: every Nth generated study day has review but no Hifz.
- `catchUpDayOfWeek`: load balancing can suppress Hifz on that weekday.
- `holidays`: exact `YYYY-MM-DD` dates emitted as off days with no events.
- `includeHijri`: adds a display-only Umm al-Qura string.

### Catch-up and consolidation are different

`catchUpDayOfWeek` is a weekday index from `0` (Sunday) through `6` (Saturday). On that weekday the manager freezes linear Hifz movement while review tracks may continue. `consolidationDayInterval` is cadence-based instead: every Nth generated study day freezes Hifz. They may coincide, but they solve different scheduling needs.

### Directional planning

- Forward: `isReverse: false`, or DTO `direction: ''FORWARD''`, traverses Al-Fatiha toward An-Nas.
- Reverse: `isReverse: true`, or DTO `direction: ''REVERSE''`, traverses An-Nas toward Al-Fatiha.
- `from` and `to` must follow the selected traversal order.
- Hifz, looping review, walls, horizons, and Quran boundary rules all use the selected directional index.

### Hijri display

`includeHijri: true` adds `hijriDate` to each generated day using `Intl` Umm al-Qura support. It is opt-in, has no package dependency, and never changes working days, holidays, plan order, or completion calculations.

## Planning modes

### By daily amount

```ts
const manager = new PlanBuilder()
  .setSchedule({ startDate: '2026-07-18', daysPerWeek: 5, maxAyahPerDay: 8 })
  .planByDailyAmount({
    from: { surah: 2, ayah: 1 },
    to: { surah: 2, ayah: 286 },
    dailyLines: 8
  })
  .stopWhenCompleted()
  .build();
```

The derived horizon partitions the canonical range using both daily lines and `maxAyahPerDay`, then accounts for consolidation days.

### By duration

```ts
const manager = new PlanBuilder()
  .setSchedule({ startDate: '2026-07-18', daysPerWeek: 5 })
  .planByDuration({
    from: { surah: 2, ayah: 1 },
    to: { surah: 2, ayah: 100 },
    durationDays: 60
  })
  .stopWhenCompleted()
  .build();
```

This mode derives the daily line amount from the requested duration. Hard ayah limits and consolidation days can reduce actual daily progress, so choose compatible constraints.

## DTO facade

All track DTOs require `type`, `priority`, `amountUnit`, and `amountValue`.

```ts
import { MakeenEngine } from '@zakhm_sa/makeen-core';

const result = MakeenEngine.generatePlan({
  name: 'Student plan',
  startDate: '2026-07-18',
  direction: 'REVERSE',
  daysPerWeek: 5,
  tracks: [
    {
      type: 'HIFZ', priority: 1, amountUnit: 'LINES', amountValue: 8,
      start: { surah: 89, ayah: 1 },
      end: { surah: 59, ayah: 11 },
      config: {
        maxAyahPerDay: 8,
        surahCompletion: { enabled: true, maxOverflowLines: 2, mayExceedMaxAyahs: false }
      }
    },
    {
      type: 'MINOR_REVIEW', priority: 2, amountUnit: 'PAGES', amountValue: 5,
      config: { mode: 'GRADUAL', surahBounded: true }
    },
    {
      type: 'MAJOR_REVIEW', priority: 3, amountUnit: 'LINES', amountValue: 30,
      start: { surah: 114, ayah: 1 },
      config: { horizonLines: 150 }
    }
  ]
});
```

The facade accepts Hifz pedagogical settings in the Hifz track's `config`. A minor-review `PAGES` amount is converted to an exact 15-line-per-page window. Hifz/major `PAGES` amounts are converted to daily lines.

## Snapshot and resume

```ts
const snapshot = manager.exportSnapshot();

// Later: rebuild the same tracks with the real resume date.
const resumed = builder.build();
resumed.importSnapshot(snapshot);
const nextDays = resumed.generatePlan();
```

Persist the full snapshot. Minor review reconstructs its window from Hifz history. Track IDs, order, ranges, and strategies must match when importing.

Snapshots are versioned. Import validates the version and track topology; it is intended for intermittent students whose real resume date differs from the original simulated calendar. The host application remains responsible for storing the serializable snapshot.

## Recommended configurations

These are starting points, not hard-coded engine presets. Teachers should adapt them to the student and should set the surah-completion allowance deliberately.

```ts
const conservative = {
  maxAyahPerDay: 5,
  surahCompletion: { enabled: true, maxOverflowLines: 1, mayExceedMaxAyahs: false },
  consolidationDayInterval: 5,
  surahBoundedMinorReview: true
};

const standard = {
  maxAyahPerDay: 10,
  surahCompletion: { enabled: true, maxOverflowLines: 2, mayExceedMaxAyahs: false },
  consolidationDayInterval: 6,
  surahBoundedMinorReview: true
};

const intensive = {
  maxAyahPerDay: 15,
  surahCompletion: { enabled: false },
  consolidationDayInterval: 0,
  surahBoundedMinorReview: true
};
```

## Integration responsibilities

MakeenCore is a deterministic library, not an HTTP server or persistence service.

- The library calculates plan days, dates, Quran ranges, rules, review state, snapshots, and validation results.
- The host application owns students, teachers, authorization, database records, activation state, share codes, notes, and HTTP controllers.
- The repository contains Excel/PDF adapters and QA exporters, but they are not exported from the npm package root as the primary public API.
- DTOs such as `GenerateFinalPlanRequestDTO` and `ExportRequestDTO` are exported transport shapes. Their presence does not mean `MakeenEngine` currently implements finalization or file-export methods.

A NestJS application can reasonably split these responsibilities into preview/generation, persistence/finalization, export, and dataset-validation services, but those controllers are application architecture, not routes supplied by this package.

## Documentation map

- `README.md` / `README.ar.md`: quick start.
- `llms.txt`: compact AI-oriented usage contract.
- `doc/planning-engine/planning-engine-api-contracts.md`: exact public shapes.
- `doc/planning-engine/pedagogical-rules-guide.md`: rule scopes and interaction.
- `doc/planning-engine/planning-modes-and-phases.md`: execution phases, scenarios, milestones, and limitations.
- `doc/planning-engine/project-status-and-qa.en.md`: detailed implementation and QA status.
- `doc/planning-engine/documentation-audit.md`: evidence for retained, internal, declared-only, and obsolete documentation claims.
- `src/infrastructure/api/contracts.ts`: authoritative DTO types in source.
