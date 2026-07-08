import { describe, expect, it } from 'vitest';
import { QuranRepository } from '../core/QuranRepository';
import { ConstraintManager } from '../constraints/ConstraintManager';
import { HorizonConstraint } from '../constraints/HorizonConstraint';
import { PlanBuilder } from '../builders/PlanBuilder';
import { ITrack } from '../tracks/BaseTrack';

function fakeTrack(id: number, currentIdx: number): ITrack {
    return {
        id,
        state: { currentIdx, history: [], isCompleted: false, extraData: {} }
    } as unknown as ITrack;
}

describe('HorizonConstraint (configurable sliding floor)', () => {
    const repo = QuranRepository.getInstance();
    const cum = repo.getDirectionData(false).cumulative_array;

    it('floor sits ~horizonLines behind the target front', () => {
        const HORIZON = 30;
        const targetIdx = 200;
        const source = fakeTrack(3, 0);
        const target = fakeTrack(1, targetIdx);
        const all = new Map<number, ITrack>([[1, target], [3, source]]);

        const c = new HorizonConstraint(3, 1, HORIZON, repo, false);
        const floor = c.getFloorIndex(source, all);

        expect(floor).not.toBeNull();
        const frontCum = cum[targetIdx - 1];
        const floorCum = floor! > 0 ? cum[floor! - 1] : 0;
        const gap = frontCum - floorCum;

        // First index whose cumulative >= front-HORIZON → gap is just over HORIZON,
        // bounded above by one ayah's line span (< a few lines).
        expect(gap).toBeGreaterThanOrEqual(HORIZON);
        expect(gap).toBeLessThanOrEqual(HORIZON + 5);
    });

    it('imposes no floor before progress exceeds the horizon', () => {
        const source = fakeTrack(3, 0);
        const target = fakeTrack(1, 3); // ~2.5 cumulative lines memorized
        const all = new Map<number, ITrack>([[1, target], [3, source]]);

        const c = new HorizonConstraint(3, 1, 30, repo, false);
        expect(c.getFloorIndex(source, all)).toBeNull();
    });

    it('is a FLOOR not a ceiling — getLimitIndex stays null, manager aggregates via getFloorIndex', () => {
        const source = fakeTrack(3, 0);
        const target = fakeTrack(1, 200);
        const all = new Map<number, ITrack>([[1, target], [3, source]]);

        const cm = new ConstraintManager();
        const c = new HorizonConstraint(3, 1, 30, repo, false);
        cm.addConstraint(c);

        // Horizon contributes no ceiling…
        expect(cm.getBarrierIndex(source, all)).toBeNull();
        // …but does contribute a floor.
        expect(cm.getFloorIndex(source, all)).toBe(c.getFloorIndex(source, all));
    });

    it('keeps the major review inside the recent window (and proves it constrains vs. no-horizon)', () => {
        const HORIZON = 60;
        const TOL = 16; // one page + rounding slack

        const buildPlan = (horizonLines?: number) =>
            new PlanBuilder()
                .setSchedule({ startDate: '2026-01-01', daysPerWeek: 7, isReverse: false, limitDays: 45 })
                .addHifz(15, { surah: 1, ayah: 1 })
                .addMajorReview(15, { surah: 1, ayah: 1 }, undefined,
                    horizonLines !== undefined ? { horizonLines } : undefined)
                .build()
                .generatePlan();

        const idxOf = (loc: { surah: number; ayah: number }) =>
            repo.getIndexFromLocation(loc.surah, loc.ayah, false);

        const countViolations = (plan: ReturnType<typeof buildPlan>) => {
            let majorEvents = 0;
            let violations = 0;
            for (const day of plan) {
                const hifz = day.events.find(e => e.trackId === 1);
                const major = day.events.find(e => e.trackId === 3);
                if (!hifz || !major) continue;
                majorEvents++;
                const frontCum = cum[idxOf(hifz.data.end)];
                const startIdx = idxOf(major.data.start);
                const startCum = startIdx > 0 ? cum[startIdx - 1] : 0;
                if (startCum < frontCum - HORIZON - TOL) violations++;
            }
            return { majorEvents, violations };
        };

        const withHorizon = countViolations(buildPlan(HORIZON));
        const withoutHorizon = countViolations(buildPlan(undefined));

        // The horizon plan actually produced review events…
        expect(withHorizon.majorEvents).toBeGreaterThan(0);
        // …that NEVER reach further back than the sliding window allows…
        expect(withHorizon.violations).toBe(0);
        // …whereas the unconstrained plan DOES reach back past that window (proves it's not vacuous).
        expect(withoutHorizon.violations).toBeGreaterThan(0);
    });
});
