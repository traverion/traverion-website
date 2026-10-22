import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const mig = readFileSync(join(root, 'supabase/migrations/267_tour_auto_cancellation_refunds.sql'), 'utf8');
const edge = readFileSync(join(root, 'supabase/functions/execute-booking-refund/index.ts'), 'utf8');
const cancelClient = readFileSync(join(root, 'src/data/supabase-bookings.ts'), 'utf8');
const bookingOps = readFileSync(join(root, 'src/data/supabase-booking-ops.ts'), 'utf8');

describe('tour auto-refund Phase 2 (cert)', () => {
  it('generalizes refund instructions to Stay and Tour', () => {
    expect(mig).toContain('ensure_booking_cancel_refund_instruction');
    expect(mig).toContain('cancel-refund:');
    expect(mig).toContain('stay-cancel-refund:');
    expect(mig).toContain('pending_customer_choice');
    expect(mig).toContain('booking_official_start_at');
    expect(mig).toContain('list_pending_cancel_refund_instructions');
  });

  it('supplier before start skips refund; after start queues instruction', () => {
    expect(mig).toContain('before_official_start');
    expect(mig).toContain('supplier_cancel_after_start_full_refund');
    expect(mig).toMatch(/v_before_start := .* > now\(\)/);
    expect(mig).toMatch(/if not v_before_start then[\s\S]*ensure_booking_cancel_refund_instruction/);
  });

  it('traveler eligible cancel queues refund for tours and stays', () => {
    expect(mig).toMatch(
      /v_collected and v_choice = 'full_refund' then[\s\S]*ensure_booking_cancel_refund_instruction/
    );
    expect(cancelClient).toContain('executeBookingRefund');
  });

  it('edge executes cancel-refund keys and supports service-role recover', () => {
    expect(edge).toContain('cancel-refund:');
    expect(edge).toContain('ensure_booking_cancel_refund_instruction');
    expect(edge).toContain('recover');
    expect(edge).toContain('list_pending_cancel_refund_instructions');
    expect(edge).not.toMatch(/not_stay/);
  });

  it('client only executes Stripe when auto_refund_queued', () => {
    expect(bookingOps).toContain('autoRefundQueued');
    expect(bookingOps).toContain('beforeOfficialStart');
    expect(bookingOps).toMatch(/if \(autoRefundQueued\)[\s\S]*executeBookingRefund/);
  });
});
