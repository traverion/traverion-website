import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('Pay-now checkout session snapshot merge (Phase 1570)', () => {
  const edge = readFileSync(
    join(here, '../../supabase/functions/create-booking-checkout-session/index.ts'),
    'utf8'
  );

  it('merges resume purchase_snapshot with max checkOut on session update', () => {
    expect(edge).toContain('Phase 1570');
    expect(edge).toMatch(/mergePurchaseSnapshotMaxCheckOut\(resumePurchaseSnapshot, purchaseSnapshot\)/);
  });
});
