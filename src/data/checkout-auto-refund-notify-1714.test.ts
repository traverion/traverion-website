import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1714: auto-refund traveler notify for cutoff / listing / self-book', () => {
  it('promote-paid wires notifyTravelerCheckoutCaptureReversed for all silent refund paths', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/_shared/promote-paid-from-checkout.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1713/1714');
    expect(src).toContain('notifyTravelerCheckoutCaptureReversed');
    expect(src).toContain("reasonKey: 'departure_cutoff_checkout_refund'");
    expect(src).toContain("reasonKey: 'listing_unavailable_checkout_refund'");
    expect(src).toContain("reasonKey: 'self_book_checkout_refund'");
    expect(src).toContain('ensureCancelled: true');
  });
});
