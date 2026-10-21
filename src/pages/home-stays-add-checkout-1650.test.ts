import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1650: Home stays search Add checkout chip', () => {
  it('exposes check-out when searching stays from Home', () => {
    const home = readFileSync(resolve(__dirname, 'Home.tsx'), 'utf8');
    // Phase 1650: stay search must collect checkout (not check-in alone).
    expect(home).toContain("searchFamily === 'stays'");
    expect(home).toContain('failCloseOrphanStayCheckout');
    expect(home).toContain("params.set('checkout'");
    // Phase 1650: stay search must collect checkout (not check-in alone).
    expect(home).toContain('goToStays');
    const bar = readFileSync(
      resolve(__dirname, '../components/marketplace/MarketplaceSearchBar.tsx'),
      'utf8'
    );
    expect(bar).toContain('label="Check-out"');
    expect(bar).toContain('placeholder="Add date"');
  });
});
