/**
 * Concurrent Booking Safety Certification — architecture + recovery contracts.
 *
 * Authoritative inventory claim is Postgres promote_paid_checkout_booking
 * (advisory lock + assert_checkout_inventory + paid UPDATE in one transaction).
 * Instant Book unpaid pending does not occupy (mig 257); first successful paid
 * promote wins; losers refund via inventory-conflict-checkout-refund.
 *
 * Live DB races are exercised by scripts/cert-booking-concurrency-*.sql against
 * Traverion linked project (Stripe TEST / no real charges).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bookingOccupiesInventory } from './booking-hold';
import {
  stayCheckoutNightsAlreadyBooked,
  stayDateRangesOverlap,
} from './stayOccupancy';
import { promotePaidCheckoutOutcome } from './promote-paid-checkout';
import { stripeWebhookReplayDecision } from './stripe-webhook-replay';
import { rejectedCheckoutCaptureShouldRefund } from './checkout-paid-amount';

const mig257 = readFileSync(
  resolve(__dirname, '../../supabase/migrations/257_instant_book_no_pending_inventory_hold.sql'),
  'utf8'
);
const mig261 = readFileSync(
  resolve(__dirname, '../../supabase/migrations/261_expire_stale_holds_time_based.sql'),
  'utf8'
);
const assertSql = readFileSync(
  resolve(__dirname, '../../supabase/migrations/243_listing_slot_overrides.sql'),
  'utf8'
);
const promoteSql = readFileSync(
  resolve(__dirname, '../../supabase/migrations/209_promote_snapshot_max_checkout_merge.sql'),
  'utf8'
);
const promoteTs = readFileSync(
  resolve(__dirname, '../../supabase/functions/_shared/promote-paid-from-checkout.ts'),
  'utf8'
);
const webhookTs = readFileSync(
  resolve(__dirname, '../../supabase/functions/stripe-webhook/index.ts'),
  'utf8'
);
const checkoutTs = readFileSync(
  resolve(__dirname, '../../supabase/functions/create-booking-checkout-session/index.ts'),
  'utf8'
);

describe('STAYS — concurrent inventory architecture', () => {
  const now = Date.parse('2026-10-22T12:00:00.000Z');

  it('database: Instant Book pending does not occupy; paid and live authorized do', () => {
    expect(mig257).toMatch(/Instant Book unpaid pending never occupies/i);
    expect(
      bookingOccupiesInventory(
        {
          status: 'pending',
          payment_status: 'pending',
          hold_expires_at: '2026-10-22T13:00:00.000Z',
        },
        now
      )
    ).toBe(false);
    expect(
      bookingOccupiesInventory({ status: 'confirmed', payment_status: 'paid' }, now)
    ).toBe(true);
    expect(
      bookingOccupiesInventory(
        {
          status: 'pending',
          payment_status: 'authorized',
          hold_expires_at: '2026-10-22T18:00:00.000Z',
        },
        now
      )
    ).toBe(true);
  });

  it('database: stay assert uses advisory lock + inclusive check-in / exclusive check-out overlap', () => {
    expect(assertSql).toContain("hashtext('stay|' || p_listing_id::text)");
    expect(assertSql).toContain('pg_advisory_xact_lock');
    expect(assertSql).toContain('Those nights are already booked.');
    expect(assertSql).toContain('Those nights are blocked.');
    expect(assertSql).toContain('b.booking_date < p_check_out');
    expect(assertSql).toContain('public.stay_booking_check_out(b) > p_check_in');
    expect(stayDateRangesOverlap('2099-06-10', '2099-06-12', '2099-06-11', '2099-06-13')).toBe(true);
    expect(stayDateRangesOverlap('2099-06-10', '2099-06-12', '2099-06-12', '2099-06-14')).toBe(false);
  });

  it('database: promote asserts inventory then paid UPDATE in one transaction', () => {
    expect(promoteSql).toContain('PERFORM public.assert_checkout_inventory(');
    expect(promoteSql).toContain('FOR UPDATE');
    expect(promoteSql).toContain("payment_status = 'paid'");
    expect(promoteSql).toContain('stay_booking_check_out');
  });

  it('overlapping paid nights block; live Instant Book open checkout does not', () => {
    const paid = {
      id: 'paid',
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2099-06-10',
      check_out: '2099-06-12',
    };
    const open = {
      id: 'open',
      status: 'pending',
      payment_status: 'pending',
      booking_date: '2099-06-10',
      check_out: '2099-06-12',
      hold_expires_at: '2026-10-22T13:00:00.000Z',
    };
    expect(stayCheckoutNightsAlreadyBooked([paid], '2099-06-10', '2099-06-12', null, now)).toBe(true);
    expect(stayCheckoutNightsAlreadyBooked([open], '2099-06-10', '2099-06-12', null, now)).toBe(false);
  });

  it('expired checkout recovery: expire_stale is time-based (not !occupies)', () => {
    expect(mig261).toContain('hold_expires_at <= now()');
    expect(mig261).toContain("interval '30 minutes'");
    expect(mig261).not.toMatch(/NOT public\.booking_occupies_inventory/);
    expect(mig261).toMatch(/Must not use booking_occupies_inventory/i);
  });

  it('Stripe: expectedTotal gate preserved on stay checkout', () => {
    expect(checkoutTs).toContain('expectedTotal');
    expect(checkoutTs).toContain('quote_changed');
  });

  it('Stripe: inventory conflict after paid capture refunds (never keeps charge)', () => {
    expect(promoteTs).toContain('inventory-conflict-checkout-refund:${session.id}');
    expect(promoteTs).toContain("event_type: 'inventory_conflict_checkout_refund'");
    expect(promoteTs).toContain('needsIntervention: true');
    expect(
      rejectedCheckoutCaptureShouldRefund({
        sessionPaymentStatus: 'paid',
        paymentIntentId: 'pi_test',
      })
    ).toBe(true);
    expect(
      promotePaidCheckoutOutcome(null, 'Those nights are already booked.').kind
    ).toBe('inventory_conflict');
  });

  it('Webhook: event insert lock + replay helper are idempotent', () => {
    expect(webhookTs).toContain("from('stripe_webhook_events')");
    expect(webhookTs).toContain('duplicate: true');
    expect(stripeWebhookReplayDecision({ status: 'processed' })).toBe('terminal');
    expect(
      stripeWebhookReplayDecision({
        status: 'received',
        receivedAt: '2026-10-22T11:59:00.000Z',
        nowMs: now,
      })
    ).toBe('in_flight');
  });

  it('Notifications: promote uses stable idempotency keys', () => {
    expect(promoteTs).toContain('idempotencyKey: `supplier:new_booking:${bookingId}`');
    expect(promoteTs).toContain('idempotencyKey: `customer:booking_confirmed_paid:${bookingId}`');
  });
});

describe('TOURS — departure capacity architecture', () => {
  it('database: tour assert uses advisory lock + slot/day capacity', () => {
    expect(assertSql).toContain("hashtext(\n      'tour|' || p_listing_id::text");
    expect(assertSql).toContain('Not enough capacity left for this departure.');
    expect(assertSql).toContain('No bookable capacity for this departure.');
    expect(assertSql).toContain('booking_occupies_inventory');
  });

  it('database: occupied guests count only inventory-occupying bookings', () => {
    expect(assertSql).toContain(
      'AND public.booking_occupies_inventory(b.status, b.payment_status, b.hold_expires_at, b.created_at)'
    );
  });

  it('independent departures: slot-scoped occupied filter by start time HM', () => {
    expect(assertSql).toContain(
      'public.booking_inventory_start_time_hm(b.purchase_snapshot, b.start_time) = v_slot_hm'
    );
  });

  it('shared / day-wide inventory: day override LEASTs remaining with day occupied', () => {
    expect(assertSql).toContain('v_has_day_override');
    expect(assertSql).toContain('LEAST(');
  });

  it('Stripe + webhook integrity paths shared with stays', () => {
    expect(promoteTs).toContain('inventory_conflict');
    expect(webhookTs).toContain('stripe_webhook_events');
    expect(promotePaidCheckoutOutcome({ ok: false, reason: 'session_mismatch' }).kind).toBe(
      'session_mismatch'
    );
    expect(promotePaidCheckoutOutcome({ ok: false, reason: 'already_paid' }).kind).toBe(
      'already_paid'
    );
  });
});
