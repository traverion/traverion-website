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

  it('Phase 1571: resume assert uses healed stayColumns check_out', () => {
    expect(edge).toContain('Phase 1571');
    expect(edge).toMatch(/stayAssertOut[\s\S]*stayColumns\?\.check_out/);
    expect(edge).toMatch(/p_check_out:\s*stayAssertOut/);
  });

  it('Phase 1572: merges resume snap before stayColumns and assert', () => {
    expect(edge).toContain('Phase 1572');
    expect(edge).toMatch(
      /purchaseSnapshotForUpdate[\s\S]*stayBookingColumnsForCheckoutUpdate[\s\S]*assert_checkout_inventory/
    );
    expect(edge).toMatch(/purchase_snapshot:\s*purchaseSnapshotForUpdate/);
  });
});
