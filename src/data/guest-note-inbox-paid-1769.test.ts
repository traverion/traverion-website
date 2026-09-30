import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1769: guest note Inbox post only after paid', () => {
  it('skips postBookingMessage when payment was never collected', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-bookings.ts'), 'utf8');
    expect(src).toContain('Phase 1769');
    expect(src).toContain('bookingPaymentWasCollected');
    const fn = src.slice(
      src.indexOf('export async function updateGuestBookingSpecialRequests'),
      src.indexOf('export async function fetchBookingsForSupplier')
    );
    expect(fn).toContain('payment_status');
    expect(fn).toMatch(
      /fieldDiffs\.length > 0 && bookingPaymentWasCollected\(row\.payment_status\)/
    );
  });
});
