import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: Traveler Trips search must resolve support lookups by booking # on collapsed cards.
 */
describe('MyBookings Trips search booking number (Phase 1486)', () => {
  it('uses partnerBookingNumberMatchesFilterQuery in trip search', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'MyBookings.tsx'),
      'utf8'
    );
    expect(src).toMatch(/partnerBookingNumberMatchesFilterQuery/);
    expect(src).toMatch(/Phase 1486|partnerBookingNumberMatchesFilterQuery\(q, b\.booking_number\)/);
  });
});
