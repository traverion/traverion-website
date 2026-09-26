import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearTravelerInterestSignals,
  recordTravelerInterest,
  readTravelerInterestSignals,
  scoreListingFromInterest,
  sortListingsByInterest,
  topDestinationInterestLabel,
} from './traveler-interest';

describe('traveler interest signals', () => {
  beforeEach(() => {
    clearTravelerInterestSignals();
  });

  it('records and reads first-party signals without inventing entries', () => {
    expect(readTravelerInterestSignals()).toEqual([]);
    recordTravelerInterest({ kind: 'destination_view', key: 'Rovaniemi', family: 'destination' });
    recordTravelerInterest({ kind: 'listing_view', key: 'abc', family: 'tour' });
    const rows = readTravelerInterestSignals();
    expect(rows).toHaveLength(2);
    expect(rows[0].key).toBe('abc');
    expect(rows[1].key).toBe('rovaniemi');
  });

  it('ranks listings with destination affinity above untouched inventory', () => {
    recordTravelerInterest({ kind: 'destination_view', key: 'rovaniemi', family: 'destination' });
    recordTravelerInterest({ kind: 'destination_view', key: 'rovaniemi', family: 'destination' });
    const signals = readTravelerInterestSignals();
    const a = scoreListingFromInterest({
      listingId: '1',
      city: 'Rovaniemi',
      family: 'tour',
      signals,
    });
    const b = scoreListingFromInterest({
      listingId: '2',
      city: 'Lisbon',
      family: 'tour',
      signals,
    });
    expect(a).toBeGreaterThan(b);
    expect(topDestinationInterestLabel(signals)?.toLowerCase()).toContain('rovaniemi');
  });

  it('preserves stable order when scores are equal', () => {
    const ranked = sortListingsByInterest([{ id: 'a' }, { id: 'b' }, { id: 'c' }], () => 0);
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});
