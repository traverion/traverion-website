import { describe, expect, it } from 'vitest';
import { isListingOwnerSelfBook } from './listing-self-book';

describe('listing-self-book (Phase 1147)', () => {
  it('detects owner self-book', () => {
    expect(isListingOwnerSelfBook('u1', 'u1')).toBe(true);
    expect(isListingOwnerSelfBook('u1', 'u2')).toBe(false);
    expect(isListingOwnerSelfBook(null, 'u1')).toBe(false);
    expect(isListingOwnerSelfBook('u1', '')).toBe(false);
  });
});
