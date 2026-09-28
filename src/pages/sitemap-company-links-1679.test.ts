import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1679: Sitemap Company matches Footer wayfinding', () => {
  it('lists About, Tours, Stays, Trips, and Saved under Company', () => {
    const src = readFileSync(resolve(__dirname, 'Sitemap.tsx'), 'utf8');
    expect(src).toContain('Phase 1679');
    const company = src.slice(src.indexOf("title: 'Company'"), src.indexOf("title: 'Work with us'"));
    expect(company).toContain("'about'");
    expect(company).toContain("'packages'");
    expect(company).toContain("'stays'");
    expect(company).toContain("'bookings'");
    expect(company).toContain("'wishlist'");
  });
});
