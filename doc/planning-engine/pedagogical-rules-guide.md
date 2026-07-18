# MakeenCore Pedagogical Rules Guide

This guide explains the current rule semantics and which track each rule may affect.

## Rule categories

### Hard invariants

Hard invariants always run and cannot be bypassed by page, thematic, or surah preferences.

- Ayah integrity: no memorization or review boundary splits an ayah.
- `MaxAyahRule`: optional/default maximum number of new ayahs per Hifz lesson.
- `MaxLinesRule`: final Hifz boundary selected from the configured daily line capacity.
- Range/direction safety: movement remains inside the configured traversal range.
- Review wall: dependent review cannot overtake memorized material.

### Soft preferences

Soft rules can improve stopping positions but cannot enlarge a lesson past the final permitted boundary.

- Capacity-aware surah completion.
- Surah-end snapping.
- Page-end alignment.
- Thematic stopping.
- Balance correction.

These soft alignment rules apply to memorization only. Review strategies preserve their own lesson/window/cycle boundaries.

## Exact rule order and scope

```text
Priority 10  AyahIntegrityRule       scope: all
Priority 18  SurahCompletionRule     scope: memorization
Priority 20  SurahSnapRule           scope: memorization
Priority 30  PageAlignmentRule       scope: memorization
Priority 40  ThematicHaltingRule     scope: memorization
Priority 50  BalanceCorrectionRule   scope: memorization
Priority 55  MaxAyahRule             scope: memorization, hard
Priority 60  MaxLinesRule            scope: memorization, hard/final
```

The rule engine does not stop when `approvedEnd.is_end` is true. Surah ends still pass through every remaining hard rule.

## Daily Hifz capacity

Given `dailyLines: 8`, the movement strategy selects the first whole-ayah boundary that reaches eight canonical lines. This produces three cases:

### Under capacity

An independent hard limit can stop first. Example: `maxAyahPerDay: 8` may stop at 3 lines when the first eight ayahs are short.

### At capacity

The whole-ayah boundary is exactly eight lines. Floating-point prefix sums are normalized to two-decimal plan precision so an unnecessary ayah is not added.

### Whole-ayah overflow

If the lesson is 7.5 lines before the last ayah and 8.5 after it, the engine emits 8.5 lines with:

```ts
{
  requestedLines: 8,
  overflowLines: 0.5,
  overflowReason: 'AYAH_INTEGRITY'
}
```

Removing the final ayah would fall below capacity. This is the only automatic line overflow.

## Surah completion

Surah completion is useful but optional. It is measured in lines, never a count such as “five remaining ayahs.”

```ts
surahCompletion: {
  enabled: true,
  maxOverflowLines: 2,
  mayExceedMaxAyahs: false
}
```

Example with an eight-line capacity:

| Raw lesson | Full surah ending | Allowance | Result |
|---:|---:|---:|---|
| 7.5 | 8.0 | 2 | Complete inside capacity |
| 8.0 | 8.5 | 2 | Complete; report 0.5 overflow |
| 8.0 | 10.0 | 2 | Complete; report 2 overflow |
| 8.0 | 10.5 | 2 | Defer remainder to next Hifz day |

`mayExceedMaxAyahs: false` means `MaxAyahRule` can still truncate a proposed surah completion. Set it true only when the teacher intentionally allows both exceptions.

Legacy `sequentialSurahMode: true` enables surah completion with the default line allowance. New code should use the structured object.

## Strict sequential mode

`strictSequentialMode: true` prevents a raw lesson from starting the next surah in the same event. It stops at the current surah end, then starts the next surah on the next Hifz day. It does not suspend hard caps or force a large overage.

## Minor-review rules

Minor review and Hifz use different rules.

### Review wall

The wall answers: “Has this material been memorized?” A dependent review track cannot move beyond the Hifz/minor-review front.

### Surah-bounded minor review

This answers a different question: “Does recent review belong to the surah currently being memorized?” Material can be fully memorized and still be excluded after Hifz starts a new surah.

Current default behavior:

1. Read today's actual Hifz end to determine the active surah.
2. Exclude today's lesson from review.
3. Intersect prior Hifz history with the active surah.
4. Clear prior-surah content when Hifz begins the new surah.
5. Clip a cross-surah Hifz lesson at the active surah boundary.

Set `surahBoundedMinorReview: false` only for legacy cross-surah recent review.

### Minor-review amount

- Without `minorReviewPagesCount`, the window uses completed lesson count.
- With `minorReviewPagesCount`, `N` pages means `N * 15` canonical lines.
- The oldest included ayah stays whole.
- The window never crosses the active surah boundary.

## Major and independent review

Major review uses `LoopingStrategy`, not memorization alignment rules.

- Each track has an independent pointer and reset state.
- An explicit end is an independent cycle boundary.
- Without an explicit end, a wall binds it to memorized progress.
- On reaching the wall/end, the event is flagged `reset`; the next cycle begins at the configured start.
- `horizonLines` adds a sliding floor so only recent memorized material remains in the cycle.

