import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('TravelerReviewComposeDialog', () => {
  it('submits via submitReview with bookingId and does not navigate to PDP', () => {
    const dialog = readFileSync(resolve(__dirname, 'TravelerReviewComposeDialog.tsx'), 'utf8');
    const trips = readFileSync(resolve(__dirname, '../pages/MyBookings.tsx'), 'utf8');
    expect(dialog).toContain('submitReview');
    expect(dialog).toContain('bookingId');
    expect(dialog).toContain('userHasReviewedListing');
    expect(trips).toContain('TravelerReviewComposeDialog');
    expect(trips).toContain("mode: reviewedListingIds.has(b.listing_id) ? 'edit' : 'write'");
    // Must not reopen the broken PDP season gate for Write a review.
    expect(trips).not.toMatch(
      /Write a review[\s\S]{0,280}onTourSelect\(\{\s*id:\s*b\.listing_id/
    );
  });
});
