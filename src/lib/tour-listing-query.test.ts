import { describe, expect, it } from 'vitest';
import { resolveTourListingIdFromSearch } from './tour-listing-query';

const ID = '1807368c-ae24-4ccd-ba63-2aa72413c2f6';

describe('resolveTourListingIdFromSearch', () => {
  it('prefers canonical tour= over legacy uuid=', () => {
    expect(resolveTourListingIdFromSearch(`?tour=${ID}&uuid=00000000-0000-0000-0000-000000000001`)).toBe(
      ID
    );
  });

  it('accepts legacy uuid= when tour= is absent', () => {
    expect(resolveTourListingIdFromSearch(`?uuid=${ID}`)).toBe(ID);
    expect(resolveTourListingIdFromSearch(`uuid=${ID}&book=1`)).toBe(ID);
  });

  it('rejects non-uuid values', () => {
    expect(resolveTourListingIdFromSearch('?tour=not-a-listing')).toBeNull();
    expect(resolveTourListingIdFromSearch('?uuid=abc')).toBeNull();
    expect(resolveTourListingIdFromSearch('')).toBeNull();
  });
});
