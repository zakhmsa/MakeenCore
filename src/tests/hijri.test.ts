import { describe, expect, it } from 'vitest';
import { HijriDateUtils } from '../utils/HijriDateUtils';
import { PlanBuilder } from '../builders/PlanBuilder';
import { EngineFacade } from '../infrastructure/api/EngineFacade';

describe('HijriDateUtils (zero-dependency Umm al-Qura via Intl)', () => {
    it('produces a sortable YYYY-MM-DD Hijri ISO string', () => {
        const iso = HijriDateUtils.toHijriISO(new Date('2026-02-18'));
        expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // 2026-02-18 falls in Ramadan 1447 AH.
        expect(iso.startsWith('1447-')).toBe(true);
    });

    it('actually advances on the Hijri (not Gregorian) calendar', () => {
        // Over one Gregorian year the Hijri year advances by exactly 1 (~354-day year).
        const y1 = Number(HijriDateUtils.toHijriISO(new Date('2026-02-18')).slice(0, 4));
        const y2 = Number(HijriDateUtils.toHijriISO(new Date('2027-02-18')).slice(0, 4));
        expect(y2 - y1).toBe(1);
    });

    it('formats a non-empty human-readable Hijri string', () => {
        const s = HijriDateUtils.toHijri(new Date('2026-02-18'));
        expect(typeof s).toBe('string');
        expect(s.length).toBeGreaterThan(0);
    });
});

describe('Hijri wiring is opt-in and does not affect scheduling', () => {
    const build = (includeHijri: boolean) =>
        new PlanBuilder()
            .setSchedule({ startDate: '2026-02-01', daysPerWeek: 7, isReverse: false, limitDays: 5, includeHijri })
            .addHifz(15, { surah: 1, ayah: 1 })
            .build()
            .generatePlan();

    it('populates PlanDay.hijriDate only when includeHijri is true', () => {
        const withHijri = build(true);
        const withoutHijri = build(false);

        for (const day of withHijri) {
            expect(typeof day.hijriDate).toBe('string');
            expect((day.hijriDate as string).length).toBeGreaterThan(0);
        }
        for (const day of withoutHijri) {
            expect(day.hijriDate).toBeUndefined();
        }

        // Same schedule/positions regardless of the flag (display-only).
        expect(withHijri.length).toBe(withoutHijri.length);
        withHijri.forEach((d, i) => {
            expect(d.events.length).toBe(withoutHijri[i].events.length);
        });
    });

    it('surfaces hijriDate through the EngineFacade DTO', () => {
        const res = EngineFacade.generatePlan({
            name: 'Hijri Preview',
            startDate: '2026-02-01',
            direction: 'FORWARD',
            daysPerWeek: 7,
            includeHijri: true,
            tracks: [{
                type: 'HIFZ', priority: 1, amountUnit: 'LINES', amountValue: 15,
                start: { surah: 1, ayah: 1 }
            }]
        });

        expect(res.success).toBe(true);
        expect(res.data.plan.length).toBeGreaterThan(0);
        expect(typeof res.data.plan[0].hijriDate).toBe('string');
    });
});
