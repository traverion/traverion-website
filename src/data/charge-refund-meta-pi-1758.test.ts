import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chargeRefundMetaBookingMatchesPaymentIntent } from '../lib/stripe-charge-refund';

describe('Phase 1758: charge.refunded meta must match booking payment_intent', () => {
  it('helper refuses live PI mismatch and allows empty or matching PI', () => {
    expect(
      chargeRefundMetaBookingMatchesPaymentIntent({
        eventPaymentIntentId: 'pi_old',
        bookingPaymentIntentId: 'pi_live',
      })
    ).toBe(false);
    expect(
      chargeRefundMetaBookingMatchesPaymentIntent({
        eventPaymentIntentId: 'pi_live',
        bookingPaymentIntentId: 'pi_live',
      })
    ).toBe(true);
    expect(
      chargeRefundMetaBookingMatchesPaymentIntent({
        eventPaymentIntentId: 'pi_pending',
        bookingPaymentIntentId: null,
      })
    ).toBe(true);
    expect(
      chargeRefundMetaBookingMatchesPaymentIntent({
        eventPaymentIntentId: '',
        bookingPaymentIntentId: null,
      })
    ).toBe(false);
  });

  it('stripe-webhook selects payment_intent_id and uses meta match helper', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/stripe-webhook/index.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1758');
    expect(src).toContain('chargeRefundMetaBookingMatchesPaymentIntent');
    expect(src).toContain('payment_intent_id');
    expect(src).toMatch(/refundBookingSelect[\s\S]*payment_intent_id/);
  });
});
