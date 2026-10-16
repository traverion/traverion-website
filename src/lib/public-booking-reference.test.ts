import { describe, expect, it } from 'vitest';
import { travelerPublicBookingReference } from './public-booking-reference';

describe('traveler public booking reference', () => {
  it('accepts a stable TV code and rejects sequential numbers', () => {
    expect(travelerPublicBookingReference('tv-ab23cd4e')).toBe('TV-AB23CD4E');
    expect(travelerPublicBookingReference('#1')).toBeNull();
    expect(travelerPublicBookingReference('1')).toBeNull();
    expect(travelerPublicBookingReference('TV-OOOOOOOO')).toBeNull();
    expect(travelerPublicBookingReference(null)).toBeNull();
  });
});
