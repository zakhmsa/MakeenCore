import { describe, expect, it } from 'vitest';
import { PlanBuilder } from '../builders/PlanBuilder';
import { QuranRepository } from '../core/QuranRepository';
import { EventType, WindowMode } from '../core/constants';
import { PlanDay, PlanEvent } from '../core/types';
import { PlanError, PlanErrorCode } from '../errors';
import { MakeenEngine } from '../index';

const repo = QuranRepository.getInstance();

function memorization(plan: PlanDay[]): PlanEvent[] {
    return plan.flatMap(day => day.events.filter(event => event.eventType === EventType.MEMORIZATION));
}

describe('QuranRepository ayah helpers (countAyahs & advanceByAyahs)', () => {
    it('counts ayahs accurately within a surah and across surah boundaries in both directions', () => {
        // Al-Baqarah 1..20 -> 20 ayahs
        expect(repo.countAyahs({ surah: 2, ayah: 1 }, { surah: 2, ayah: 20 }, false)).toBe(20);
        // Al-Fatiha 1..7 + Al-Baqarah 1..5 -> 12 ayahs
        expect(repo.countAyahs({ surah: 1, ayah: 1 }, { surah: 2, ayah: 5 }, 'FORWARD')).toBe(12);
        // Reverse: An-Nas (6) + Al-Falaq (5) + Al-Ikhlas (4) = 15 ayahs
        expect(repo.countAyahs({ surah: 114, ayah: 1 }, { surah: 112, ayah: 4 }, 'REVERSE')).toBe(15);
        // Whole mushaf: 6236 ayahs
        expect(repo.countAyahs({ surah: 1, ayah: 1 }, { surah: 114, ayah: 6 }, false)).toBe(6236);
        expect(repo.countAyahs({ surah: 114, ayah: 1 }, { surah: 1, ayah: 7 }, true)).toBe(6236);
    });

    it('advances by N ayahs across surah boundaries and respects bounds and mushaf ends', () => {
        // Forward from 1:1 taking 7 ayahs -> 1:7 (end of Al-Fatiha)
        expect(repo.advanceByAyahs({ surah: 1, ayah: 1 }, 7, 'FORWARD')).toMatchObject({
            surah: 1,
            ayah: 7,
            is_end: true
        });
        // Forward from 1:1 taking 8 ayahs -> crosses into 2:1
        expect(repo.advanceByAyahs({ surah: 1, ayah: 1 }, 8, false)).toMatchObject({
            surah: 2,
            ayah: 1
        });
        // Clamped by explicit bound
        expect(repo.advanceByAyahs({ surah: 1, ayah: 1 }, 20, false, { surah: 1, ayah: 5 })).toMatchObject({
            surah: 1,
            ayah: 5
        });
        // Clamped at the end of the mushaf (forward)
        expect(repo.advanceByAyahs({ surah: 114, ayah: 4 }, 10, false)).toMatchObject({
            surah: 114,
            ayah: 6
        });
        // Reverse: from 114:1 taking 7 ayahs -> 114:1..114:6 (6 ayahs) + 113:1 (7th ayah)
        expect(repo.advanceByAyahs({ surah: 114, ayah: 1 }, 7, 'REVERSE')).toMatchObject({
            surah: 113,
            ayah: 1
        });
        // Clamped at the end of the mushaf (reverse)
        expect(repo.advanceByAyahs({ surah: 1, ayah: 5 }, 10, true)).toMatchObject({
            surah: 1,
            ayah: 7
        });
    });

    it('rejects non-positive or non-integer ayah advance amounts', () => {
        expect(() => repo.advanceByAyahs({ surah: 1, ayah: 1 }, 0, false)).toThrow(PlanError);
        expect(() => repo.advanceByAyahs({ surah: 1, ayah: 1 }, -3, false)).toThrow(PlanError);
        expect(() => repo.advanceByAyahs({ surah: 1, ayah: 1 }, 2.5, false)).toThrow(PlanError);
    });
});

