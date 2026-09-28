import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('SupplierBookings detail openCancel (Phase 1582)', () => {
  const src = readFileSync(join(here, 'SupplierBookings.tsx'), 'utf8');

  it('detail panel resolves openCancel before Request cancellation controls', () => {
    expect(src).toContain('Phase 1582');
    expect(src).toMatch(
      /Phase 1582: detail panel must resolve openCancel[\s\S]*const openCancel =[\s\S]*disabled=\{busy \|\| Boolean\(openCancel\)\}/
    );
  });
});
