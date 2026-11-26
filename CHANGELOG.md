# Changelog

All notable changes to `@zakhm_sa/makeen-core` are documented in this file.

## [1.3.0] - 2026-11-26

### Added
- **First-class `AYAHS` daily amount unit for `HIFZ`:**
  - **DTO (`MakeenEngine.generatePlan`):** `TrackConfigDTO.amountUnit` now supports `'AYAHS'` for `HIFZ` tracks (`amountUnit: 'AYAHS', amountValue: N`). Rejects `'AYAHS'` on review tracks (`MINOR_REVIEW` / `MAJOR_REVIEW`) with a typed `PlanError(INVALID_INPUT)`.
  - **Builder (`PlanBuilder`):**
    - `addHifz(amount, start, end?, { unit?: 'LINES' | 'AYAHS' })` and convenience alias `addHifzByAyahs(ayahsPerDay, start, end?)`.
    - `planByDailyAmount({ from, to, dailyLines?, dailyAyahs?, unit? })` and convenience alias `planByDailyAyahs({ from, to, dailyAyahs })`.
    - `planByDuration({ from, to, durationDays, unit?: 'LINES' | 'AYAHS' })` derives `dailyAyahs = ceil(totalAyahsInRange / effectiveWorkingDays)` accounting for holidays, consolidation days, and catch-up days, and exposes the derived amount via `builder.getDerivedDailyAmount()` / `manager.getDerivedDailyAmount()`.
  - **Surah completion in `AYAHS` mode:** `SurahCompletionConfig.maxOverflowAyahs?: number` (default `2`). Completes the active surah on the same day if the remaining ayahs are `<= maxOverflowAyahs` and marks `overflowReason: 'SURAH_COMPLETION'`. (`maxOverflowLines` is ignored in `AYAHS` mode).
  - **Optional line guard (`ScheduleConfig.maxLinesPerDay`):** Hard line cap in `AYAHS` mode so `N` long ayahs cannot produce an oversized lesson; stops at the last whole ayah that fits (minimum 1 ayah — never emits an empty lesson) and records `'LINE_GUARD'` in `appliedRules`.
  - **Output fields (`PlanEvent.data` & `PlanEventDTO`):**
    - `ayahsCount: number` on every memorization and review event (inclusive count of whole ayahs in traversal direction).
    - `requestedAyahs?: number` and `overflowAyahs?: number` on `HIFZ` events in `AYAHS` mode.
  - **`QuranRepository` / `QuranRepositoryOptimized` helpers:** `countAyahs(start, end, direction?)` and `advanceByAyahs(location, n, direction?, bound?)`.

### Guaranteed Backwards Compatibility
- Zero behavior or output coordinate changes for existing `LINES` and `PAGES` plans.
- Minor review (both lesson-count and `minorReviewPagesCount` modes) and major review operate over canonical index ranges and remain 100% compatible with `AYAHS` Hifz tracks.
