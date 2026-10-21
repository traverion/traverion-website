import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Premium hero search bar', () => {
  it('uses Where to?, Dates, Travelers chrome with icons and Search CTA', () => {
    const src = readFileSync(resolve(__dirname, 'MarketplaceSearchBar.tsx'), 'utf8');
    expect(src).toContain('Where to?');
    expect(src).toContain('City, region or tour');
    expect(src).toContain("label={isStay ? 'Check-in' : 'Dates'}");
    expect(src).toContain("placeholder={isStay ? 'Add date' : 'Any dates'}");
    expect(src).toContain("label={isStay ? 'Guests' : 'Travelers'}");
    expect(src).toContain('MapPin');
    expect(src).toContain('MarketplaceSearchStack');
  });

  it('Home mounts stacked mobile card and wide desktop pill', () => {
    const home = readFileSync(resolve(__dirname, '../../pages/Home.tsx'), 'utf8');
    expect(home).toContain('MarketplaceSearchStack');
    expect(home).toContain('max-w-5xl');
    expect(home).toContain('rounded-full bg-finland');
    expect(home).toContain("Search");
  });
});
