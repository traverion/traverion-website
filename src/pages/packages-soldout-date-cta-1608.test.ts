import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1608: sold-out date empty CTA', () => {
  it('offers Try another date before Clear filters when fully booked', () => {
    const src = readFileSync(resolve(__dirname, 'Packages.tsx'), 'utf8');
    expect(src).toContain('Phase 1608');
    expect(src).toContain('Try another date');
    expect(src).toMatch(
      /emptyDueToSoldOutDate \? \([\s\S]*Try another date[\s\S]*Clear filters[\s\S]*\) : hasActiveFilters/
    );
  });
});
