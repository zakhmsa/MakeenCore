# Project Status and QA Coverage

Current status: the TypeScript build passes, 73/73 automated tests pass, and 10/10 scenario validations pass.

## Implemented behavior

- whole-ayah Hifz with canonical line coordinates,
- final hard daily line and ayah boundaries,
- capacity-aware surah completion with explainable overflow,
- rule scopes separating memorization from review,
- forward and reverse planning,
- surah-bounded minor review with exact 15-line pages,
- automatic minor-review reset on real Hifz surah transition,
- dependent wall-bounded review,
- multiple independent looping review counters,
- consolidation, holidays, catch-up/load balancing,
- snapshots with full history,
- optional Hijri display dates,
- DTO facade and fluent builder APIs.

## Acceptance coverage

- long surah / forward,
- short surahs / reverse,
- mixed surah boundaries,
- exact and fractional line boundaries,
- long boundary ayahs,
- surah-completion allowance and max-ayah interaction,
- minor-review reset and page windows,
- independent review reset,
- review-only plans,
- duration and daily-amount modes,
- snapshot/resume and dataset integrity.

## Known public API boundaries

- Persistence and HTTP endpoints belong to the host application.
- `STABILIZATION` and `CUSTOM` are DTO contract values but are not executed by the current facade.
- Review-only plans need a finite `limitDays` or `endDate`.
- Internal rule classes are not exported as supported npm-root customization APIs.

Use `llms.txt`, `USER_GUIDE.md`, and `planning-engine-api-contracts.md` as consumer sources of truth.

## Completed work in detail

### Core foundation

The repository implements a directional Quran index, linear/looping/window tracks, constraint management, load balancing, and deterministic daily event generation. Both directions, explicit range boundaries, and stop-on-Hifz-completion are supported.

### Pedagogical pipeline

The engine includes ayah integrity, surah completion/snap, page alignment, thematic halting, balance correction, maximum ayah, and maximum line rules. Rules now have track scopes, and reaching a surah end no longer skips final hard rules.

### Planning modes

- `planByDuration` derives a nominal daily amount from duration and range.
- `planByDailyAmount` partitions the canonical range using both line and ayah limits and accounts for consolidation slots.
- Direct `addHifz` lets the host own the plan horizon.
- Multiple `addMajorReview` calls create independent counters.

### QA and human review

Ten executable reference scenarios support single/all runs, console inspection, and Excel QA output. Excel/PDF adapters are implemented in the repository but are not a stable file-export API from the npm root.

### Resume and calendars

Versioned snapshots preserve full track history for minor review reconstruction. Hijri dates are opt-in presentation metadata and do not affect scheduling.

## Actual test scope

Unit and integration suites cover Quran repositories/data, rule order, constraints, DTO facade behavior, errors, Hijri formatting, snapshots, multi-track review, moving horizons, and daily capacity.

The latest acceptance additions cover long-surah forward movement, short-surah reverse movement, mixed surah boundaries, a single long boundary ayah, exact/fractional line sums, accepted/rejected surah completion, max-ayah interaction, minor-review reset and five-page windows, catch-up/holidays, and independent review resets.

## Reference scenarios

The ten scenarios are beginner, intermediate, advanced, completion-before-limit, consolidation audit, rule-pipeline stress, daily-amount audit, review-only reset stress, five-ajza review-only, and quarter-page. They are executable QA presets, not a final catalogue of teacher/student profiles.

## Public, internal, and declared-only status

- Public root API: builder, manager, facade, repositories, date utilities, and exported types/errors.
- Implemented internal/tooling: rules, strategies, constraints, scenario launcher/validator, and export adapters.
- Declared without a facade executor: final-plan and export DTOs.
- Historical/proposed: HTTP routes, persistence, sharing, and database workflows in product documents; a host application owns them.

## Transitional limitations

1. Minor review depends on Hifz history, so review-only composition uses independent looping review tracks rather than a dedicated near-review-only type.
2. `planByDuration` derives nominal load; restrictive ayah caps or consolidation cadence may make the requested real-world duration incompatible.
3. `estimateTimeline` currently performs full generation.
4. Some DTO union members are broader than current facade execution/output mappings.
5. Age, ability, fatigue, and other student-specific named profiles are host concerns today.

## Next improvement areas

- Explicit termination metadata: completed range, day limit, end date, or no progress.
- Structured JSON validator output and workload/overflow distributions.
- A dedicated near-review strategy for review-only use if pedagogically distinct from major looping review.
- Lightweight constraint-aware timeline estimation.
- Either implement or narrow declared DTO branches such as `CATCH_UP` and `STABILIZATION`.

## Contributor note

A class present under `src` is implemented repository code, but it is not automatically a stable npm-root API. An exported DTO is a usable type, but does not prove that a matching operation exists. `documentation-audit.md` records this distinction so correct detail is not removed again during documentation cleanup.
