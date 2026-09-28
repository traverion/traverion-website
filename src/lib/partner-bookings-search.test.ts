import { describe, expect, it } from 'vitest';
import { partnerBookingNumberMatchesFilterQuery } from './partner-bookings-search';

describe('partnerBookingNumberMatchesFilterQuery (Phase 1484)', () => {
  it('matches exact booking numbers with or without hash', () => {
    expect(partnerBookingNumberMatchesFilterQuery('42', 42)).toBe(true);
    expect(partnerBookingNumberMatchesFilterQuery('#42', 42)).toBe(true);
    expect(partnerBookingNumberMatchesFilterQuery('  #42  ', 42)).toBe(true);
  });

  it('does not substring-match longer numbers', () => {
    expect(partnerBookingNumberMatchesFilterQuery('4', 42)).toBe(false);
    expect(partnerBookingNumberMatchesFilterQuery('420', 42)).toBe(false);
  });

  it('ignores non-numeric guest search text', () => {
    expect(partnerBookingNumberMatchesFilterQuery('anna', 19)).toBe(false);
    expect(partnerBookingNumberMatchesFilterQuery('#abc', 19)).toBe(false);
  });
});
