import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer C: tour/stay browse catalog blocks are named regions for screen readers
 * (DestinationPage tour/stay sections parity).
 */
describe('MarketplaceBrowseShell catalog landmarks', () => {
  it('wraps results in a section labelled by the page heading', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'MarketplaceBrowseShell.tsx'),
      'utf8'
    );
    expect(src).toMatch(/<section className="min-w-0" aria-labelledby=\{headingId\}>/);
    expect(src).toMatch(/id=\{headingId\}/);
  });

  it('Packages and Stays pass stable heading ids into the shell', () => {
    const pagesDir = join(dirname(fileURLToPath(import.meta.url)), '../../pages');
    const packages = readFileSync(join(pagesDir, 'Packages.tsx'), 'utf8');
    const stays = readFileSync(join(pagesDir, 'Stays.tsx'), 'utf8');
    expect(packages).toMatch(/headingId="tours-heading"/);
    expect(stays).toMatch(/headingId="stays-heading"/);
  });
});
