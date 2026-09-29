import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1709: Leave a review after season ends', () => {
  it('Trips Leave a review uses tripAllowsLeaveReview not live-browse season', () => {
    const src = readFileSync(resolve(__dirname, '../pages/MyBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1709');
    expect(src).toContain('tripAllowsLeaveReview(ops)');
    expect(src).toContain('bookingEligibleForReview(b)');
    expect(src).toMatch(
      /tripView === 'past' &&\s*tripAllowsLeaveReview\(ops\) &&\s*bookingEligibleForReview\(b\)/
    );
  });

  it('TourDetails loads season-ended tours for review-eligible travelers', () => {
    const src = readFileSync(resolve(__dirname, '../pages/TourDetails.tsx'), 'utf8');
    expect(src).toContain('Phase 1709');
    expect(src).toContain('userHasCompletedBookingForListing');
    expect(src).toContain('listingHasUpcomingBookableSeason(tour)');
  });
});
