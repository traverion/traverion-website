import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('stay payment / notification idempotency cert', () => {
  it('stripe-webhook inserts event lock before processing', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/stripe-webhook/index.ts'),
      'utf8'
    );
    expect(src).toContain("from('stripe_webhook_events')");
    expect(src).toContain('.insert(');
  });

  it('promote and stay-request paths use stable notification idempotency keys', () => {
    const promote = readFileSync(
      resolve(__dirname, '../../supabase/functions/_shared/promote-paid-from-checkout.ts'),
      'utf8'
    );
    expect(promote).toContain('idempotencyKey: `supplier:new_booking:${bookingId}`');
    expect(promote).toContain('idempotencyKey: `customer:booking_confirmed_paid:${bookingId}`');
    expect(promote).toContain('idempotencyKey: `supplier:stay_request:${bookingId}`');
    expect(promote).toContain('idempotencyKey: `customer:booking_request:${bookingId}`');

    const action = readFileSync(
      resolve(__dirname, '../../supabase/functions/stay-booking-request-action/index.ts'),
      'utf8'
    );
    expect(action).toContain('idempotencyKey: `stay-request-cancel:${bookingId}:${releaseAction}`');
    expect(action).toContain('idempotencyKey: `customer:stay_request_${releaseAction}:${bookingId}`');

    const expire = readFileSync(
      resolve(__dirname, '../../supabase/functions/expire-stay-booking-requests/index.ts'),
      'utf8'
    );
    expect(expire).toContain('idempotencyKey: `stay-request-expire-cancel:${id}`');
  });

  it('cancel_booking_as_traveler rejects authorized (migration 256)', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/256_cancel_rejects_authorized_stay_request.sql'),
      'utf8'
    );
    expect(sql).toContain("v_pay = 'authorized'");
    expect(sql).toMatch(/Withdraw this stay request/i);
  });
});
