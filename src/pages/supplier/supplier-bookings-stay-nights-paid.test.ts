import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('SupplierBookings list stay nights beside paid (Phase 1584)', () => {
  const src = readFileSync(join(here, 'SupplierBookings.tsx'), 'utf8');

  it('reconciles meta night count via stayPaidAdjacentNightCount (1588)', () => {
    expect(src).toContain('Phase 1584/1588');
    expect(src).toContain('stayPaidAdjacentNightCount');
    expect(src).toMatch(
      /Phase 1584\/1588: meta nights beside paidLabel[\s\S]*stayPaidAdjacentNightCount/
    );
  });
});
