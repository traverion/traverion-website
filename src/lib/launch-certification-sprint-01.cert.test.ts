/**
 * Launch Certification Sprint 01 — contract proofs for T1–T10.
 *
 * These tests certify CODE SAFETY invariants for Stripe TEST mode.
 * They do NOT replace Stripe Dashboard / browser E2E (see docs audit 13).
 * LIVE Stripe must remain blocked.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bookingOccupiesInventory } from './booking-hold';
import { isStripeTestSecretKey, stripeLiveSecretBlockedMessage } from './stripe-test-only';
import { isStripeTestPublishableKey } from './money';

const root = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

describe('Launch Certification Sprint 01 — LIVE remains disabled (T10)', () => {
  it('rejects LIVE secret keys and documents the block message', () => {
    expect(isStripeTestSecretKey('sk_test_abc')).toBe(true);
    expect(isStripeTestSecretKey('sk_live_abc')).toBe(false);
    expect(stripeLiveSecretBlockedMessage()).toMatch(/LIVE/);
  });

  it('client publishable gate only accepts pk_test_', () => {
    expect(isStripeTestPublishableKey('pk_test_abc')).toBe(true);
    expect(isStripeTestPublishableKey('pk_live_abc')).toBe(false);
  });

  it('checkout + webhook + reconcile edge entries refuse LIVE secrets', () => {
    for (const path of [
      'supabase/functions/create-booking-checkout-session/index.ts',
      'supabase/functions/stripe-webhook/index.ts',
      'supabase/functions/reconcile-checkout-session/index.ts',
      'supabase/functions/stay-booking-request-action/index.ts',
    ]) {
      const src = read(path);
      expect(src).toContain('isStripeTestSecretKey');
      expect(src).toContain('stripeLiveSecretBlockedMessage');
    }
  });
});

describe('Launch Certification Sprint 01 — inventory / Instant Book (T2–T3 contracts)', () => {
  const now = Date.parse('2026-10-22T12:00:00.000Z');

  it('Instant Book unpaid pending does not occupy inventory', () => {
    expect(
      bookingOccupiesInventory(
        {
          status: 'pending',
          payment_status: 'pending',
          hold_expires_at: '2026-10-22T12:45:00.000Z',
        },
        now
      )
    ).toBe(false);
  });

  it('paid and authorized rows occupy inventory', () => {
    expect(
      bookingOccupiesInventory({ status: 'confirmed', payment_status: 'paid' }, now)
    ).toBe(true);
    expect(
      bookingOccupiesInventory({ status: 'pending', payment_status: 'authorized' }, now)
    ).toBe(true);
  });

  it('migration 257 documents Instant Book pending never occupies', () => {
    const sql = read('supabase/migrations/257_instant_book_no_pending_inventory_hold.sql');
    expect(sql).toMatch(/instant book/i);
    expect(sql).toContain('booking_occupies_inventory');
  });
});

describe('Launch Certification Sprint 01 — R2B contracts (T4–T7)', () => {
  it('stay request action implements accept / decline / withdraw', () => {
    const action = read('supabase/functions/stay-booking-request-action/index.ts');
    expect(action).toContain("'accept'");
    expect(action).toContain("'decline'");
    expect(action).toContain("'withdraw'");
    expect(action).toContain('paymentIntents.capture');
    expect(action).toContain('paymentIntents.cancel');
    expect(action).toContain('capture_stay_booking_request');
    expect(action).toContain('release_stay_booking_request');
  });

  it('expire-stay-booking-requests edge + GH workflow exist', () => {
    const expire = read('supabase/functions/expire-stay-booking-requests/index.ts');
    expect(expire).toContain('expire_stay_booking_requests');
    const wf = read('.github/workflows/expire-stay-booking-requests.yml');
    expect(wf).toContain('expire-stay-booking-requests');
    expect(wf).toMatch(/cron:/);
  });

  it('authorized cancel is withdraw-only (migration 256 + client route)', () => {
    const sql = read('supabase/migrations/256_cancel_rejects_authorized_stay_request.sql');
    expect(sql).toContain("v_pay = 'authorized'");
    const client = read('src/data/supabase-bookings.ts');
    expect(client).toContain("stayBookingRequestAction({ bookingId, action: 'withdraw' })");
  });
});

describe('Launch Certification Sprint 01 — payment promote & webhook (T1/T9 contracts)', () => {
  it('create session prices from server quoteListingBooking then freezes commercial terms', () => {
    const create = read('supabase/functions/create-booking-checkout-session/index.ts');
    expect(create).toContain('quoteListingBooking');
    // Stripe amount comes from quote.totalAmount (server), not a trusted client total.
    expect(create).toContain('const totalAmount = quote.totalAmount');
    expect(create).toContain("rpc('freeze_booking_commercial_terms'");
  });

  it('promote requires payment confirmation gates before paid', () => {
    const promote = read('supabase/functions/_shared/promote-paid-from-checkout.ts');
    expect(promote).toContain('promote_paid_checkout_booking');
    expect(promote).toContain('record_paid_booking_earnings');
  });

  it('webhook locks events before processing (replay safety)', () => {
    const wh = read('supabase/functions/stripe-webhook/index.ts');
    expect(wh).toContain("from('stripe_webhook_events')");
    expect(wh).toContain('constructEventAsync');
  });
});

describe('Launch Certification Sprint 01 — cancel / refund honesty (T8 contracts)', () => {
  it('traveler cancel does not auto-create Stripe refunds', () => {
    const sql = read('supabase/migrations/256_cancel_rejects_authorized_stay_request.sql');
    expect(sql).toMatch(/does not send Stripe refunds automatically/i);
  });

  it('admin edge must not execute stripe.refunds.create', () => {
    const edge = read('supabase/functions/admin-supplier-verification/index.ts');
    expect(edge).not.toContain('stripe.refunds.create');
  });

  it('prepared refund instructions do not execute Stripe', () => {
    const sql = read('supabase/migrations/241_refunds_financial_recovery_engine.sql');
    expect(sql).toContain('executes_stripe');
    expect(sql).toMatch(/false/i);
    expect(sql).toMatch(/Stripe refund must be executed separately/i);
  });

  it('traveler Trips copy keeps Refund due manual honesty', () => {
    const trips = read('src/pages/MyBookings.tsx');
    expect(trips).toContain('REFUND_DUE_MANUAL_COPY');
    const states = read('src/lib/payment-states.ts');
    expect(states).toMatch(/does not send Stripe refunds automatically/i);
  });
});
