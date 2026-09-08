import { describe, expect, it } from 'vitest';
import { isStayListingDeepLinkPath, isTourListingDeepLinkPath, parsePathname } from './appRouting';

const TOUR_ID = 'c2d25217-84f0-46d4-8eaa-83949143fa06';
const STAY_ID = '83f88255-63ef-4824-93a2-89cc13244567';

describe('tour listing deep links', () => {
  it('treats /tour/<uuid> and /tours/<uuid> as the catalog deep-link, not 404', () => {
    expect(parsePathname(`/tour/${TOUR_ID}`).page).toBe('packages');
    expect(parsePathname(`/tours/${TOUR_ID}`).page).toBe('packages');
    expect(parsePathname(`/tours/${TOUR_ID}/`).page).toBe('packages');
    expect(isTourListingDeepLinkPath(`/tour/${TOUR_ID}`)).toBe(true);
    expect(isTourListingDeepLinkPath(`/tours/${TOUR_ID}`)).toBe(true);
  });

  it('keeps /tours as the catalog and rejects a non-uuid tours path', () => {
    expect(parsePathname('/tours').page).toBe('packages');
    expect(parsePathname('/tours/not-a-listing').page).toBe('not-found');
    expect(isTourListingDeepLinkPath('/tours')).toBe(false);
  });
});

describe('stay listing deep links', () => {
  it('treats /stay/<uuid> and /stays/<uuid> as the catalog deep-link, not 404', () => {
    expect(parsePathname(`/stay/${STAY_ID}`).page).toBe('stays');
    expect(parsePathname(`/stays/${STAY_ID}`).page).toBe('stays');
    expect(parsePathname(`/stays/${STAY_ID}/`).page).toBe('stays');
    expect(isStayListingDeepLinkPath(`/stay/${STAY_ID}`)).toBe(true);
    expect(isStayListingDeepLinkPath(`/stays/${STAY_ID}`)).toBe(true);
  });

  it('keeps /stays as the catalog and rejects a non-uuid stays path', () => {
    expect(parsePathname('/stays').page).toBe('stays');
    expect(parsePathname('/stays/not-a-listing').page).toBe('not-found');
    expect(isStayListingDeepLinkPath('/stays')).toBe(false);
  });
});
