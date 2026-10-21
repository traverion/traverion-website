import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1653: Home mobile search safe-area padding', () => {
  it('pads search actions for the home indicator', () => {
    const home = readFileSync(resolve(__dirname, 'Home.tsx'), 'utf8');
    expect(home).toContain('home-mobile-search-dialog');
    expect(home).toContain('MarketplaceSearchStack');
    const bar = readFileSync(
      resolve(__dirname, '../components/marketplace/MarketplaceSearchBar.tsx'),
      'utf8'
    );
    expect(bar).toContain('Phase 1653');
    expect(bar).toContain('env(safe-area-inset-bottom)');
  });
});
