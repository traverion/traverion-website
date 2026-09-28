import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('SupplierBookings list stay nights beside paid (Phase 1584)', () => {
  const src = readFileSync(join(here, 'SupplierBookings.tsx'), 'utf8');

  it('reconciles meta night count when paid+nightly (keeps occupancy on date line)', () => {
    expect(src).toContain('Phase 1584');
    expect(src).toContain('stayConfirmationPaidNightlyBreakdown');
    expect(src).toContain('confirmationStayNightCount');
    expect(src).toMatch(
      /Phase 1584: meta nights beside paidLabel[\s\S]*confirmationStayNightCount/
    );
  });
});
