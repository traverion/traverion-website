import { describe, expect, it } from 'vitest';
import { csvSafeCell, isCsvFormulaTrigger } from './csv-export';

/** The three pre-fix local implementations this migration replaced, kept
 * here only to PROVE the gap they shared -- never imported by app code. */
function legacyBookingsEscape(value: unknown): string {
  const s = String(value ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
function legacyPickupEscape(s: string): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}
function legacyEarningsEscape(v: string | number | null | undefined): string {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// No embedded quotes/commas, so each legacy escaper's output is byte-exact
// predictable -- keeps the "gap" assertions simple and unambiguous.
const FORMULA_PAYLOADS_NO_QUOTES = [
  '=cmd|\'/c calc\'!A0',
  '+cmd|\'/c calc\'!A0',
  '-2+3+cmd|\' /c calc\'!A0',
  '@SUM(1+1)*cmd|\'/c calc\'!A0',
];

// Also includes a realistic payload with embedded quotes/commas, exercised
// only through behavioral (not exact-string) assertions below.
const ALL_FORMULA_PAYLOADS = [
  ...FORMULA_PAYLOADS_NO_QUOTES,
  '=HYPERLINK("https://evil.example/steal","Click")',
];

describe('csvSafeCell (Phase 591 CSV/formula injection fix)', () => {
  it('GAP CONFIRMED: all three legacy per-page escape functions passed formula payloads through with the trigger character still leading the cell content', () => {
    for (const payload of FORMULA_PAYLOADS_NO_QUOTES) {
      // Bookings/Earnings legacy escapers: no comma/quote/newline in these
      // payloads, so they pass the value through completely untouched --
      // still spreadsheet-executable verbatim.
      expect(legacyBookingsEscape(payload)).toBe(payload);
      expect(legacyEarningsEscape(payload)).toBe(payload);
      expect(isCsvFormulaTrigger(legacyBookingsEscape(payload))).toBe(true);

      // Pickup Planner's legacy escaper always CSV-quote-wraps, but quoting
      // is a CSV *parsing* concern, not a spreadsheet *formula* concern --
      // once a spreadsheet app parses the quoted field back out to
      // `payload`, it still evaluates that content as a formula. Confirm
      // the legacy output carries the trigger character as the first
      // character of the wrapped content (no neutralizing prefix added).
      const legacyPickupOut = legacyPickupEscape(payload);
      expect(legacyPickupOut).toBe(`"${payload}"`);
      expect(isCsvFormulaTrigger(payload)).toBe(true);
    }
  });

  it('detects every documented formula/DDE trigger character', () => {
    expect(isCsvFormulaTrigger('=1+1')).toBe(true);
    expect(isCsvFormulaTrigger('+1')).toBe(true);
    expect(isCsvFormulaTrigger('-1')).toBe(true);
    expect(isCsvFormulaTrigger('@SUM(1)')).toBe(true);
    expect(isCsvFormulaTrigger('\tHello')).toBe(true);
    expect(isCsvFormulaTrigger('\rHello')).toBe(true);
    expect(isCsvFormulaTrigger('Hello')).toBe(false);
    expect(isCsvFormulaTrigger('')).toBe(false);
  });

  it('neutralizes every formula payload with a leading single quote', () => {
    for (const payload of ALL_FORMULA_PAYLOADS) {
      const safe = csvSafeCell(payload);
      // Whatever CSV-syntax quoting was applied, the content must now
      // start with our protective "'" immediately followed by the
      // original (now-inert) payload -- never the bare trigger character.
      const contentStart = safe.startsWith('"') ? safe.slice(1) : safe;
      expect(contentStart.startsWith("'" + payload[0])).toBe(true);
      expect(isCsvFormulaTrigger(safe)).toBe(false);
    }
  });

  it('a real guest_name attack (verbatim from checkout, no other sanitization) is neutralized end to end', () => {
    const guestName = "=cmd|'/c calc'!A0";
    const safe = csvSafeCell(guestName);
    expect(safe).toBe(`'${guestName}`);
    expect(isCsvFormulaTrigger(safe)).toBe(false);
  });

  it('preserves existing CSV syntax escaping for quotes, commas, and newlines (no regression vs. the legacy escapers)', () => {
    expect(csvSafeCell('Alice, "the traveler"')).toBe('"Alice, ""the traveler"""');
    expect(csvSafeCell('line one\nline two')).toBe('"line one\nline two"');
    expect(csvSafeCell('plain text')).toBe('plain text');
    expect(csvSafeCell(null)).toBe('');
    expect(csvSafeCell(undefined)).toBe('');
    expect(csvSafeCell(42)).toBe('42');
  });

  it('a legitimate value that happens to start with a trigger character is preserved (just force-quoted), not corrupted or dropped', () => {
    expect(csvSafeCell('-5C please keep cool')).toBe("'-5C please keep cool");
    expect(csvSafeCell('@Home delivery')).toBe("'@Home delivery");
  });

  it('does not double-escape a value that already needed comma/quote quoting AND starts with a trigger char', () => {
    const value = '=SUM(1,2), "total"';
    const safe = csvSafeCell(value);
    // Must be quote-wrapped (contains a comma and a quote) with the
    // formula-neutralizing prefix applied to the underlying text first.
    expect(safe).toBe('"\'=SUM(1,2), ""total"""');
  });
});
