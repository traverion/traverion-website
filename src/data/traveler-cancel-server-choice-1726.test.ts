import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TRAVELER_CANCEL_NO_REFUND_EMAIL_FOOTER,
  TRAVELER_SELF_CANCEL_EMAIL_DIFF_FULL_REFUND,
  TRAVELER_SELF_CANCEL_EMAIL_DIFF_NO_REFUND,
} from '../lib/booking-confirmation-copy';

describe('Phase 1726: traveler cancel follows server refund_choice', () => {
  it('cancelBookingAsCustomer uses RPC/DB refund_choice for diffs and return value', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-bookings.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export async function cancelBookingAsCustomer'));
    expect(fn).toContain('Phase 1726');
    expect(fn).toContain('rpcData');
    expect(fn).toContain('refund_choice');
    expect(fn).toContain('serverChoice');
    expect(fn).toContain('return { success: true, refundChoice: serverChoice, unpaidCheckout }');
    expect(fn).toContain('TRAVELER_SELF_CANCEL_EMAIL_DIFF_FULL_REFUND');
    expect(fn).toContain('TRAVELER_SELF_CANCEL_EMAIL_DIFF_NO_REFUND');
    expect(fn).not.toMatch(
      /const cancelDiffAfter = unpaidCheckout[\s\S]*?effectiveChoice === 'full_refund'/
    );
  });

  it('MyBookings toast uses res.refundChoice from cancel', () => {
    const src = readFileSync(resolve(__dirname, '../pages/MyBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1726');
    expect(src).toContain('res.refundChoice');
    expect(src).toContain('serverChoice');
  });

  it('notify-customer-booking rebuilds booking_cancelled diffs from DB refund_choice', () => {
    const edge = readFileSync(
      resolve(__dirname, '../../supabase/functions/notify-customer-booking/index.ts'),
      'utf8'
    );
    expect(edge).toContain('Phase 1726');
    expect(edge).toContain('refund_choice');
    expect(edge).toContain('refundChoiceFromDb');
    expect(edge).toContain(TRAVELER_SELF_CANCEL_EMAIL_DIFF_FULL_REFUND);
    expect(edge).toContain(TRAVELER_SELF_CANCEL_EMAIL_DIFF_NO_REFUND);
    expect(edge).toContain(TRAVELER_CANCEL_NO_REFUND_EMAIL_FOOTER);
  });
});
