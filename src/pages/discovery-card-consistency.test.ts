import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Consumer discovery card consistency', () => {
  it('DestinationPage uses compact browse cards and browse grid', () => {
    const src = readFileSync(resolve(__dirname, 'DestinationPage.tsx'), 'utf8');
    expect(src).toContain('MARKETPLACE_BROWSE_GRID_CLASS');
    expect(src).toContain('size="compact"');
    expect(src).not.toContain('size="default"');
    expect(src).toContain('destinationCoverSrc');
    expect(src).toContain('Destinations');
    expect(src).toContain('parentCountry');
    expect(src).not.toContain('rounded-full bg-white/15');
  });

  it('Home recommendations use shared cards without a featured banner', () => {
    const src = readFileSync(resolve(__dirname, 'Home.tsx'), 'utf8');
    expect(src).toContain('HOME_DISCOVERY_GRID_CLASS');
    expect(src).toContain('displayedListings.map');
    expect(src).not.toContain('Featured tour');
    expect(src).not.toContain('h-[12rem] sm:h-[15rem]');
    expect(src).toContain('Continue exploring');
    expect(src).not.toContain('Ranked from your recent browsing');
    expect(src).not.toContain('For operators');
    expect(src).toContain('destinationCoverSrc');
  });

  it('PublicListingBrowseCard omits participant price breakdowns', () => {
    const src = readFileSync(resolve(__dirname, '../components/PublicListingBrowseCard.tsx'), 'utf8');
    expect(src).not.toContain('summary ?');
    expect(src).toContain('browseDateIso');
    expect(src).toContain('partySize');
  });

  it('wishlist heart is a white outlined/filled icon without a circular chip', () => {
    const src = readFileSync(resolve(__dirname, '../components/PublicListingBrowseCard.tsx'), 'utf8');
    expect(src).toContain('h-[22px] w-[22px]');
    expect(src).toContain('fill-white');
    expect(src).toContain('fill-transparent');
    expect(src).toContain('drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]');
    expect(src).toContain('hover:scale-105');
    expect(src).not.toContain('rounded-full bg-white/92');
    expect(src).not.toContain('fill-finland text-finland');
  });

  it('Packages passes search date into card pricing', () => {
    const src = readFileSync(resolve(__dirname, 'Packages.tsx'), 'utf8');
    expect(src).toContain('browseDateIso={filterDate');
    expect(src).toContain('partySize=');
  });
});
