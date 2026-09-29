import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SUPPLIER_BOOKING_CANCELLED_FULL_REFUND_NOTIFY_SUB,
  SUPPLIER_BOOKING_CANCELLED_NO_REFUND_NOTIFY_SUB,
  TRAVELER_SELF_CANCEL_EMAIL_DIFF_FULL_REFUND,
  TRAVELER_SELF_CANCEL_EMAIL_DIFF_NO_REFUND,
} from '../lib/booking-confirmation-copy';

describe('Phase 1724: supplier cancel notify follows DB refund_choice', () => {
  it('notify-supplier-event selects refund_choice and rebuilds cancel fieldDiffs', () => {
    const edge = readFileSync(
      resolve(__dirname, '../../supabase/functions/notify-supplier-event/index.ts'),
      'utf8'
    );
    expect(edge).toContain('Phase 1139/1724');
    expect(edge).toContain('refund_choice');
    expect(edge).toContain("refundChoice === 'full_refund'");
    expect(edge).toContain("refundChoice === 'no_refund'");
    expect(edge).toContain(TRAVELER_SELF_CANCEL_EMAIL_DIFF_FULL_REFUND);
    expect(edge).toContain(TRAVELER_SELF_CANCEL_EMAIL_DIFF_NO_REFUND);
    expect(edge).toContain(SUPPLIER_BOOKING_CANCELLED_FULL_REFUND_NOTIFY_SUB);
    expect(edge).toContain(SUPPLIER_BOOKING_CANCELLED_NO_REFUND_NOTIFY_SUB);
    expect(edge).toContain('effectivePayload.refundChoice = refundChoice');
  });
});
