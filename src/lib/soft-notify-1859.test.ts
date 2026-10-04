import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SOFT_NOTIFY_FAILED_COPY,
  softNotifyFromEdgePayload,
  softNotifyFromSupplierInvoke,
  softNotifyWarningFromResults,
} from './softNotify';

describe('Phase 1859: soft-notification failure honesty', () => {
  it('separates skipped/success from failure in softNotify helpers', () => {
    expect(softNotifyFromEdgePayload({ success: true })).toEqual({ sent: true });
    expect(softNotifyFromEdgePayload({ skipped: true })).toEqual({ sent: false, skipped: true });
    expect(softNotifyFromEdgePayload({ success: false, error: 'Resend down' })).toEqual({
      sent: false,
      error: 'Resend down',
    });
    expect(softNotifyFromSupplierInvoke({ success: true })).toEqual({ sent: true });
    expect(softNotifyFromSupplierInvoke({ success: false, error: 'no recipients' })).toEqual({
      sent: false,
      error: 'no recipients',
    });
    expect(
      softNotifyWarningFromResults({ sent: true }, { sent: false, skipped: true })
    ).toBeNull();
    expect(softNotifyWarningFromResults({ sent: false, error: 'boom' })).toContain('boom');
    expect(softNotifyWarningFromResults({ sent: false })).toBe(SOFT_NOTIFY_FAILED_COPY);
  });

  it('MyBookings surfaces soft warning when note save succeeds with error', () => {
    const src = readFileSync(resolve(__dirname, '../pages/MyBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1859 / 1794');
    expect(src).toMatch(/if \(res\.success\)[\s\S]*if \(res\.error\)[\s\S]*Place of stay saved/);
    expect(src).not.toMatch(/if \(res\.success\) await load\(\);\s*else setActionError/);
  });

  it('cancelBookingAsCustomer returns notifyWarning without failing success', () => {
    const src = readFileSync(resolve(__dirname, '../data/supabase-bookings.ts'), 'utf8');
    expect(src).toContain('notifyWarning?: string');
    expect(src).toContain('Phase 1859: await customer cancel mail');
    expect(src).toMatch(/return \{ success: true, refundChoice: serverChoice, unpaidCheckout, notifyWarning \}/);
    // Must not throw/return success:false on notify failure after RPC.
    const cancelFn = src.slice(src.indexOf('export async function cancelBookingAsCustomer'));
    expect(cancelFn).not.toMatch(/if \(!customer\.data\?\.success\)[\s\S]{0,80}success:\s*false/);
  });

  it('BookingMessageThread uses warn tone for notify failure after message save', () => {
    const src = readFileSync(resolve(__dirname, '../components/BookingMessageThread.tsx'), 'utf8');
    expect(src).toContain('Phase 1859');
    expect(src).toContain('notifyWarning');
    expect(src).toContain('Message saved');
    expect(src).toMatch(/title="Message saved"[\s\S]*tone="warn"/);
  });

  it('stripe-webhook refund notifies log res.ok without aborting refund', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/stripe-webhook/index.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1859: log non-OK notify without failing refund truth');
    expect(src).toContain("emailKind: 'partial_refund_recorded'");
    expect(src).toContain("emailKind: 'refund_completed'");
    expect(src.match(/if \(!res\.ok\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    // Refund response still success after notify block.
    expect(src).toContain("status: 'partial_refund_recorded'");
  });

  it('partner cancel-request awaits notify and soft-surfaces failure', () => {
    const src = readFileSync(
      resolve(__dirname, '../pages/supplier/SupplierBookings.tsx'),
      'utf8'
    );
    expect(src).toContain('Phase 1859: request already committed');
    expect(src).toMatch(/const notify = await notifyTravelerCancellationRequest/);
    expect(src).not.toMatch(/void notifyTravelerCancellationRequest\(\{/);
    expect(src).toContain('Cancellation request submitted, but traveler email failed');
  });
});
