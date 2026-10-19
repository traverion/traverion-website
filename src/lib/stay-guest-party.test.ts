import { describe, expect, it } from 'vitest';
import {
  countedStayGuests,
  formatStayGuestPartySummary,
  normalizeStayGuestPolicy,
  stayGuestAgeCopy,
  validateStayGuestParty,
} from './stay-guest-party';

describe('stay guest party', () => {
  it('uses adults 18+, children 2–17, and infants under 2 unless the supplier changes them', () => {
    const policy = normalizeStayGuestPolicy(undefined);
    expect(policy).toEqual({
      adultMinAge: 18,
      childMinAge: 2,
      infantsCountInOccupancy: false,
      maxInfants: null,
    });
    expect(stayGuestAgeCopy(policy).summary).toContain('Children 2–17');
    expect(stayGuestAgeCopy({ ...policy, childMinAge: 3, adultMinAge: 16 }).child).toBe('Children 3–15');
  });

  it('does not let age bands overlap', () => {
    const policy = normalizeStayGuestPolicy({ adultMinAge: 16, childMinAge: 16, infantsCountInOccupancy: false });
    expect(policy.childMinAge).toBe(15);
  });

  it('rejects five adults and four children when eight guests is the maximum', () => {
    const result = validateStayGuestParty({ adults: 5, children: 4, infants: 0 }, undefined, 8);
    expect(result.ok).toBe(false);
  });

  it('does not count infants toward occupancy unless the supplier says so', () => {
    const open = validateStayGuestParty({ adults: 8, children: 0, infants: 2 }, undefined, 8);
    expect(open.ok).toBe(true);
    if (open.ok) expect(open.counted).toBe(8);
    expect(countedStayGuests({ adults: 8, children: 0, infants: 2 }, { infantsCountInOccupancy: true, adultMinAge: 18, childMinAge: 2, maxInfants: null })).toBe(10);
    const counted = validateStayGuestParty(
      { adults: 8, children: 0, infants: 1 },
      { infantsCountInOccupancy: true, adultMinAge: 18, childMinAge: 2, maxInfants: null },
      8
    );
    expect(counted.ok).toBe(false);
  });

  it('stores a category breakdown without treating infants as a priced extra', () => {
    const result = validateStayGuestParty({ adults: 2, children: 1, infants: 1 }, undefined, 8);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakdown.map((row) => [row.label, row.quantity, row.unitPrice])).toEqual([
      ['Adult', 2, 0],
      ['Child', 1, 0],
      ['Infant', 1, 0],
    ]);
  });

  it('formats a compact guests summary for the booking panel trigger', () => {
    expect(formatStayGuestPartySummary({ adults: 0, children: 0, infants: 0 })).toBe('Add guests');
    expect(formatStayGuestPartySummary({ adults: 2, children: 0, infants: 0 })).toBe('2 adults');
    expect(formatStayGuestPartySummary({ adults: 1, children: 1, infants: 1 })).toBe(
      '1 adult · 1 child · 1 infant'
    );
  });
});
