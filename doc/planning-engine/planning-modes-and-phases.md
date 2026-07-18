# Planning Modes and Execution Phases

This is a current architecture note. For consumer-facing contracts use `USER_GUIDE.md`, `llms.txt`, and `planning-engine-api-contracts.md`.

## Execution phases

1. `PlanBuilder` validates and records track requests.
2. Requests are sorted Hifz → minor review → major/independent review.
3. Movement strategies select raw whole-ayah steps.
4. The scoped rule pipeline adjusts memorization boundaries.
5. Hard `MaxAyahRule` and `MaxLinesRule` run last.
6. The step is committed before dependent review tracks calculate.
7. The manager emits `PlanDay.events` and advances to the next working day.

Review events do not run memorization alignment rules.

## Plan by daily amount

```ts
builder.planByDailyAmount({ from, to, dailyLines: 8 });
```

The builder partitions the exact canonical range using both the line capacity and `maxAyahPerDay`. It then adds generated study-day slots required by `consolidationDayInterval`. `TrackManager.limitDays` counts generated study days; skipped weekdays are not counted as plan entries.

## Plan by duration

```ts
builder.planByDuration({ from, to, durationDays: 90 });
```

The builder derives a daily line amount from total canonical lines and available study days. Because hard ayah caps and consolidation days can reduce actual progress, callers must choose compatible duration constraints.

## Direct Hifz mode

```ts
builder.addHifz(8, from, to);
```

Use this when the host owns the plan horizon through `limitDays`, `endDate`, or an explicit completion stop.

## Hifz ecosystem

- Hifz: linear whole-ayah movement.
- Minor review: recent completed Hifz history, surah-bounded by default.
- Major review: stateful looping review with wall and optional horizon.
- Multiple major-review calls create independent counters.

## Review-only mode

Review-only plans are first-class through multiple explicit independent review cycles:

```ts
builder
  .setSchedule({ startDate, daysPerWeek: 5, limitDays: 60, isReverse: true })
  .addMajorReview(75, startA, endA)
  .addMajorReview(150, startB, endB);
```

An explicit range lets each counter reset independently. A review-only plan must provide `limitDays` or `endDate` because there is no Hifz completion event.

## Consolidation, holidays, and catch-up

- Consolidation suppresses Hifz every Nth generated study day.
- Holidays emit an off day with no events.
- A zero load-balancing allowance suppresses the track entirely.
- Review tracks can continue when Hifz is suppressed.

## Current acceptance status

- TypeScript build passes.
- 73 automated tests pass.
- 10 scenario validations pass.
- Coverage includes long, short, mixed-boundary, forward, reverse, minor-review, independent-review, and snapshot cases.

## Reference scenario catalogue

The scenarios are executable QA presets, not the complete teacher-facing product catalogue.

| Key | Purpose |
|---|---|
| `beginner` | 30-day duration-driven plan with strict surah continuity and review reset coverage. |
| `intermediate` | 90-day duration-driven plan with balanced review and Hifz completion. |
| `advanced` | Stronger fixed daily amount with a derived completion horizon. |
| `completion-before-limit` | Proves `stopWhenCompleted()` can end before a configured limit. |
| `consolidation-audit` | Checks periodic review-only days and continued review activity. |
| `rule-pipeline-stress` | Exercises rule ordering and preserves the hard ayah cap. |
| `daily-amount-audit` | Audits the official daily-amount mode and its derived duration. |
| `review-only-reset-stress` | Exercises resets for two independent review loops without Hifz. |
| `review-only` | Models two review counters for a student paused after five ajza. |
| `quarter-page` | Verifies very small page-derived daily Hifz amounts. |

Run them with `npm run start:<key>`, add `:excel` where a script exists, use `npm run start:all`, or run assertions with `npm run validate:scenarios`.

## QA tooling and expected output

The repository retains a command-line scenario launcher with:

- `--list` to enumerate scenarios,
- `--scenario=<key>` to run one,
- `--all` to run all,
- `--excel` to produce a human-auditable workbook,
- console timing, notes, day/event output, and loop reset markers.

Excel files use names such as `QuranPlan_<scenario>_<date>.xlsx`. These tools are for repository QA; they are not the root npm API.

## Completed implementation milestones

1. Core tracks, movement strategies, constraints, directional Quran repository, and deterministic scheduling.
2. Ordered pedagogical rule pipeline with per-track scopes and final hard Hifz limits.
3. Official duration and daily-amount builder modes.
4. Multi-scenario CLI with Windows-friendly package scripts.
5. Console and Excel human-review output for multiple review tracks.
6. Scenario validator covering all ten reference scenarios.
7. Snapshot/resume and Hijri display support.
8. Capacity-aware surah completion, surah-bounded minor review, holidays, and catch-up propagation.

## Official, internal, and declared-only surfaces

### Official npm surface

- `PlanBuilder`, `TrackManager`, `MakeenEngine`, repositories, date utilities, exported enums/types/errors.
- Duration/daily-amount planning, Hifz ecosystem composition, independent review loops, snapshots, and dataset validation.

### Implemented repository tooling

- Scenario definitions and launcher.
- Excel/PDF adapters and QA export utilities.
- Internal rule classes, strategies, constraints, and scenario validator.

These are real code but are not all stable root exports.

### Declared-only application contracts

Finalization and export DTOs exist for host integrations, but the library has no persistence/finalization or file-export facade operation. Earlier HTTP route examples were application proposals, not implemented package endpoints.

## Current limitations and next milestones

1. Minor review requires Hifz history; review-only plans therefore compose two or more looping review tracks rather than a dedicated near-review-only strategy.
2. `planByDuration` derives a daily amount from nominal study-day availability; incompatible ayah caps or consolidation settings can prevent the requested real-world finish date.
3. Facade DTO unions include values such as `STABILIZATION`, `CUSTOM`, and `CATCH_UP` that are not all mapped to executable/output branches.
4. `estimateTimeline` currently performs full generation; a lightweight estimator remains future work.
5. Student-specific ability/fatigue profiles and named pedagogical presets are host concerns today.
6. Termination metadata can be richer: completed range, day limit, end date, and no-progress conditions should eventually be explicit result fields.
7. Scenario validation can later emit structured JSON and workload distributions in addition to pass/fail assertions.

## Design principle

Scenarios describe and verify use cases; `PlanBuilder` and `MakeenEngine` encode reusable planning behavior. Historical product documents preserve intent, while consumer contracts describe only current executable or explicitly declared surfaces.
