import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('public tour occupancy coalescing', () => {
  it('caches short-TTL inflight for PDP availability RPCs', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-availability.ts'), 'utf8');
    expect(src).toContain('paidGuestsByDayCache');
    expect(src).toContain('paidGuestsBySlotCache');
    expect(src).toContain('confirmedDeparturesCache');
    expect(src).toContain('listingAvailabilityCache');
    expect(src).toContain('invalidatePublishedTourOccupancyCache');
  });
});
