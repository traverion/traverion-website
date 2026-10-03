import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Phase 1855: first Stripe decline must not be ignored as a "stale" PI failure
 * when create-booking cleared payment_intent_id on the current Checkout session.
 */
describe('Phase 1855: payment_intent.payment_failed session correlation', () => {
  it('stripe-webhook correlates failed PI to booking checkout session before stale check', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/stripe-webhook/index.ts'),
      'utf8'
    );
    expect(src).toContain('eventCheckoutSessionIdForPaymentIntentFailure');
    expect(src).toContain('checkoutSessionPaymentIntentId');
    expect(src).toContain('stripe.checkout.sessions.retrieve');
    const failStart = src.indexOf("event.type === 'payment_intent.payment_failed'");
    expect(failStart).toBeGreaterThanOrEqual(0);
    const failBody = src.slice(failStart, failStart + 2200);
    expect(failBody).toContain('eventCheckoutSessionIdForPaymentIntentFailure');
    expect(failBody.indexOf('eventCheckoutSessionIdForPaymentIntentFailure')).toBeLessThan(
      failBody.indexOf('staleCheckoutFailureShouldApply')
    );
  });
});