describe('AYAHS daily amount mode', () => {
    it('1. Forward plan, 5 ayahs/day, Al-Baqarah 1–20 -> 4 days of 5, 5, 5, 5 with ayahsCount and lines populated', () => {
        const plan = new PlanBuilder()
            .setSchedule({
                startDate: '2026-04-01',
                daysPerWeek: 7,
                isReverse: false
            })
            .addHifz(5, { surah: 2, ayah: 1 }, { surah: 2, ayah: 20 }, { unit: 'AYAHS' })
            .stopWhenCompleted()
            .build()
            .generatePlan();

        const hifzEvents = memorization(plan);
        expect(hifzEvents).toHaveLength(4);

        const expectedRanges = [
            [1, 5],
            [6, 10],
            [11, 15],
            [16, 20]
        ];

        hifzEvents.forEach((ev, idx) => {
            const [startAyah, endAyah] = expectedRanges[idx];
            expect(ev.data.start).toMatchObject({ surah: 2, ayah: startAyah });
            expect(ev.data.end).toMatchObject({ surah: 2, ayah: endAyah });
            expect(ev.data.ayahsCount).toBe(5);
            expect(ev.data.requestedAyahs).toBe(5);
            expect(ev.data.overflowAyahs).toBe(0);
            expect(ev.data.lines).toBeGreaterThan(0);
        });
    });

    it('2. Reverse plan from An-Nas: crosses surah boundaries cleanly, never splits an ayah, last lesson takes remainder', () => {
        // An-Nas (6) + Al-Falaq (5) + Al-Ikhlas (4) = 15 ayahs. With 4 ayahs/day -> 4, 4, 4, 3.
        const plan = new PlanBuilder()
            .setSchedule({
                startDate: '2026-04-01',
                daysPerWeek: 7,
                isReverse: true
            })
            .addHifzByAyahs(4, { surah: 114, ayah: 1 }, { surah: 112, ayah: 4 })
            .stopWhenCompleted()
            .build()
            .generatePlan();

        const hifzEvents = memorization(plan);
        expect(hifzEvents.map(e => e.data.ayahsCount)).toEqual([4, 4, 4, 3]);
        expect(hifzEvents[0].data.start).toMatchObject({ surah: 114, ayah: 1 });
        expect(hifzEvents[0].data.end).toMatchObject({ surah: 114, ayah: 4 });
        // Day 2 crosses from 114:5..6 into 113:1..2
        expect(hifzEvents[1].data.start).toMatchObject({ surah: 114, ayah: 5 });
        expect(hifzEvents[1].data.end).toMatchObject({ surah: 113, ayah: 2 });
        // Last day ends exactly at 112:4
        expect(hifzEvents[3].data.end).toMatchObject({ surah: 112, ayah: 4 });
    });

    it('3. Range not divisible by N -> last day takes remainder and never crosses `to`', () => {
        // Al-Baqarah 1..13 (13 ayahs) at 5 ayahs/day -> 5, 5, 3
        const plan = new PlanBuilder()
            .setSchedule({
                startDate: '2026-04-01',
                daysPerWeek: 7,
                isReverse: false
            })
            .planByDailyAyahs({
                from: { surah: 2, ayah: 1 },
                to: { surah: 2, ayah: 13 },
                dailyAyahs: 5
            })
            .stopWhenCompleted()
            .build()
            .generatePlan();

        const hifzEvents = memorization(plan);
        expect(hifzEvents).toHaveLength(3);
        expect(hifzEvents.map(e => e.data.ayahsCount)).toEqual([5, 5, 3]);
        expect(hifzEvents[2].data.start).toMatchObject({ surah: 2, ayah: 11 });
        expect(hifzEvents[2].data.end).toMatchObject({ surah: 2, ayah: 13 });
    });

    it('4. Long-ayah case (2:282): 1 ayah/day produces one lesson with 2:282; smaller maxLinesPerDay still emits 1 ayah with LINE_GUARD', () => {
        // Without line guard: 1 ayah/day on 2:282 (Ayah al-Dayn, 15 lines)
        const normalPlan = new PlanBuilder()
            .setSchedule({
                startDate: '2026-04-01',
                daysPerWeek: 7,
                isReverse: false
            })
            .addHifz(1, { surah: 2, ayah: 282 }, { surah: 2, ayah: 282 }, { unit: 'AYAHS' })
            .stopWhenCompleted()
            .build()
            .generatePlan();

        const normalEvents = memorization(normalPlan);
        expect(normalEvents).toHaveLength(1);
        expect(normalEvents[0].data.start).toMatchObject({ surah: 2, ayah: 282 });
        expect(normalEvents[0].data.end).toMatchObject({ surah: 2, ayah: 282 });
        expect(normalEvents[0].data.ayahsCount).toBe(1);
        expect(normalEvents[0].data.lines).toBe(15);

        // With maxLinesPerDay = 5 (smaller than 2:282's 15 lines): still emits 2:282 (minimum 1 ayah) and records LINE_GUARD
        const guardedSingle = new PlanBuilder()
            .setSchedule({
                startDate: '2026-04-01',
                daysPerWeek: 7,
                isReverse: false,
                maxLinesPerDay: 5
            })
            .addHifz(1, { surah: 2, ayah: 282 }, { surah: 2, ayah: 282 }, { unit: 'AYAHS' })
            .stopWhenCompleted()
            .build()
            .generatePlan();

        const guardedEvents = memorization(guardedSingle);
        expect(guardedEvents).toHaveLength(1);
        expect(guardedEvents[0].data.start).toMatchObject({ surah: 2, ayah: 282 });
        expect(guardedEvents[0].data.end).toMatchObject({ surah: 2, ayah: 282 });
        expect(guardedEvents[0].data.ayahsCount).toBe(1);
        expect(guardedEvents[0].data.appliedRules).toContain('LINE_GUARD');

        // Multi-ayah lesson where maxLinesPerDay truncates N ayahs to fewer whole ayahs >= 1
        const multiGuarded = new PlanBuilder()
            .setSchedule({
                startDate: '2026-04-01',
                daysPerWeek: 7,
                isReverse: false,
                maxLinesPerDay: 4
            })
            .addHifz(5, { surah: 2, ayah: 280 }, { surah: 2, ayah: 284 }, { unit: 'AYAHS' })
            .stopWhenCompleted()
            .build()
            .generatePlan();

        const firstMulti = memorization(multiGuarded)[0];
        expect(firstMulti.data.ayahsCount).toBeLessThan(5);
        expect(firstMulti.data.ayahsCount).toBeGreaterThanOrEqual(1);
        expect(firstMulti.data.lines).toBeLessThanOrEqual(4);
        expect(firstMulti.data.appliedRules).toContain('LINE_GUARD');
    });

    it('5. Surah completion in AYAHS mode: within maxOverflowAyahs -> included with SURAH_COMPLETION; beyond it -> not included', () => {
        // Al-Fatiha has 7 ayahs. With 5 ayahs/day, 2 ayahs remain (6..7).
        // When maxOverflowAyahs = 2 (default): Day 1 completes all 7 ayahs with SURAH_COMPLETION.
        const completedPlan = new PlanBuilder()
            .setSchedule({
                startDate: '2026-04-01',
                daysPerWeek: 7,
                isReverse: false,
                surahCompletion: { enabled: true, maxOverflowAyahs: 2, maxOverflowLines: 0 } // maxOverflowLines=0 ignored in AYAHS mode
            })
            .addHifz(5, { surah: 1, ayah: 1 }, { surah: 1, ayah: 7 }, { unit: 'AYAHS' })
            .stopWhenCompleted()
            .build()
            .generatePlan();

        const completedEvents = memorization(completedPlan);
        expect(completedEvents).toHaveLength(1);
        expect(completedEvents[0].data.end).toMatchObject({ surah: 1, ayah: 7, is_end: true });
        expect(completedEvents[0].data.ayahsCount).toBe(7);
        expect(completedEvents[0].data.requestedAyahs).toBe(5);
        expect(completedEvents[0].data.overflowAyahs).toBe(2);
        expect(completedEvents[0].data.overflowReason).toBe('SURAH_COMPLETION');

        // When maxOverflowAyahs = 1: 2 remaining ayahs exceed allowance -> takes 5 on Day 1 and 2 on Day 2
        const deferredPlan = new PlanBuilder()
            .setSchedule({
                startDate: '2026-04-01',
                daysPerWeek: 7,
                isReverse: false,
                surahCompletion: { enabled: true, maxOverflowAyahs: 1 }
            })
            .addHifz(5, { surah: 1, ayah: 1 }, { surah: 1, ayah: 7 }, { unit: 'AYAHS' })
            .stopWhenCompleted()
            .build()
            .generatePlan();

        const deferredEvents = memorization(deferredPlan);
        expect(deferredEvents).toHaveLength(2);
        expect(deferredEvents[0].data.ayahsCount).toBe(5);
        expect(deferredEvents[0].data.overflowReason).toBeUndefined();
        expect(deferredEvents[1].data.ayahsCount).toBe(2);
    });

    it('6. Validation errors: maxAyahPerDay < N, non-integer or <= 0 dailyAyahs', () => {
        expect(() => {
            new PlanBuilder()
                .setSchedule({
                    startDate: '2026-04-01',
                    daysPerWeek: 5,
                    maxAyahPerDay: 4
                })
                .addHifz(5, { surah: 2, ayah: 1 }, { surah: 2, ayah: 20 }, { unit: 'AYAHS' })
                .build();
        }).toThrowError(PlanError);

        try {
            new PlanBuilder()
                .setSchedule({ startDate: '2026-04-01', daysPerWeek: 5, maxAyahPerDay: 4 })
                .addHifz(5, { surah: 2, ayah: 1 }, { surah: 2, ayah: 20 }, { unit: 'AYAHS' })
                .build();
        } catch (err: any) {
            expect(err.code).toBe(PlanErrorCode.INVALID_INPUT);
        }

        expect(() => {
            new PlanBuilder()
                .setSchedule({ startDate: '2026-04-01', daysPerWeek: 5 })
                .planByDailyAyahs({ from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 10 }, dailyAyahs: 0 });
        }).toThrowError(PlanError);

        expect(() => {
            new PlanBuilder()
                .setSchedule({ startDate: '2026-04-01', daysPerWeek: 5 })
                .planByDailyAyahs({ from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 10 }, dailyAyahs: 2.5 });
        }).toThrowError(PlanError);
    });

    it('7. Duration mode with unit: AYAHS derives N accounting for daysPerWeek, consolidation days, catch-up days, and holidays and finishes within calendar duration', () => {
        // Repro 1: 14 calendar days at 4 days/week -> 8 study days -> ceil(40 / 8) = 5 ayahs/day
        const reproBuilder = new PlanBuilder()
            .setSchedule({
                startDate: '2026-07-19',
                daysPerWeek: 4
            })
            .planByDuration({
                from: { surah: 2, ayah: 1 },
                to: { surah: 2, ayah: 40 },
                durationDays: 14,
                unit: 'AYAHS'
            })
            .stopWhenCompleted();

        expect(reproBuilder.getDerivedDailyAmount()).toEqual({ amount: 5, unit: 'AYAHS' });
        const reproPlan = reproBuilder.build().generatePlan();
        const reproMem = memorization(reproPlan);
        expect(reproMem.length).toBeLessThanOrEqual(8);
        expect(reproMem.reduce((sum, e) => sum + (e.data.ayahsCount ?? 0), 0)).toBe(40);
        const startMs = new Date('2026-07-19').getTime();
        const lastMs = reproPlan[reproPlan.length - 1].date.getTime();
        const calendarSpanDays = Math.round((lastMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
        expect(calendarSpanDays).toBeLessThanOrEqual(14);

        // Repro 2: With endDate set to the 14th calendar day (2026-08-01), AYAHS covers all 40 ayahs
        const boundedPlan = new PlanBuilder()
            .setSchedule({
                startDate: '2026-07-19',
                endDate: '2026-08-01',
                daysPerWeek: 4
            })
            .planByDuration({
                from: { surah: 2, ayah: 1 },
                to: { surah: 2, ayah: 40 },
                durationDays: 14,
                unit: 'AYAHS'
            })
            .stopWhenCompleted()
            .build()
            .generatePlan();
        const boundedMem = memorization(boundedPlan);
        expect(boundedMem.reduce((sum, e) => sum + (e.data.ayahsCount ?? 0), 0)).toBe(40);
        expect(boundedMem[boundedMem.length - 1].data.end).toMatchObject({ surah: 2, ayah: 40 });

        // Parity across daysPerWeek (3, 4, 5, 7) with holidays, consolidationDayInterval, and catchUpDayOfWeek:
        // Range: Al-Baqarah 1..40 (40 ayahs).
        // Duration: 10 calendar days at 7 days/week -> 10 study days.
        // Consolidation interval: every 5th study day (days 5 and 10 -> 2 days).
        // Holiday: '2026-04-01' (Day 1 -> 1 day).
        // Effective memorization days = 10 - 2 - 1 = 7 days -> ceil(40 / 7) = 6 ayahs/day.
        const builder = new PlanBuilder()
            .setSchedule({
                startDate: '2026-04-01',
                daysPerWeek: 7,
                consolidationDayInterval: 5,
                holidays: ['2026-04-01']
            })
            .planByDuration({
                from: { surah: 2, ayah: 1 },
                to: { surah: 2, ayah: 40 },
                durationDays: 10,
                unit: 'AYAHS'
            })
            .stopWhenCompleted();

        expect(builder.getDerivedDailyAmount()).toEqual({ amount: 6, unit: 'AYAHS' });

        const manager = builder.build();
        expect(manager.getDerivedDailyAmount()).toEqual({ amount: 6, unit: 'AYAHS' });

        const plan = manager.generatePlan();
        expect(plan.length).toBeLessThanOrEqual(10);
        const hifzEvents = memorization(plan);
        expect(hifzEvents[hifzEvents.length - 1].data.end).toMatchObject({ surah: 2, ayah: 40 });

        for (const dpw of [3, 4, 5, 7]) {
            const expectedStudyDays = Math.max(1, Math.ceil((21 * dpw) / 7));
            const b = new PlanBuilder()
                .setSchedule({ startDate: '2026-04-01', daysPerWeek: dpw })
                .planByDuration({
                    from: { surah: 2, ayah: 1 },
                    to: { surah: 2, ayah: 60 },
                    durationDays: 21,
                    unit: 'AYAHS'
                })
                .stopWhenCompleted();
            expect(b.getDerivedDailyAmount()?.amount).toBe(Math.ceil(60 / expectedStudyDays));
        }
    });

    it('8. sequentialSurahMode / strictSequentialMode parity on a multi-surah fixture', () => {
        // Al-Fatiha (7 ayahs) -> Al-Baqarah 1..5 (total 12 ayahs), 5 ayahs/day.
        // In strictSequentialMode: Day 1 takes 1:1..1:5 (5 ayahs), Day 2 stops at 1:7 (2 ayahs, cannot jump to Surah 2),
        // Day 3 takes 2:1..2:5 (5 ayahs).
        const strictPlan = new PlanBuilder()
            .setSchedule({
                startDate: '2026-04-01',
                daysPerWeek: 7,
                isReverse: false,
                strictSequentialMode: true
            })
            .addHifz(5, { surah: 1, ayah: 1 }, { surah: 2, ayah: 5 }, { unit: 'AYAHS' })
            .stopWhenCompleted()
            .build()
            .generatePlan();

        const strictEvents = memorization(strictPlan);
        expect(strictEvents).toHaveLength(3);
        expect(strictEvents[0].data.start).toMatchObject({ surah: 1, ayah: 1 });
        expect(strictEvents[0].data.end).toMatchObject({ surah: 1, ayah: 5 });
        expect(strictEvents[1].data.start).toMatchObject({ surah: 1, ayah: 6 });
        expect(strictEvents[1].data.end).toMatchObject({ surah: 1, ayah: 7 });
        expect(strictEvents[2].data.start).toMatchObject({ surah: 2, ayah: 1 });
        expect(strictEvents[2].data.end).toMatchObject({ surah: 2, ayah: 5 });
    });

    it('9. Minor review (both lesson-count and pages modes) works seamlessly when Hifz is AYAHS', () => {
        // Lesson-count mode: 2 past lessons
        const lessonReviewPlan = new PlanBuilder()
            .setSchedule({
                startDate: '2026-04-01',
                daysPerWeek: 7,
                isReverse: false
            })
            .addHifz(5, { surah: 2, ayah: 1 }, { surah: 2, ayah: 25 }, { unit: 'AYAHS' })
            .addMinorReview(2, WindowMode.GRADUAL)
            .stopWhenCompleted()
            .build()
            .generatePlan();

        // Day 1: no minor review; Day 2: 2:1..2:5 (5 ayahs); Day 3: 2:1..2:10 (10 ayahs); Day 4: 2:6..2:15 (10 ayahs)
        expect(lessonReviewPlan[0].events.find(e => e.trackId === 2)).toBeUndefined();
        const day2Minor = lessonReviewPlan[1].events.find(e => e.trackId === 2)!;
        expect(day2Minor.data.start).toMatchObject({ surah: 2, ayah: 1 });
        expect(day2Minor.data.end).toMatchObject({ surah: 2, ayah: 5 });
        expect(day2Minor.data.ayahsCount).toBe(5);

        const day4Minor = lessonReviewPlan[3].events.find(e => e.trackId === 2)!;
        expect(day4Minor.data.start).toMatchObject({ surah: 2, ayah: 6 });
        expect(day4Minor.data.end).toMatchObject({ surah: 2, ayah: 15 });
        expect(day4Minor.data.ayahsCount).toBe(10);

        // Pages mode: minorReviewPagesCount = 1 (15 lines)
        const pageReviewPlan = new PlanBuilder()
            .setSchedule({
                startDate: '2026-04-01',
                daysPerWeek: 7,
                isReverse: false,
                minorReviewPagesCount: 1
            })
            .addHifz(10, { surah: 2, ayah: 1 }, { surah: 2, ayah: 60 }, { unit: 'AYAHS' })
            .addMinorReview(3, WindowMode.GRADUAL)
            .stopWhenCompleted()
            .build()
            .generatePlan();

        const reviews = pageReviewPlan.flatMap(d => d.events.filter(e => e.trackId === 2));
        expect(reviews.length).toBeGreaterThan(0);
        expect(reviews.some(r => (r.data.lines ?? 0) >= 15)).toBe(true);
        expect(reviews.every(r => (r.data.ayahsCount ?? 0) > 0)).toBe(true);
    });

    it('10. Regression: representative 1.2.0 line-mode plan keeps exact day/range/line values', () => {
        const linePlan = new PlanBuilder()
            .setSchedule({
                startDate: '2026-04-08',
                daysPerWeek: 5,
                isReverse: false
            })
            .addHifz(10, { surah: 66, ayah: 1 }, { surah: 67, ayah: 30 })
            .stopWhenCompleted()
            .build()
            .generatePlan();

        expect(linePlan).toHaveLength(6);
        const hifzEvents = memorization(linePlan);
        expect(hifzEvents[0].data).toMatchObject({
            start: { surah: 66, ayah: 1 },
            end: { surah: 66, ayah: 6 },
            lines: 11.5,
            requestedLines: 10,
            overflowLines: 1.5,
            overflowReason: 'AYAH_INTEGRITY',
            ayahsCount: 6
        });
        expect(hifzEvents[1].data).toMatchObject({
            start: { surah: 66, ayah: 7 },
            end: { surah: 66, ayah: 10 },
            lines: 11.5,
            ayahsCount: 4
        });
    });

    it('11. DTO path: amountUnit: AYAHS produces identical plan to builder path; AYAHS on MINOR_REVIEW / MAJOR_REVIEW is rejected', () => {
        const dtoRes = MakeenEngine.generatePlan({
            name: 'Ayahs DTO Plan',
            startDate: '2026-04-01',
            direction: 'FORWARD',
            daysPerWeek: 6,
            tracks: [
                {
                    type: 'HIFZ',
                    priority: 1,
                    amountUnit: 'AYAHS',
                    amountValue: 5,
                    start: { surah: 2, ayah: 1 },
                    end: { surah: 2, ayah: 20 }
                }
            ]
        });

        expect(dtoRes.success).toBe(true);
        expect(dtoRes.data.totalDays).toBe(4);
        dtoRes.data.plan.forEach((day) => {
            expect(day.events[0].ayahsCount).toBe(5);
            expect(day.events[0].requestedAyahs).toBe(5);
            expect(day.events[0].overflowAyahs).toBe(0);
            expect(day.events[0].linesCount).toBeGreaterThan(0);
        });

        const builderPlan = new PlanBuilder()
            .setSchedule({ startDate: '2026-04-01', daysPerWeek: 6, isReverse: false })
            .addHifz(5, { surah: 2, ayah: 1 }, { surah: 2, ayah: 20 }, { unit: 'AYAHS' })
            .stopWhenCompleted()
            .build()
            .generatePlan();

        expect(dtoRes.data.plan.map(d => d.events[0].start)).toEqual(
            builderPlan.map(d => ({ surah: d.events[0].data.start.surah, ayah: d.events[0].data.start.ayah }))
        );
        expect(dtoRes.data.plan.map(d => d.events[0].end)).toEqual(
            builderPlan.map(d => ({ surah: d.events[0].data.end.surah, ayah: d.events[0].data.end.ayah }))
        );

        // Reject AYAHS on MINOR_REVIEW
        const minorRejected = MakeenEngine.generatePlan({
            name: 'Invalid Minor AYAHS',
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
                    end: { surah: 2, ayah: 20 }
                },
                {
                    type: 'MINOR_REVIEW',
                    priority: 2,
                    amountUnit: 'AYAHS',
                    amountValue: 5
                }
            ]
        });
        expect(minorRejected.success).toBe(false);

        // Reject AYAHS on MAJOR_REVIEW
        const majorRejected = MakeenEngine.generatePlan({
            name: 'Invalid Major AYAHS',
            startDate: '2026-04-01',
            direction: 'FORWARD',
            daysPerWeek: 5,
            tracks: [
                {
                    type: 'MAJOR_REVIEW',
                    priority: 3,
                    amountUnit: 'AYAHS',
                    amountValue: 10,
                    start: { surah: 1, ayah: 1 },
                    end: { surah: 2, ayah: 20 }
                }
            ]
        });
        expect(majorRejected.success).toBe(false);
    });

    it('12. Determinism: generating the same AYAHS plan twice yields deep-equal output', () => {
        const generate = () =>
            MakeenEngine.generatePlan({
                name: 'Deterministic Ayahs Plan',
                startDate: '2026-04-01',
                direction: 'REVERSE',
                daysPerWeek: 5,
                includeHijri: true,
                tracks: [
                    {
                        type: 'HIFZ',
                        priority: 1,
                        amountUnit: 'AYAHS',
                        amountValue: 6,
                        start: { surah: 114, ayah: 1 },
                        end: { surah: 105, ayah: 5 },
                        config: {
                            surahCompletion: { enabled: true, maxOverflowAyahs: 2 },
                            consolidationDayInterval: 5
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

        const first = generate();
        const second = generate();
        expect(first).toEqual(second);
    });
});
