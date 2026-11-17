import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1601: browse cards show marketplace tag pills', () => {
  it('Packages keeps tour catalog cards uncluttered (P9.27)', () => {
    const src = readFileSync(resolve(__dirname, 'Packages.tsx'), 'utf8');
    expect(src).toContain('hideFamilyChip');
    expect(src).not.toMatch(/showTagPills\s*\n/);
  });

  it('Home tour discovery enables showTagPills', () => {
    const src = readFileSync(resolve(__dirname, 'Home.tsx'), 'utf8');
    expect(src).toMatch(/tagLabels=\{TAG_LABELS\}[\s\S]*?showTagPills\b/);
  });

  it('DestinationPage tour grid enables showTagPills', () => {
    const src = readFileSync(resolve(__dirname, 'DestinationPage.tsx'), 'utf8');
    expect(src).toMatch(/showTagPills\s*\n/);
  });
});
