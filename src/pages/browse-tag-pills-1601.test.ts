import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1601: browse cards show marketplace tag pills', () => {
  it('Packages enables showTagPills on tour cards', () => {
    const src = readFileSync(resolve(__dirname, 'Packages.tsx'), 'utf8');
    expect(src).toMatch(/showTagPills\s*\n/);
    expect(src).not.toMatch(/showTagPills=\{false\}/);
  });

  it('Home tour discovery enables showTagPills', () => {
    const src = readFileSync(resolve(__dirname, 'Home.tsx'), 'utf8');
    expect(src).toContain('// Phase 1601: surface marketplace tags on home discovery cards.');
    expect(src).toMatch(/tagLabels=\{TAG_LABELS\}[\s\S]{0,120}showTagPills/);
  });

  it('DestinationPage tour grid enables showTagPills', () => {
    const src = readFileSync(resolve(__dirname, 'DestinationPage.tsx'), 'utf8');
    expect(src).toContain('// Phase 1601: surface marketplace tags on destination tour cards.');
  });
});
