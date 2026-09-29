import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tripAllowsLeaveReview } from '../lib/trip-views';

describe('Phase 1731: Leave a review after listing unpublish', () => {
  it('Trips allows Leave a review for draft ops from booking-party path', () => {
    expect(tripAllowsLeaveReview({ status: 'draft' })).toBe(true);
    expect(tripAllowsLeaveReview({ status: 'published' })).toBe(true);
    const trips = readFileSync(resolve(__dirname, '../pages/MyBookings.tsx'), 'utf8');
    expect(trips).toContain('Phase 1731');
    expect(trips).toContain('tripAllowsLeaveReview(ops)');
  });

  it('TourDetails and StayDetails hydrate review-only PDP via party ops', () => {
    const tour = readFileSync(resolve(__dirname, '../pages/TourDetails.tsx'), 'utf8');
    expect(tour).toContain('Phase 1731');
    expect(tour).toContain('reviewOnlyAccess');
    expect(tour).toContain('fetchListingOpsByIds');
    expect(tour).toContain('reviewOnlyPackageFromListingOps');
    const stay = readFileSync(resolve(__dirname, '../pages/StayDetails.tsx'), 'utf8');
    expect(stay).toContain('Phase 1731');
    expect(stay).toContain('reviewOnlyAccess');
    expect(stay).toContain('fetchListingOpsByIds');
  });
});
