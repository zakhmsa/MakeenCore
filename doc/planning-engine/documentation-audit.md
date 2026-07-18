# Documentation Audit

This audit records how earlier documentation details map to the current repository. It exists to prevent a future cleanup from treating “not exported from the package root” as “not implemented anywhere.”

## Classification rules

- **Implemented and public:** exported from `src/index.ts`; document as supported npm usage.
- **Implemented but internal/tooling:** present in the repository but not exported as a stable root API; preserve the detail and label its boundary.
- **Declared contract only:** an exported TypeScript DTO exists but no matching facade operation is implemented; document the shape without claiming execution.
- **Historical or proposed:** preserve product intent in historical documents and label it explicitly.
- **Obsolete claim:** contradicts the current code and tests; replace it and explain the compatibility path when relevant.

## Audited details

| Detail from the previous documentation | Classification | Evidence / current interpretation |
|---|---|---|
| Minor review `GRADUAL` and `FIXED` modes | Implemented and public | `WindowMode` is exported and both modes are handled by `WindowStrategy`; surah-bounded behavior changes the available history. |
| `WallConstraint` for dependent review | Implemented | Constructed by `HifzSystem`; it prevents review from overtaking its dependency. |
| Major-review `horizonLines` | Implemented and public through `PlanBuilder`/DTO config | Adds a sliding floor using `HorizonConstraint`. |
| Snapshot and resume | Implemented and public | `TrackManager.exportSnapshot()` and `importSnapshot()` are tested. |
| Weekly catch-up day | Implemented | `catchUpDayOfWeek` suppresses linear Hifz while review can continue. |
| Hijri display | Implemented and public | `HijriDateUtils` is exported; `includeHijri` is display-only. |
| Scenario launcher and Excel QA output | Implemented tooling | `src/main.ts`, `src/scenarios`, package scripts, and `PlanExporter` remain repository tooling. |
| Excel/PDF adapters | Implemented but internal | Adapters exist under infrastructure but are not root npm exports. |
| `GenerateFinalPlan*` and `ExportRequestDTO` | Declared contract only | Types are exported; `MakeenEngine` has no finalization or export operation. |
| HTTP endpoints in the old API document | Historical/proposed | No controller or HTTP server exists in this package. Route examples belong to a host application. |
| Rule-level custom engine imports from package root | Obsolete public-API claim | Rule classes exist internally but are not exported by `src/index.ts`. Configure the built-in pipeline through `ScheduleConfig`. |
| `sequentialSurahMode` defaulting on and freely completing a surah | Obsolete behavior | It is a legacy alias; current completion is capacity-aware and hard line/ayah rules still run. |
| `maxAyahPerDay` as a contextual soft limit | Obsolete behavior | It is now a hard Hifz cap unless `surahCompletion.mayExceedMaxAyahs` is explicitly true. |
| First-class review-only planning | Supported composition | Multiple explicit major-review loops work independently; there is no separate near-review-only track type. |
| Pedagogical presets | Guidance, not runtime objects | Useful examples should remain, clearly labeled as teacher-adjustable suggestions. |

## Preservation policy

Documentation may be shortened only after each removed claim is placed in one of the classifications above. Correct implementation detail should be moved to the appropriate guide, not silently deleted. Historical product reasoning should remain in the PRD/epic with a status banner. Incorrect examples should be corrected in place or retained as explicitly deprecated migration examples.
