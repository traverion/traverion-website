import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { customerFacingCancellationReason } from './cancellation-policy';

const root = resolve(__dirname, '../..');

function src(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('booking lifecycle notifications', () => {
  it('shows a confirmation modal and does not claim success before the server result', () => {
    const screen = src('src/components/supplier/SupplierCancellationWorkflow.tsx');
    expect(screen).toContain('Cancelling bookings…');
    expect(screen).toContain('Cancellation completed');
    expect(screen).toContain('Confirm cancellation');
    expect(screen).toContain('View results');
    expect(screen).toContain("if (!canSubmit || phase === 'processing' || submittingRef.current) return");
  });

  it('keeps the supplier explanation out of customer reads and mail', () => {
    const trips = src('src/pages/MyBookings.tsx');
    const client = src('src/data/supabase-booking-ops.ts');
    const customerMail = src('supabase/functions/notify-customer-booking/index.ts');
    const supplierMail = src('supabase/functions/notify-supplier-event/index.ts');
    const sql = src('supabase/migrations/20261114105433_booking_lifecycle_private_notes.sql');
    expect(trips).not.toContain('openCancel.reason_text');
    expect(trips).toContain('customerFacingCancellationReason');
    expect(client).not.toContain('reason_text, evidence_note');
    expect(customerMail).toContain('Your booking has been cancelled — Traverion');
    expect(customerMail).toContain('Your booking details have changed — Traverion');
    expect(supplierMail).toContain('Booking updated — Traverion');
    expect(supplierMail).toContain('Booking cancelled — Traverion');
    expect(customerMail).toContain(".select('reason_code')");
    expect(customerMail).not.toContain("select('reason_text");
    expect(supplierMail).toContain(".select('requested_by, reason_code')");
    expect(supplierMail).not.toContain('reason_text');
    expect(sql).toContain('revoke select on table public.cancellation_requests from anon, authenticated');
    expect(sql).toContain('is_traverion_panel_admin()');
    expect(customerFacingCancellationReason('UNSAFE_WEATHER')).toBe('Cancelled due to weather conditions.');
    expect(customerFacingCancellationReason('OPERATIONAL_ERROR')).not.toContain('explanation');
  });

  it('notifies both parties after a supplier cancellation without a second pipeline', () => {
    const page = src('src/pages/supplier/SupplierBookings.tsx');
    expect(page).toContain('notifyTravelerCancellationRequest');
    expect(page).toContain("eventType: 'booking_cancelled'");
    expect(page).toContain('Promise.all');
    expect(page).toContain('customerFacingCancellationReason(input.reasonCode)');
    expect(src('supabase/functions/notify-supplier-event/index.ts')).toContain("? 'Booking cancelled'");
  });
});
