import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1694: Catalog-empty offers traveler escapes', () => {
  it('pairs partner list CTA with browse + home on Tours and Stays', () => {
    const tours = readFileSync(resolve(__dirname, 'Packages.tsx'), 'utf8');
    const stays = readFileSync(resolve(__dirname, 'Stays.tsx'), 'utf8');
    expect(tours).toContain('Phase 1694');
    expect(stays).toContain('Phase 1694');
    expect(tours).toMatch(/No tours published yet[\s\S]*Browse stays[\s\S]*Back to home/);
    expect(stays).toMatch(/No stays published yet[\s\S]*Browse tours[\s\S]*Back to home/);
  });
});
