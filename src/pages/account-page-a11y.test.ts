import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer C: Account hub exposes a named region from its h1 (MyBookings Trips / Wishlist Saved parity).
 */
describe('AccountPage landmarks', () => {
  it('labels the account hub region from the page h1', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'AccountPage.tsx'),
      'utf8'
    );
    expect(src).toMatch(/id=\{ACCOUNT_HEADING_ID\}/);
    expect(src).toMatch(/<section aria-labelledby=\{ACCOUNT_HEADING_ID\}>/);
  });
});
