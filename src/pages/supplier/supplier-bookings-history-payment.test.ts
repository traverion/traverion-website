import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { partnerCollectedAmountCaption } from '../../lib/payment-states';

const here = dirname(fileURLToPath(import.meta.url));

describe('SupplierBookings History payment honesty (Phase 1549)', () => {
  const src = readFileSync(join(here, 'SupplierBookings.tsx'), 'utf8');

  it('History uses partnerCollectedAmountCaption — not hardcoded Paid', () => {
    expect(src).toContain('Phase 1549');
    expect(src).toMatch(/History[\s\S]*partnerCollectedAmountCaption\(booking\)/);
    expect(src).not.toMatch(
      /bookingPaymentWasCollected\(booking\.payment_status\) \? \(\s*<li>Paid<\/li>/
    );
  });

  it('caption rule: cancelled paid → Refund due, not Paid', () => {
    expect(
      partnerCollectedAmountCaption({
        status: 'cancelled',
        payment_status: 'paid',
        amount_paid: 189,
      })
    ).toBe('Refund due');
  });
});
