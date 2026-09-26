import { describe, expect, it } from 'vitest';
import {
  formatGuestSummary,
  guestCountsFromTotal,
  guestTotalString,
} from './TravelerGuestPicker';

describe('TravelerGuestPicker helpers', () => {
  it('parses totals into adults-only counts', () => {
    expect(guestCountsFromTotal('3')).toEqual({ adults: 3, children: 0 });
    expect(guestCountsFromTotal('')).toEqual({ adults: 0, children: 0 });
  });

  it('formats summaries without inventing party size', () => {
    expect(formatGuestSummary({ adults: 2, children: 0 }, 'travelers')).toBe('2 travelers');
    expect(formatGuestSummary({ adults: 2, children: 1 }, 'guests')).toBe('2 adults · 1 child');
    expect(formatGuestSummary({ adults: 0, children: 0 }, 'travelers')).toBe('Add travelers');
  });

  it('serializes totals for search URL state', () => {
    expect(guestTotalString({ adults: 2, children: 1 })).toBe('3');
    expect(guestTotalString({ adults: 0, children: 0 })).toBe('');
  });
});
