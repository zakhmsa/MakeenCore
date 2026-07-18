import { describe, expect, it } from 'vitest';
import { PlanBuilder } from '../builders/PlanBuilder';
import { QuranRepository } from '../core/QuranRepository';
import { EventType, WindowMode } from '../core/constants';
import { PlanDay, PlanEvent } from '../core/types';

const repo = QuranRepository.getInstance();

function memorization(plan: PlanDay[]): PlanEvent[] {
    return plan.flatMap(day => day.events.filter(event => event.eventType === EventType.MEMORIZATION));
}

function assertOnlyWholeAyahOverflow(plan: PlanDay[], requestedLines: number, isReverse: boolean): void {
    for (const event of memorization(plan)) {
        const actual = event.data.lines ?? 0;
        expect(event.data.requestedLines).toBe(requestedLines);
        if (actual <= requestedLines) continue;

        expect(event.data.overflowReason).toBeDefined();
        if (event.data.overflowReason === 'SURAH_COMPLETION') continue;

        const startIdx = repo.getIndexFromLocation(event.data.start.surah, event.data.start.ayah, isReverse);
        const endIdx = repo.getIndexFromLocation(event.data.end.surah, event.data.end.ayah, isReverse);
        if (endIdx === startIdx) continue; // one long ayah is necessarily indivisible

        const previousEnd = repo.getLocationFromIndex(
            endIdx - 1,
            repo.getDirectionData(isReverse).index_map
        );
        const withoutBoundaryAyah = repo.getLinesBetween(event.data.start, previousEnd, isReverse);
        expect(withoutBoundaryAyah).toBeLessThan(requestedLines);
    }
}

describe('daily line capacity across Quran regions', () => {
    it.each([
        ['long surah / forward', false, { surah: 2, ayah: 1 }, { surah: 2, ayah: 120 }],
        ['short surahs / reverse', true, { surah: 89, ayah: 1 }, { surah: 78, ayah: 11 }],
        ['mixed surah boundaries / forward', false, { surah: 65, ayah: 1 }, { surah: 68, ayah: 20 }]
    ] as const)('keeps overflow limited to one indivisible ayah: %s', (_name, isReverse, from, to) => {
        const plan = new PlanBuilder()
            .setSchedule({
                startDate: '2026-01-01',
                daysPerWeek: 7,
                isReverse,
                maxAyahPerDay: 100,
                surahCompletion: { enabled: false }
            })
            .addHifz(8, from, to)
            .stopWhenCompleted()
            .build()
            .generatePlan();

        expect(memorization(plan).length).toBeGreaterThan(1);
        assertOnlyWholeAyahOverflow(plan, 8, isReverse);
    });

    it('never lets soft snap rules enlarge a lesson past its raw whole-ayah boundary', () => {
        const plan = new PlanBuilder()
            .setSchedule({
                startDate: '2026-01-01', daysPerWeek: 7, isReverse: true,
                maxAyahPerDay: 8,
                surahCompletion: { enabled: false }
            })
            .addHifz(8, { surah: 89, ayah: 1 }, { surah: 59, ayah: 11 })
            .stopWhenCompleted().build().generatePlan();

        assertOnlyWholeAyahOverflow(plan, 8, true);
        expect(Math.max(...memorization(plan).map(e => e.data.lines ?? 0))).toBeLessThan(15);
    });
});

describe('capacity-aware surah completion', () => {
    function firstLesson(maxOverflowLines: number, mayExceedMaxAyahs = false) {
        return new PlanBuilder()
            .setSchedule({
                startDate: '2026-01-01', daysPerWeek: 7, maxAyahPerDay: 1,
                surahCompletion: { enabled: true, maxOverflowLines, mayExceedMaxAyahs }
            })
            .addHifz(2, { surah: 5, ayah: 119 }, { surah: 5, ayah: 120 })
            .stopWhenCompleted().build().generatePlan()[0].events[0];
    }

    it('defers the surah remainder when it exceeds the configured line allowance', () => {
        const event = firstLesson(1, true);
        expect(event.data.end).toMatchObject({ surah: 5, ayah: 119 });
        expect(event.data.lines).toBe(2);
    });

    it('finishes a surah within the teacher allowance and explains the overflow', () => {
        const event = firstLesson(1.5, true);
        expect(event.data.end).toMatchObject({ surah: 5, ayah: 120, is_end: true });
        expect(event.data.lines).toBe(3.5);
        expect(event.data.overflowLines).toBe(1.5);
        expect(event.data.overflowReason).toBe('SURAH_COMPLETION');
    });

    it('does not exceed maxAyahPerDay unless the teacher explicitly allows it', () => {
        expect(firstLesson(2, false).data.end.ayah).toBe(119);
        expect(firstLesson(2, true).data.end.ayah).toBe(120);
    });
});

describe('surah-bounded minor review', () => {
    it('is the default and resets when hifz actually starts a new surah', () => {
        const plan = new PlanBuilder()
            .setSchedule({ startDate: '2026-01-01', daysPerWeek: 7, isReverse: true, maxAyahPerDay: 100 })
            .addHifz(3, { surah: 89, ayah: 20 }, { surah: 87, ayah: 10 })
            .addMinorReview(3, WindowMode.GRADUAL)
            .stopWhenCompleted().build().generatePlan();

        for (const day of plan) {
            const hifz = day.events.find(event => event.eventType === EventType.MEMORIZATION);
            const minor = day.events.find(event => event.trackId === 2);
            if (!hifz || !minor) continue;
            expect(minor.data.start.surah).toBe(hifz.data.end.surah);
            expect(minor.data.end.surah).toBe(hifz.data.end.surah);
        }
    });

    it('calculates configured pages as real 15-line windows inside a long surah', () => {
        const plan = new PlanBuilder()
            .setSchedule({
                startDate: '2026-01-01', daysPerWeek: 7, maxAyahPerDay: 100,
                minorReviewPagesCount: 1
            })
            .addHifz(8, { surah: 2, ayah: 1 }, { surah: 2, ayah: 100 })
            .addMinorReview(5, WindowMode.GRADUAL)
            .stopWhenCompleted().build().generatePlan();

        const reviews = plan.flatMap(day => day.events.filter(event => event.trackId === 2));
        const fullWindow = reviews.find(event => (event.data.lines ?? 0) >= 15);
        expect(fullWindow).toBeDefined();
        expect(fullWindow!.data.start.surah).toBe(2);
        expect(fullWindow!.data.end.surah).toBe(2);

        const startIdx = repo.getIndexFromLocation(fullWindow!.data.start.surah, fullWindow!.data.start.ayah, false);
        if (startIdx < repo.getIndexFromLocation(2, 100, false)) {
            const withoutOldest = repo.getLocationFromIndex(startIdx + 1, repo.getDirectionData(false).index_map);
            expect(repo.getLinesBetween(withoutOldest, fullWindow!.data.end, false)).toBeLessThan(15);
        }
    });
});
