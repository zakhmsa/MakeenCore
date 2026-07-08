import { describe, expect, it } from 'vitest';
import { PlanBuilder } from '../builders/PlanBuilder';
import { WindowMode } from '../core/constants';
import { PlanDay } from '../core/types';

/**
 * Snapshot / resume: a student stops after N days and returns later.
 * The engine must resume from the REAL saved state (incl. history), producing
 * exactly the days it would have produced in one continuous run.
 */
describe('Snapshot / resume of track state', () => {
    const buildManager = (startDate: string, limitDays: number) =>
        new PlanBuilder()
            .setSchedule({ startDate, daysPerWeek: 7, isReverse: false, limitDays })
            .addHifz(15, { surah: 1, ayah: 1 })
            .addMinorReview(3, WindowMode.GRADUAL) // depends on history → the real test
            .build();

    const sameEvents = (a: PlanDay, b: PlanDay) => {
        expect(a.date.toISOString()).toBe(b.date.toISOString());
        expect(a.events.length).toBe(b.events.length);
        a.events.forEach((ev, j) => {
            const other = b.events[j];
            expect(ev.trackId).toBe(other.trackId);
            expect(ev.data.start.surah).toBe(other.data.start.surah);
            expect(ev.data.start.ayah).toBe(other.data.start.ayah);
            expect(ev.data.end.surah).toBe(other.data.end.surah);
            expect(ev.data.end.ayah).toBe(other.data.end.ayah);
            expect(ev.data.lines).toBe(other.data.lines);
        });
    };

    it('resumed plan matches the tail of a continuous plan (history preserved)', () => {
        // 1. Continuous 20-day run = ground truth.
        const full = buildManager('2026-01-01', 20).generatePlan();

        // 2. Run only the first 10 days, then snapshot.
        const m1 = buildManager('2026-01-01', 10);
        m1.generatePlan();
        const snap = m1.exportSnapshot();

        // Snapshot must carry FULL history (not just currentIdx).
        expect(snap.tracks[1].history.length).toBe(10);
        expect(snap.tracks[2]).toBeDefined();

        // 3. Resume: rebuild the same plan at the real resume date, import, continue.
        const m2 = buildManager('2026-01-11', 10);
        m2.importSnapshot(snap);
        const resumed = m2.generatePlan();

        // 4. The resumed 10 days must equal days 11..20 of the continuous run.
        expect(resumed.length).toBe(10);
        for (let i = 0; i < 10; i++) {
            sameEvents(resumed[i], full[10 + i]);
        }
    });

    it('a snapshot missing history would break the minor review (guard the invariant)', () => {
        // Run 10 days and snapshot, then deliberately wipe history and resume.
        const m1 = buildManager('2026-01-01', 10);
        m1.generatePlan();
        const good = m1.exportSnapshot();

        const full = buildManager('2026-01-01', 12).generatePlan();

        // Correct resume (with history) reproduces day 11.
        const mGood = buildManager('2026-01-11', 2);
        mGood.importSnapshot(good);
        const okDay = mGood.generatePlan()[0];
        sameEvents(okDay, full[10]);

        // Broken resume (history wiped) must NOT reproduce the minor review of day 11,
        // proving history is load-bearing for resume correctness.
        const broken = { ...good, tracks: { ...good.tracks } };
        broken.tracks[1] = { ...good.tracks[1], history: [] };
        broken.tracks[2] = { ...good.tracks[2], history: [] };

        const mBroken = buildManager('2026-01-11', 2);
        mBroken.importSnapshot(broken);
        const brokenDay = mBroken.generatePlan()[0];

        const fullMinor = full[10].events.find(e => e.trackId === 2);
        const brokenMinor = brokenDay.events.find(e => e.trackId === 2);
        // Ground truth has a minor-review event on day 11; the broken resume loses/changes it.
        expect(fullMinor).toBeDefined();
        const changed =
            !brokenMinor ||
            brokenMinor.data.start.surah !== fullMinor!.data.start.surah ||
            brokenMinor.data.start.ayah !== fullMinor!.data.start.ayah ||
            brokenMinor.data.end.ayah !== fullMinor!.data.end.ayah;
        expect(changed).toBe(true);
    });
});
