/**
 * HijriDateUtils
 *
 * Zero-dependency Hijri (Umm al-Qura) date formatting via the built-in `Intl` API.
 *
 * Kept deliberately SEPARATE from DateUtils: DateUtils stays purely Gregorian and
 * drives all scheduling math (working days, day advancement). This utility is a
 * *display* concern only — it never affects scheduling or working-day logic.
 *
 * Requires a JS runtime built with full ICU (default since Node 13+). On the rare
 * `small-icu` build, Intl silently falls back to the Gregorian calendar.
 *
 * The calendar is selected via the BCP-47 locale extension `-u-ca-islamic-umalqura`,
 * which avoids relying on the (newer) `calendar` option type.
 */
export class HijriDateUtils {
    private static readonly DEFAULT_LOCALE = 'ar-SA-u-ca-islamic-umalqura';
    private static defaultFormatter?: Intl.DateTimeFormat;

    /**
     * Formats a Gregorian Date as a human-readable Hijri string.
     * @param date   Gregorian date to convert.
     * @param locale Optional BCP-47 locale (must include `-u-ca-islamic-umalqura`
     *               to stay Hijri). Defaults to Arabic (Saudi).
     * @example toHijri(new Date('2026-02-18')) // "١ رمضان ١٤٤٧ هـ"
     */
    static toHijri(date: Date, locale?: string): string {
        if (locale) {
            return new Intl.DateTimeFormat(locale, {
                day: 'numeric', month: 'long', year: 'numeric'
            }).format(date);
        }
        if (!this.defaultFormatter) {
            this.defaultFormatter = new Intl.DateTimeFormat(this.DEFAULT_LOCALE, {
                day: 'numeric', month: 'long', year: 'numeric'
            });
        }
        return this.defaultFormatter.format(date);
    }

    /**
     * Sortable Hijri date as `YYYY-MM-DD` (numeric, Latin digits).
     * Useful as a stable key/column alongside the Gregorian ISO date.
     * @example toHijriISO(new Date('2026-02-18')) // "1447-09-01"
     */
    static toHijriISO(date: Date): string {
        const parts = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(date);
        const pick = (type: string) => parts.find(p => p.type === type)?.value ?? '';
        return `${pick('year')}-${pick('month')}-${pick('day')}`;
    }
}
