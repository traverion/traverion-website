/**
 * Final Stripe LIVE Production Certification — contract locks.
 *
 * These tests prove CURRENT safety posture. They do NOT authorize LIVE activation.
 * Do not weaken LIVE blocks to make this file pass.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isStripeTestSecretKey, stripeLiveSecretBlockedMessage } from './stripe-test-only';
import { isStripeTestPublishableKey } from './money';

const root = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

const MONEY_EDGES = [
  'supabase/functions/create-booking-checkout-session/index.ts',
  'supabase/functions/stripe-webhook/index.ts',
  'supabase/functions/reconcile-checkout-session/index.ts',
  'supabase/functions/execute-booking-refund/index.ts',
  'supabase/functions/stay-booking-request-action/index.ts',
  'supabase/functions/expire-stay-booking-requests/index.ts',
  'supabase/functions/connect-supplier-onboarding/index.ts',
  'supabase/functions/execute-supplier-transfers/index.ts',
] as const;

describe('Stripe LIVE production certification — safety locks remain', () => {
  it('rejects LIVE secrets and documents the block', () => {
    expect(isStripeTestSecretKey('sk_test_x')).toBe(true);
    expect(isStripeTestSecretKey('sk_live_x')).toBe(false);
    expect(stripeLiveSecretBlockedMessage()).toMatch(/LIVE/);
    expect(isStripeTestPublishableKey('pk_test_x')).toBe(true);
    expect(isStripeTestPublishableKey('pk_live_x')).toBe(false);
  });

  it('every money-moving edge function still refuses non-TEST secrets', () => {
    for (const path of MONEY_EDGES) {
      const src = read(path);
      expect(src, path).toContain('isStripeTestSecretKey');
      expect(src, path).toContain('stripeLiveSecretBlockedMessage');
    }
  });

  it('client checkout refuses LIVE publishable keys', () => {
    const bookings = read('src/data/supabase-bookings.ts');
    expect(bookings).toContain('stripeLivePublishableBlockedMessage');
    expect(bookings).toMatch(/isStripeTestPublishableKey|appStripeIsTestMode/);
  });

  it('Connect SCAT transfers remain TEST-only with multi-layer kill switches', () => {
    const transfers = read('supabase/functions/execute-supplier-transfers/index.ts');
    expect(transfers).toContain("STRIPE_CONNECT_TRANSFERS_ENABLED");
    expect(transfers).toMatch(/transfersFlag !== ['"]test['"]/);
    expect(transfers).toContain("environment: 'test'");
    expect(transfers).toContain('live_money_enabled: false');
    expect(transfers).not.toMatch(/STRIPE_CONNECT_TRANSFERS_ENABLED.*live/);
  });

  it('platform checkout does not destination-charge or take application_fee at session create', () => {
    const checkout = read('supabase/functions/create-booking-checkout-session/index.ts');
    expect(checkout).not.toContain('application_fee_amount');
    expect(checkout).not.toContain('transfer_data');
    expect(checkout).not.toContain('on_behalf_of');
    expect(checkout).toContain("mode: 'payment'");
  });

  it('post-transfer refund orchestration does not yet call transfers.createReversal', () => {
    // LIVE Connect payouts must not ship until this gap is closed or ops-only.
    const refund = read('supabase/functions/execute-booking-refund/index.ts');
    const transfers = read('supabase/functions/execute-supplier-transfers/index.ts');
    const webhook = read('supabase/functions/stripe-webhook/index.ts');
    expect(refund).not.toContain('createReversal');
    expect(transfers).not.toContain('createReversal');
    expect(webhook).toContain('transfer.reversed'); // mirrors Stripe events only
    expect(webhook).not.toContain('createReversal');
  });

  it('env ownership guard stamps and fails closed on foreign/missing bookings', () => {
    const guard = read('supabase/functions/_shared/stripe-environment-guard.ts');
    expect(guard).toContain('traverion_supabase_project_ref');
    expect(guard).toContain('foreign_project_ref');
    expect(guard).toContain('booking_not_in_this_environment');
    const webhook = read('supabase/functions/stripe-webhook/index.ts');
    expect(webhook).toContain('stripeEventOwnershipDecision');
  });
});
