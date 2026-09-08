import { describe, expect, it } from 'vitest';
import { isTourListingDeepLinkPath, parsePathname } from './appRouting';

const TOUR_ID = 'c2d25217-84f0-46d4-8eaa-83949143fa06';

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
