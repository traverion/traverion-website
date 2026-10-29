import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('TravelerReviewComposeDialog multi-step journey', () => {
  it('uses submitReview with bookingId, anonymity, and modal success — not a Trips banner', () => {
    const dialog = readFileSync(resolve(__dirname, 'TravelerReviewComposeDialog.tsx'), 'utf8');
    const trips = readFileSync(resolve(__dirname, '../pages/MyBookings.tsx'), 'utf8');
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

    expect(dialog).toContain('submitReview');
    expect(dialog).toContain('bookingId');
    expect(dialog).toContain('userHasReviewedListing');
    expect(dialog).toContain('isAnonymous');
    expect(dialog).toContain('How was your experience?');
    expect(dialog).toContain('Tell us about your experience');
    expect(dialog).toContain('How would you like to post your review?');
    expect(dialog).toContain('Post anonymously');
    expect(dialog).toContain('Thank you for your review!');
    expect(dialog).toContain('Continue to My bookings');
    expect(dialog).toContain('Save changes');
    expect(dialog).toContain('Post review');
    expect(dialog).toContain('tv-review-journey-overlay');
    expect(dialog).not.toContain('Sum up your experience');

    expect(css).toContain('.tv-review-journey-overlay');
    expect(css).toMatch(/z-index:\s*10050/);

    expect(trips).toContain('TravelerReviewComposeDialog');
    expect(trips).toContain("mode: reviewedListingIds.has(b.listing_id) ? 'edit' : 'write'");
    expect(trips).not.toContain("title: 'Review submitted'");
    expect(trips).not.toMatch(
      /Write a review[\s\S]{0,280}onTourSelect\(\{\s*id:\s*b\.listing_id/
    );
  });
});
