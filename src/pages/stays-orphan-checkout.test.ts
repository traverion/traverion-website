import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: stay browse must not keep orphan check-out without check-in (URL, chips, Search apply).
 * Phase 1435 cleared both when check-in is cleared in the date field; these paths must match.
 */
describe('Stays orphan check-out guard', () => {
  it('fail-closes orphan checkout in URL sync, parse, chips, and apply', () => {
    const stays = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Stays.tsx'), 'utf8');
    expect(stays).toMatch(/if \(checkOut && checkIn\) p\.set\('checkout'/);
    expect(stays).toMatch(/checkIn && checkOutRaw/);
    const bar = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../components/marketplace/MarketplaceSearchBar.tsx'),
      'utf8'
    );
    expect(bar).toMatch(/!values\.date\.trim\(\)/);
  });
});
