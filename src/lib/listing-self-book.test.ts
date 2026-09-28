import { describe, expect, it } from 'vitest';
import { isListingOwnerSelfBook, LISTING_SELF_BOOK_CHECK_FAILED } from './listing-self-book';

describe('listing-self-book (Phase 1147 / 1164 / 1307)', () => {
  it('detects owner self-book', () => {
    expect(isListingOwnerSelfBook('u1', 'u1')).toBe(true);
    expect(isListingOwnerSelfBook('u1', 'u2')).toBe(false);
    expect(isListingOwnerSelfBook(null, 'u1')).toBe(false);
    expect(isListingOwnerSelfBook('u1', '')).toBe(false);
  });

  it('exposes fail-closed copy when eligibility cannot be verified', () => {
    expect(LISTING_SELF_BOOK_CHECK_FAILED.length).toBeGreaterThan(20);
    expect(LISTING_SELF_BOOK_CHECK_FAILED.toLowerCase()).toContain('eligibility');
  });
});
