import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS_REVIEW_GUEST_NAME,
  displayReviewGuestName,
  normalizeReviewCommentForSubmit,
  publicReviewGuestName,
  ratingAdjective,
  REVIEW_COMMENT_MAX_CHARS,
  reviewIdentityFromRow,
  supplierReviewCustomerName,
} from './review-public-identity';

describe('review-public-identity', () => {
  it('maps rating adjectives', () => {
    expect(ratingAdjective(5)).toBe('Excellent');
    expect(ratingAdjective(0)).toBeNull();
  });

  it('builds public guest names without inventing', () => {
    expect(publicReviewGuestName({ isAnonymous: true, displayName: 'Miro' })).toBe(
      ANONYMOUS_REVIEW_GUEST_NAME
    );
    expect(publicReviewGuestName({ isAnonymous: false, displayName: 'Miro V' })).toBe('Miro V');
    expect(publicReviewGuestName({ isAnonymous: false, displayName: '  ' })).toBe('Guest');
  });

  it('detects identity preference from stored rows', () => {
    expect(reviewIdentityFromRow({ is_anonymous: true, guest_name: 'Miro' })).toBe('anonymous');
    expect(reviewIdentityFromRow({ is_anonymous: false, guest_name: ANONYMOUS_REVIEW_GUEST_NAME })).toBe(
      'anonymous'
    );
    expect(reviewIdentityFromRow({ is_anonymous: false, guest_name: 'Ada' })).toBe('named');
  });

  it('presents anonymous reviews without the stored personal name', () => {
    expect(displayReviewGuestName({ is_anonymous: true, guest_name: 'Miro' })).toBe(
      ANONYMOUS_REVIEW_GUEST_NAME
    );
    expect(displayReviewGuestName({ is_anonymous: false, guest_name: 'Ada' })).toBe('Ada');
  });

  it('shows booking customer name to suppliers even when the public label is anonymous', () => {
    expect(
      supplierReviewCustomerName({
        is_anonymous: true,
        guest_name: ANONYMOUS_REVIEW_GUEST_NAME,
        booking_guest_name: 'Review Notify E2E Traveler',
      })
    ).toBe('Review Notify E2E Traveler');
    expect(
      supplierReviewCustomerName({
        is_anonymous: false,
        guest_name: 'Ada',
        booking_guest_name: null,
      })
    ).toBe('Ada');
    expect(
      supplierReviewCustomerName({
        is_anonymous: true,
        guest_name: ANONYMOUS_REVIEW_GUEST_NAME,
        booking_guest_name: null,
      })
    ).toBe('Traveler');
  });

  it('allows empty comments and enforces the 500 char limit', () => {
    expect(normalizeReviewCommentForSubmit('')).toEqual({ ok: true, comment: '' });
    expect(normalizeReviewCommentForSubmit('  nice  ')).toEqual({ ok: true, comment: 'nice' });
    const long = 'x'.repeat(REVIEW_COMMENT_MAX_CHARS + 1);
    expect(normalizeReviewCommentForSubmit(long).ok).toBe(false);
    const existing = 'y'.repeat(REVIEW_COMMENT_MAX_CHARS + 40);
    expect(
      normalizeReviewCommentForSubmit(existing, {
        allowExistingOverLimit: true,
        previousComment: existing,
      })
    ).toEqual({ ok: true, comment: existing });
  });
});
