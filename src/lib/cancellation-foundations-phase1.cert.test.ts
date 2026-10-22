import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { travelerSelfCancelStartHm } from './cancellation-policy';

const mig = readFileSync(
  join(process.cwd(), 'supabase/migrations/266_cancellation_foundations_phase1.sql'),
  'utf8'
);

describe('cancellation foundations Phase 1 (cert)', () => {
  it('tour cancel clock ignores pickup even when confirmed earlier', () => {
    expect(
      travelerSelfCancelStartHm({
        isStay: false,
        startTimeHm: '18:30',
        confirmedPickupHm: '18:00',
        fulfillment: 'pickup',
      })
    ).toBe('18:30');
  });

  it('migration snapshots resolution columns and immediate supplier cancel', () => {
    expect(mig).toContain('cancellation_origin');
    expect(mig).toContain('cancellation_resolution');
    expect(mig).toContain('pending_customer_choice');
    expect(mig).toContain('rescheduled_from_booking_id');
    expect(mig).toContain('support_flag');
    expect(mig).toContain('immediate_supplier_cancel');
    expect(mig).toContain('cancelReferenceStartHm');
    expect(mig).toMatch(/Never pickup_time/i);
    expect(mig).toContain('supplier_cancel_full_refund');
  });

  it('does not implement tour Stripe refund execution or reschedule workflow', () => {
    expect(mig.toLowerCase()).not.toContain('create-refund');
    expect(mig).not.toContain('execute-booking-refund');
    expect(mig).toMatch(/Tour Stripe refund = Phase 2/i);
    expect(mig).toMatch(/Reschedule workflow = Phase 3/i);
  });
});
