/**
 * Stripe LIVE Production Certification — safety locks.
 *
 * LIVE may be supported by code paths, but remains disabled unless
 * STRIPE_LIVE_PAYMENTS_ENABLED is explicitly set. Presence of sk_live_
 * alone must never authorize charges.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isStripeLivePaymentsEnabledFlag,
  isStripeTestSecretKey,
  resolveStripeSecretKey,
  stripeLiveSecretBlockedMessage,
} from './stripe-test-only';
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
  'supabase/functions/expire-booking-checkout/index.ts',
] as const;

describe('Stripe LIVE production certification — safety locks remain', () => {
  it('LIVE stays disabled by default even when LIVE secrets are present', () => {
    expect(isStripeLivePaymentsEnabledFlag(undefined)).toBe(false);
    expect(isStripeTestSecretKey('sk_test_x')).toBe(true);
    const blocked = resolveStripeSecretKey({
      secret: 'sk_live_x',
      livePaymentsEnabledRaw: undefined,
    });
    expect(blocked.ok).toBe(false);
    expect(stripeLiveSecretBlockedMessage()).toMatch(/STRIPE_LIVE_PAYMENTS_ENABLED/);
    expect(isStripeTestPublishableKey('pk_test_x')).toBe(true);
    expect(isStripeTestPublishableKey('pk_live_x')).toBe(false);
  });

  it('every money-moving edge function resolves secrets via the shared LIVE-aware gate', () => {
    for (const path of MONEY_EDGES) {
      const src = read(path);
      expect(src, path).toContain('resolveStripeMoneySecretFromEnv');
    }
  });

  it('webhook verifies signatures with mode-aware secrets and livemode isolation', () => {
    const webhook = read('supabase/functions/stripe-webhook/index.ts');
    expect(webhook).toContain('webhookSigningSecrets');
    expect(webhook).toContain('stripeEventLivemodeDecision');
    expect(webhook).toContain('STRIPE_WEBHOOK_SECRET_LIVE');
  });

  it('client checkout uses flag-aware publishable gate (not key presence alone)', () => {
    const bookings = read('src/data/supabase-bookings.ts');
    expect(bookings).toContain('appStripeCheckoutAllowed');
    const money = read('src/lib/money.ts');
    expect(money).toContain('VITE_STRIPE_LIVE_PAYMENTS_ENABLED');
    expect(money).toContain('resolveStripePublishableKey');
  });

  it('Connect SCAT transfers remain TEST-only with multi-layer kill switches', () => {
    const transfers = read('supabase/functions/execute-supplier-transfers/index.ts');
    expect(transfers).toContain("STRIPE_CONNECT_TRANSFERS_ENABLED");
    expect(transfers).toMatch(/transfersFlag !== ['"]test['"]/);
    expect(transfers).toContain("environment: 'test'");
    expect(transfers).toContain('live_money_enabled: false');
    expect(transfers).toContain('Connect transfers remain TEST-only');
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
    const refund = read('supabase/functions/execute-booking-refund/index.ts');
    const transfers = read('supabase/functions/execute-supplier-transfers/index.ts');
    const webhook = read('supabase/functions/stripe-webhook/index.ts');
    expect(refund).not.toContain('createReversal');
    expect(transfers).not.toContain('createReversal');
    expect(webhook).toContain('transfer.reversed');
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
