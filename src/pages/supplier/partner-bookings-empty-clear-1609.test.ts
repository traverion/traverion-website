import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1609: partner bookings filtered empty Clear filters', () => {
  it('empty state offers Clear filters when not on today/tomorrow tabs', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1609');
    expect(src).toMatch(
      /view === 'today' \|\| view === 'tomorrow' \?[\s\S]*Show all bookings[\s\S]*: \([\s\S]*Clear filters/
    );
  });
});
