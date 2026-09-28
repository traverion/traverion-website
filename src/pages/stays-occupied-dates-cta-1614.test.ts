import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1614: stays occupied-nights empty Try other dates', () => {
  it('offers Try other dates before Clear filters when nights are blocked', () => {
    const src = readFileSync(resolve(__dirname, 'Stays.tsx'), 'utf8');
    expect(src).toContain('Phase 1614');
    expect(src).toContain('Try other dates');
    expect(src).toMatch(
      /emptyDueToOccupiedNights \|\| dateFilterActive \?[\s\S]*Try other dates[\s\S]*Clear filters/
    );
  });
});
