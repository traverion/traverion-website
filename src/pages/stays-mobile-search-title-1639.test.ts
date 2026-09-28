import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1639: Stays mobile search sheet title scale', () => {
  it('uses text-2xl like Tours Find a tour sheet', () => {
    const src = readFileSync(resolve(__dirname, 'Stays.tsx'), 'utf8');
    expect(src).toContain('Phase 1639');
    expect(src).toMatch(/stays-mobile-search-title[^>]*(?:className="[^"]*text-2xl|text-2xl[^"]*")/);
    expect(src).not.toMatch(/stays-mobile-search-title[^>]*text-xl/);
  });
});
