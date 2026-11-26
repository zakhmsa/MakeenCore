# MakeenCore

[![Status](https://img.shields.io/badge/Status-Production%20Ready-success)](https://github.com/7odaifa-ab/MakeenCore)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Arabic](https://img.shields.io/badge/lang-العربية-green)](./README.ar.md)
[![Zakhm](https://img.shields.io/badge/Made%20by-Zakhm-9cf)](https://zakhm.sa)

> Deterministic TypeScript scheduling engine for Quran memorization (Hifz) and review tracking.

MakeenCore generates day-by-day study plans that balance **new memorization**, **minor review** (recent material), and **major review** (full-cycle review). Designed as a standalone library for integration into backend systems (NestJS, Express, etc.) and client-side plan generators.

---

## Quick Start

### Installation

```bash
npm install @zakhm_sa/makeen-core
```

### Minimal Example

```typescript
import { MakeenEngine } from '@zakhm_sa/makeen-core';

const result = MakeenEngine.generatePlan({
    name: "30-Day Hifz",
    direction: "FORWARD",
    daysPerWeek: 5,
    tracks: [{
        type: "HIFZ",
        priority: 1,
        amountUnit: "LINES",
        amountValue: 10,
        start: { surah: 1, ayah: 1 },
        end: { surah: 2, ayah: 50 },
        config: {
            maxAyahPerDay: 10,
            surahCompletion: { enabled: true, maxOverflowLines: 2 }
        }
    }],
    startDate: "2026-04-01"
});

if (result.success) {
    console.log(`Plan: ${result.data.totalDays} days`);
    console.log(result.data.plan); // Array of daily events
}
```

### Builder Pattern (Advanced)

```typescript
import { PlanBuilder, WindowMode } from '@zakhm_sa/makeen-core';

const manager = new PlanBuilder()
    .setSchedule({
        startDate: "2026-04-01",
        daysPerWeek: 6,
        isReverse: false,
        maxAyahPerDay: 8
    })
    .planByDailyAmount({
        from: { surah: 2, ayah: 1 },
        to: { surah: 2, ayah: 286 },
        dailyLines: 12
    })
    .addMinorReview(5, WindowMode.GRADUAL)
    .stopWhenCompleted()
    .build();

const days = manager.generatePlan();
```

---

## Core Capabilities

| Feature | Description |
|---------|-------------|
| **Multi-track scheduling** | Hifz (new), Minor Review (recent), Major Review (full cycle) |
| **Canonical Quran indexing** | Directional prefix-sum and whole-ayah index calculations for any range |
| **Flexible Hifz units** | Plan new memorization by **lines/pages** (`LINES`/`PAGES`) or **whole ayahs** (`AYAHS`) |
| **Pedagogical rules** | Ayah integrity, surah continuity, consolidation days, optional line guard |
| **Explainable capacity** | Reports `ayahsCount`, `lines`, requested amount, overflow, and `overflowReason` |
| **Planning modes** | By duration ("finish in X days") or by daily amount ("Y lines or ayahs/day") |
| **Library-first design** | Pure TypeScript, no dependencies, deterministic output |

---

## Ayah-Count Daily Amount (`AYAHS` Mode)

> **Important Note — Do NOT use the `dailyLines: 999` + `maxAyahPerDay: N` workaround:**  
> When teachers assign by **number of ayahs per day** (e.g. "5 آيات يوميًا"), use the first-class `AYAHS` unit directly. Internally, MakeenCore already indexes the entire Mushaf as a canonical sequence of 6,236 whole ayahs (`0..6235`), so `AYAHS` mode advances directly by exact index (`startIdx + N - 1`), disables line-based soft snapping, and still populates exact `lines` and `ayahsCount` on every event.

### 1. Builder API (`AYAHS`)

```typescript
import { PlanBuilder, WindowMode } from '@zakhm_sa/makeen-core';

// Option A: Direct Hifz track by ayahs
const plan = new PlanBuilder()
    .setSchedule({
        startDate: '2026-04-01',
        daysPerWeek: 5,
        isReverse: false,
        surahCompletion: {
            enabled: true,
            maxOverflowAyahs: 2 // Finish surah if <= 2 ayahs remain (default: 2)
        },
        maxLinesPerDay: 15      // Optional line guard for very long ayahs
    })
    .addHifz(5, { surah: 2, ayah: 1 }, { surah: 2, ayah: 20 }, { unit: 'AYAHS' })
    // Or: .addHifzByAyahs(5, { surah: 2, ayah: 1 }, { surah: 2, ayah: 20 })
    // Or: .planByDailyAyahs({ from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 20 }, dailyAyahs: 5 })
    // Or: .planByDuration({ from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 40 }, durationDays: 10, unit: 'AYAHS' })
    .addMinorReview(3, WindowMode.GRADUAL)
    .stopWhenCompleted()
    .build()
    .generatePlan();
```

### 2. DTO Facade (`amountUnit: 'AYAHS'`)

```typescript
import { MakeenEngine } from '@zakhm_sa/makeen-core';

const result = MakeenEngine.generatePlan({
    name: '5 Ayahs Per Day',
    startDate: '2026-04-01',
    direction: 'FORWARD',
    daysPerWeek: 5,
    tracks: [
        {
            type: 'HIFZ',
            priority: 1,
            amountUnit: 'AYAHS',
            amountValue: 5,
            start: { surah: 2, ayah: 1 },
            end: { surah: 2, ayah: 20 },
            config: {
                surahCompletion: { enabled: true, maxOverflowAyahs: 2 },
                maxLinesPerDay: 15
            }
        },
        {
            type: 'MINOR_REVIEW',
            priority: 2,
            amountUnit: 'LESSONS',
            amountValue: 3
        }
    ]
});
```

### `AYAHS` Mode Semantics & Rules

- **Hifz only:** `AYAHS` is valid for `HIFZ` only. Minor review (`LESSONS` or `PAGES`) and major review (`LINES` or `PAGES`) stay lesson/line/page-based. Lesson-based minor review automatically reviews the last `K` completed Hifz lessons regardless of whether Hifz used `LINES` or `AYAHS`.
- **Surah completion (`maxOverflowAyahs`):** When `surahCompletion.enabled` is true in `AYAHS` mode, if finishing the current surah requires `<= maxOverflowAyahs` extra ayahs (default `2`), they are included that day with `overflowReason: 'SURAH_COMPLETION'`. `maxOverflowLines` is ignored in `AYAHS` mode.
- **`maxAyahPerDay` conflict rule:** In `AYAHS` mode, the daily ayah amount itself is the ayah cap. Do not set `maxAyahPerDay` smaller than `dailyAyahs` — doing so throws a `PlanError(INVALID_INPUT)`.
- **Optional line guard (`maxLinesPerDay`):** If configured in `AYAHS` mode, caps the daily lesson at the last whole ayah that fits within `maxLinesPerDay` (always emitting at least **1 whole ayah**, even for a 15-line ayah like `2:282`) and records `'LINE_GUARD'` in `appliedRules`.

---

## Configuration

### Schedule Options

```typescript
.setSchedule({
    startDate: "2026-04-01",     // ISO date
    daysPerWeek: 5,              // 1-7
    isReverse: false,            // false = Al-Fatiha → An-Nas
    maxAyahPerDay: 10,           // Hard cap in LINES mode (default: 10)
    maxLinesPerDay: 15,          // Optional hard line guard in AYAHS mode
    surahCompletion: {           // Optional, capacity-aware surah completion
        enabled: true,
        maxOverflowLines: 2,     // LINES mode (default: 2)
        maxOverflowAyahs: 2,     // AYAHS mode (default: 2)
        mayExceedMaxAyahs: false
    },
    strictSequentialMode: false, // Never switch until 100% done
    consolidationDayInterval: 6, // Every Nth day = review only
    surahBoundedMinorReview: true, // Keep review in current surah (default)
    minorReviewPagesCount: 5,   // Pages to review (15 lines = 1 page)
    includeHijri: false         // Attach an Umm al-Qura Hijri date to each day
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `startDate` | string | required | Plan start date (YYYY-MM-DD) |
| `daysPerWeek` | number | required | Study days per week |
| `isReverse` | boolean | false | Direction: true = An-Nas → Al-Fatiha |
| `maxAyahPerDay` | number | 10 | Daily memorization ayah cap in `LINES` mode |
| `maxLinesPerDay` | number | — | Optional line guard in `AYAHS` mode (min 1 ayah) |
| `surahCompletion` | object | disabled | Complete a surah within an explicit line (`maxOverflowLines`) or ayah (`maxOverflowAyahs`) allowance |
| `strictSequentialMode` | boolean | false | Never change surah until 100% |
| `consolidationDayInterval` | number | disabled | Every Nth generated study day is review-only |
| `surahBoundedMinorReview` | boolean | true | Minor review resets and stays in the active Hifz surah |
| `minorReviewPagesCount` | number | — | Exact 15-line pages in the active surah |
| `includeHijri` | boolean | false | Attach an Umm al-Qura Hijri date to each day (display-only) |

---

## Planning Modes

### 1. Plan By Duration

Provide: `from`, `to`, `durationDays`, `daysPerWeek`, and optional `unit?: 'LINES' | 'AYAHS'` (default `'LINES'`).  
Engine derives: daily lines or daily ayahs, plus `limitDays` (accessible via `builder.getDerivedDailyAmount()`).

```typescript
const manager = new PlanBuilder()
    .setSchedule({
        startDate: '2026-02-01',
        daysPerWeek: 5,
        isReverse: true,
        maxAyahPerDay: 5
    })
    .planByDuration({
        from: { surah: 66, ayah: 1 },
        to: { surah: 58, ayah: 8 },
        durationDays: 30
    })
    .addMinorReview(3, WindowMode.GRADUAL)
    .addMajorReview(15 * 5, { surah: 114, ayah: 1 })
    .stopWhenCompleted()
    .build();
```

### 2. Plan By Daily Amount

Provide: `from`, `to`, and `dailyLines` (or `dailyAyahs`), `daysPerWeek`  
Engine derives: the required generated study-day horizon using line/ayah and consolidation constraints.

```typescript
const manager = new PlanBuilder()
    .setSchedule({
        startDate: '2026-02-01',
        daysPerWeek: 6,
        isReverse: true,
        maxAyahPerDay: 12
    })
    .planByDailyAmount({
        from: { surah: 66, ayah: 1 },
        to: { surah: 55, ayah: 78 },
        dailyLines: 14
    })
    .addMinorReview(7, WindowMode.GRADUAL)
    .addMajorReview(15 * 10, { surah: 114, ayah: 1 })
    .stopWhenCompleted()
    .build();
```

---

## Advanced Features

### Major Review Horizon (sliding window)

By default the Major Review loops from a fixed origin up to the memorized "wall" and back. For long plans you often want it to stay on the **most recently memorized N lines** instead of always restarting from the beginning. Pass `horizonLines` to bound how far behind the Hifz front the review may reach — as memorization advances, the window slides forward with it.

```typescript
new PlanBuilder()
    .setSchedule({ startDate: '2026-04-01', daysPerWeek: 6 })
    .addHifz(15, { surah: 1, ayah: 1 })
    // Major review never reaches further back than 150 lines (~10 pages) behind the front:
    .addMajorReview(30, { surah: 1, ayah: 1 }, undefined, { horizonLines: 150 })
    .build();
```

Via the DTO API, set it on the major-review track's `config`:

```typescript
{
  type: "MAJOR_REVIEW", priority: 3, amountUnit: "LINES", amountValue: 30,
  config: { horizonLines: 150 }
}
```

Omit `horizonLines` for the classic fixed-origin cycle (fully backward compatible).

### Snapshot & Resume (intermittent students)

Real students pause for weeks and come back. Instead of re-simulating from the original start date, export the live track state, persist it in your own store, then resume from the real position later. The snapshot carries the **full history** (required for the minor-review window to stay correct).

```typescript
// ...after generating some days:
const snapshot = manager.exportSnapshot();   // serializable — store it anywhere (JSON)

// Later, when the student returns — rebuild the SAME plan at the real resume date:
const resumed = new PlanBuilder()
    .setSchedule({ startDate: '2026-06-01', daysPerWeek: 6 }) // the REAL resume date
    .addHifz(15, { surah: 1, ayah: 1 })
    .addMinorReview(3)
    .build();
resumed.importSnapshot(snapshot);            // restore positions + history
const nextDays = resumed.generatePlan();     // continues from where the student stopped
```

### Hijri Calendar (opt-in, zero-dependency)

Attach an Umm al-Qura Hijri date to every generated day — handy for Ramadan khatmah plans. It is display-only (scheduling stays Gregorian) and adds no dependencies (uses the built-in `Intl`).

```typescript
new PlanBuilder()
    .setSchedule({ startDate: '2026-02-18', daysPerWeek: 7, includeHijri: true })
    .addHifz(15, { surah: 1, ayah: 1 })
    .build()
    .generatePlan(); // each PlanDay now has hijriDate, e.g. "١ رمضان ١٤٤٧ هـ"
```

Or via the DTO API, pass `includeHijri: true` in the request; each `PlanDayDTO` then carries a `hijriDate` field. The standalone `HijriDateUtils` helper is also exported (`toHijri`, `toHijriISO`).

---

## Output

The engine returns daily plan entries with event categories:

| Event Type | Description |
|------------|-------------|
| `MEMORIZATION` | New material to memorize |
| `REVIEW` | Scheduled review events |

Every event reports both `lines` (`linesCount` in DTO) and `ayahsCount`. Hifz events also report `requestedLines`/`overflowLines` (in `LINES` mode) or `requestedAyahs`/`overflowAyahs` (in `AYAHS` mode) and `overflowReason`.

```typescript
if (result.success) {
    const planDays = result.data.plan;
    // Persist to your database (Prisma, etc.)
}
```

---

## Documentation

| Document | Purpose |
|----------|---------|
| [AI usage contract](llms.txt) | Compact source of truth for LLMs and coding agents |
| [User Guide](USER_GUIDE.md) | Current track behavior and examples |
| [Changelog](CHANGELOG.md) | Release history and new capabilities |
| [API Contracts](doc/planning-engine/planning-engine-api-contracts.md) | TypeScript integration contracts |
| [Pedagogical Rules Guide](doc/planning-engine/pedagogical-rules-guide.md) | Rule behavior and configuration |
| [Planning Modes & Phases](doc/planning-engine/planning-modes-and-phases.md) | Execution phases, QA scenarios, milestones, and current limitations |
| [Project Status & QA](doc/planning-engine/project-status-and-qa.en.md) | Implemented, internal, transitional, and tested areas |
| [Documentation Audit](doc/planning-engine/documentation-audit.md) | Evidence-based classification of retained, internal, declared-only, and obsolete details |
| [PRD](doc/planning-engine/planning-engine-prd.md) | Historical product intent; status banner identifies it as non-authoritative for current APIs |

---

## Testing

```bash
npm install
npm test
```

**Total automated tests:** 88/88 passing, plus 10/10 scenario validations.

---

## Notes for Library Consumers

- Scenario launchers and Excel scripts in `/src` are for internal QA only
- For production: consume `planDays` and handle persistence in your host application
- Published technical contracts are included under `/doc/planning-engine`

---

<div align="center">

## Built with 💜 by Zakhm

<table>
<tr>
<td width="100" align="center">
<img src="https://github.com/user-attachments/assets/9223eb9d-920c-4ae6-8fb5-8ab3883ee105" alt="Zakhm Logo" width="80" height="80" style="border-radius: 12px;">
</td>
<td>

**[Zakhm](https://zakhm.sa)** — Empowering Islamic education through technology.

We believe great tools should be accessible to all. Use MakeenCore freely, and consider contributing back to help the community grow.

📄 Licensed under [Zakhm Attribution License (ZAL) 1.0](./LICENSE)

</td>
</tr>
</table>

</div>
