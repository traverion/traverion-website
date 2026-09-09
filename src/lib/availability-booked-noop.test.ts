import { describe, expect, it } from 'vitest';
import { decrementAvailabilityBooked, incrementAvailabilityBooked } from '../data/supabase-availability';

describe('listing_availability.booked mutations', () => {
  it('are no-ops — occupancy is paid + live holds', async () => {
    await expect(incrementAvailabilityBooked('any', '2026-09-11', 2)).resolves.toBe(true);
    await expect(decrementAvailabilityBooked('any', '2026-09-11', 2)).resolves.toBe(true);
  });
});
