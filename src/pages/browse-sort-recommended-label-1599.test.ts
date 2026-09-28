import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1599: browse sort recommended label', () => {
  it('Packages uses Recommended for default sort (not Catalog order)', () => {
    const src = readFileSync(resolve(__dirname, 'Packages.tsx'), 'utf8');
    expect(src).toMatch(/id:\s*'recommended',\s*label:\s*'Recommended'/);
    expect(src).not.toContain("label: 'Catalog order'");
  });

  it('Stays uses Recommended for default sort (not Catalog order)', () => {
    const src = readFileSync(resolve(__dirname, 'Stays.tsx'), 'utf8');
    expect(src).toMatch(/id:\s*'recommended',\s*label:\s*'Recommended'/);
    expect(src).not.toContain("label: 'Catalog order'");
  });
});
