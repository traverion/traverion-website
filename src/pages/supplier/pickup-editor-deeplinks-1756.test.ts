import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1756: Pickup cancel reason + listing editor deep-links', () => {
  it('gates cancel reason and Edit meeting/schedule/pickup with canEditBookings', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierPickupPlanner.tsx'), 'utf8');
    expect(src).toContain('Phase 1756');
    expect(src).toContain('disabled={!canEditBookings}');
    expect(src).toContain("openSupplierListingEditor");
    expect(src).toMatch(/disabled=\{!canEditBookings\}[\s\S]*?Edit meeting/);
    expect(src).toMatch(/disabled=\{!canEditBookings\}[\s\S]*?Edit pickup/);
  });
});
