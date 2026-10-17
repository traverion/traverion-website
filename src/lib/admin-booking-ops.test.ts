import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  adminBookingAmountCaption,
  adminPaymentExplanation,
  buildAdminBookingTimeline,
} from './admin-booking-ops';

describe('admin booking operations', () => {
  it('does not label a failed payment as paid', () => {
    const failed = { status: 'pending', payment_status: 'failed', amount_paid: 119, currency: 'EUR' };
    expect(adminBookingAmountCaption(failed)).toBe('Not collected');
    expect(adminPaymentExplanation(failed).toLowerCase()).toContain('not a confirmed booking');
    expect(adminPaymentExplanation(failed).toLowerCase()).toContain('not supplier revenue');
  });

  it('builds a timeline only from stored events', () => {
    const events = buildAdminBookingTimeline({
      createdAt: '2026-10-01T10:00:00.000Z',
      paymentEvents: [
        { id: '1', event_type: 'payment_intent.payment_failed', event_id: 'evt_1', created_at: '2026-10-01T10:05:00.000Z' },
      ],
      emails: [{ id: 'm1', template_key: 'booking_confirmed_paid', status: 'failed', created_at: '2026-10-01T10:06:00.000Z' }],
      refundInstructions: [{ id: 'r1', status: 'ready', created_at: '2026-10-02T10:00:00.000Z' }],
    });
    expect(events.map((event) => event.label)).toEqual([
      'Booking initiated',
      'Payment failed',
      'booking confirmed paid was not accepted',
      'Refund instruction prepared',
    ]);
    expect(events.find((event) => event.id === 'refund-r1')?.detail).toContain('Stripe has not');
    expect(events.some((event) => /delivered/i.test(event.label))).toBe(false);
  });

  it('keeps list search and the admin API on the public reference', () => {
    const edge = readFileSync(
      resolve(__dirname, '../../supabase/functions/admin-supplier-verification/index.ts'),
      'utf8'
    );
    expect(edge).toContain("action === 'booking_ops_detail'");
    expect(edge).toContain('public_reference.ilike');
    expect(edge).not.toContain('stripe.refunds.create');
  });
});
