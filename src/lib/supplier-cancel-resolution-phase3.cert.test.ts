import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

describe('Phase 3: supplier cancel → customer refund or reschedule', () => {
  const mig = readFileSync(
    resolve(root, 'supabase/migrations/268_supplier_cancel_customer_resolution.sql'),
    'utf8'
  );
  const edge = readFileSync(
    resolve(root, 'supabase/functions/process-cancel-resolutions/index.ts'),
    'utf8'
  );
  const workflow = readFileSync(
    resolve(root, '.github/workflows/process-cancel-resolutions.yml'),
    'utf8'
  );
  const notify = readFileSync(
    resolve(root, 'supabase/functions/notify-customer-booking/index.ts'),
    'utf8'
  );
  const bookingOps = readFileSync(resolve(root, 'src/data/supabase-booking-ops.ts'), 'utf8');
  const panel = readFileSync(
    resolve(root, 'src/components/SupplierCancelResolutionPanel.tsx'),
    'utf8'
  );
  const trips = readFileSync(resolve(root, 'src/pages/MyBookings.tsx'), 'utf8');

  it('migration claims refund, reschedules tours, and processes deadlines', () => {
    expect(mig).toContain('claim_supplier_cancel_refund_choice');
    expect(mig).toContain('reschedule_supplier_cancelled_booking');
    expect(mig).toContain('process_pending_supplier_cancel_deadlines');
    expect(mig).toContain('needs_customer_choice');
    expect(mig).toContain('pending_customer_choice');
    expect(mig).toContain('assert_checkout_inventory');
    expect(mig).toContain('supplier_cancel_deadline_auto_refund');
    expect(mig).toContain('stay_reschedule_unsupported');
    expect(mig).toContain("v_needs_choice := (not v_is_stay) and v_before_start");
    expect(mig).toContain('v_official_start <= now()');
    expect(mig).toContain('deadline_passed');
  });

  it('scheduler edge + GitHub Actions cron every 5 minutes', () => {
    expect(edge).toContain('process_pending_supplier_cancel_deadlines');
    expect(edge).toContain('execute-booking-refund');
    expect(edge).toContain('recover: true');
    expect(workflow).toContain("cron: '*/5 * * * *'");
    expect(workflow).toContain('process-cancel-resolutions');
  });

  it('customer email + Trips resolution UI', () => {
    expect(notify).toContain('supplier_cancelled_choose_resolution');
    expect(notify).toContain('Your activity has been cancelled — choose a refund or new date');
    expect(bookingOps).toContain('claimSupplierCancelRefundChoice');
    expect(bookingOps).toContain('rescheduleSupplierCancelledBooking');
    expect(bookingOps).toContain('needsCustomerChoice');
    expect(panel).toContain('Get full refund');
    expect(panel).toContain('Choose another date');
    expect(panel).toContain('Contact Traverion Support');
    expect(panel).toContain('your full refund will begin automatically');
    expect(trips).toContain('SupplierCancelResolutionPanel');
  });

  it('reschedule preserves payment and blocks Stay path', () => {
    expect(mig).toContain('payment_intent_id');
    expect(mig).toContain("payment_status");
    expect(mig).toContain("'paid'");
    expect(mig).toContain('rescheduled_from_booking_id');
    expect(mig).toContain('rescheduled_to_booking_id');
    expect(panel).toContain('Stay rescheduling is not offered');
  });
});