Multiple calls to `addMajorReview` create multiple independent review counters, including review-only plans.

## Consolidation and catch-up

These are schedule-level behaviors, not Quran boundary rules.

- `consolidationDayInterval: N`: every Nth generated study day suppresses Hifz while review continues.
- A zero load-balancer allowance suppresses a track completely; it must not emit a one-ayah event.
- Holidays produce off days with no events.

## Explainability fields

Hifz events expose the configured amount, actual amount, and any exception:

```ts
event.data = {
  start,
  end,
  lines,
  requestedLines,
  overflowLines,
  overflowReason,
  appliedRules
};
```

Consumers should display or preserve these fields when teachers need to audit why a lesson exceeded the nominal line capacity.

## Tested Quran regions

Automated acceptance coverage includes:

- long-surah forward planning,
- short-surah reverse planning,
- mixed boundaries between adjacent surahs,
- long boundary ayahs,
- exact floating-point line boundaries,
- configurable surah-completion allowances,
- max-ayah interaction,
- minor-review reset on surah change,
- exact 15-line review pages,
- consolidation and independent review resets.

## Rule-by-rule purpose

### `AyahIntegrityRule`

Purpose: preserve the indivisible Quran unit. It applies to every track and normalizes a proposed boundary to a complete ayah. The normal line overflow caused by the last indivisible ayah is reported as `AYAH_INTEGRITY`; it is not permission to append additional ayahs.

### `SurahCompletionRule`

Purpose: avoid leaving a very small remainder at the end of the active Hifz surah when the teacher enables that preference. It is Hifz-only, measures the proposed full ending in lines, and grants an explicit overflow allowance for later hard rules to inspect. It cannot silently exempt the lesson from `MaxAyahRule`.

### `SurahSnapRule`

Purpose: prefer a clean surah boundary when the current candidate already reaches one safely. It is an alignment preference, not a command to consume an arbitrary remainder.

### `PageAlignmentRule`

Purpose: improve a nearby Hifz stopping point at a page boundary. It does not apply to review and cannot move past the current surah end or survive the final capacity rules if the adjustment is too large.

### `ThematicHaltingRule`

Purpose: prefer canonical thematic break metadata when available near the candidate. It is Hifz-only. The presence of a thematic marker never overrides range, line, or ayah safety.

### `BalanceCorrectionRule`

Purpose: avoid pedagogically awkward small tails when a safe local correction exists. Like other soft alignment rules, its proposal is provisional until final hard limits run.

### `MaxAyahRule`

Purpose: cap cognitive item count independently from mushaf lines. It normally truncates at `maxAyahPerDay`. The only explicit exception is a granted surah completion with `mayExceedMaxAyahs: true`.

### `MaxLinesRule`

Purpose: run last and enforce the configured Hifz line boundary while keeping the final ayah whole. It preserves only a valid explicit surah-completion allowance; otherwise any earlier multi-ayah enlargement is removed.

## Step flags and metadata

Strategies attach flags before rules execute:

- `memorization`: identifies a Hifz step.
- `review`: excludes the step from memorization-only rules.
- `completed`: the configured track end was reached.
- `reset`: a looping review reached its wall/end and will restart.

Rules may add metadata describing applied rules or an overflow grant. Flags control execution behavior; public consumers should primarily use final event fields such as `appliedRules`, `overflowReason`, and review `is_reset`.

## Recommended teacher starting points

These objects are examples, not named runtime presets:

| Profile | Ayah cap | Completion allowance | Consolidation |
|---|---:|---:|---:|
| Beginner/conservative | 5 | 1 line | every 5th study day |
| Standard | 10 | 2 lines | every 6th study day |
| Intensive | 15 | disabled unless chosen by teacher | disabled or locally configured |
| Finishing a range | teacher-selected | 1–2 lines, ayah exception off by default | every 7th study day |

Student ability, verse length, existing memorization, and teaching method must override these illustrative values.

## Validation and migration

- `maxAyahPerDay` should be positive; planning-mode `daysPerWeek` must be 1–7.
- A range must be valid in the selected direction.
- `dailyLines`, duration, and track amounts must be positive.
- New integrations should replace `sequentialSurahMode: true` with an explicit `surahCompletion` object.
- Legacy cross-surah minor review must now be requested with `surahBoundedMinorReview: false`.
- Code that previously treated `maxAyahPerDay` as advisory must expect it to be a hard cap.
- Do not import internal rule classes from the npm root. The stable customization surface is `ScheduleConfig`.

## Pedagogical interaction summary

The rules answer different questions and therefore should not be collapsed into one generic maximum:

- Line capacity: how much new mushaf material is assigned today?
- Ayah cap: how many distinct cognitive units are assigned today?
- Surah completion: is a small remainder worth an explicitly bounded exception?
- Minor-review wall: has this material already been memorized?
- Minor-review surah bound: does this recent material belong to the currently active surah?
- Consolidation/catch-up: should new Hifz advance on this date at all?

This separation is why surah completion is useful without being allowed to create 12-, 15-, or 21-line lessons from an eight-line configuration.
