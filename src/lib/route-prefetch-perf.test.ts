import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Route prefetch performance', () => {
  it('exposes connection-aware prefetch for tours, stays, trips, and account surfaces', () => {
    const src = readFileSync(resolve(__dirname, 'routePrefetch.ts'), 'utf8');
    expect(src).toContain('shouldPrefetchRoutes');
    expect(src).toContain('saveData');
    expect(src).toContain('prefetchStayDetailsPage');
    expect(src).toContain('prefetchListingDetailsPage');
    expect(src).toContain('prefetchWishlistPage');
    expect(src).toContain('prefetchAccountPage');
    expect(src).toContain('prefetchDestinationPage');
  });

  it('browse cards prefetch the matching detail chunk for tours and stays', () => {
    const card = readFileSync(resolve(__dirname, '../components/PublicListingBrowseCard.tsx'), 'utf8');
    expect(card).toContain('prefetchListingDetailsPage');
    expect(card).toContain("isStay ? 'stay' : 'tour'");
  });

  it('partner section prefetch respects the same Save-Data / 2G gate', () => {
    const partner = readFileSync(resolve(__dirname, 'partner-section-prefetch.ts'), 'utf8');
    expect(partner).toContain('shouldPrefetchRoutes');
  });
});
