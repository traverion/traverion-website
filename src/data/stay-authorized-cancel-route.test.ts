import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('authorized stay request cancel routing', () => {
  it('cancelBookingAsCustomer withdraws authorized holds instead of cancel_booking_as_traveler', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-bookings.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export async function cancelBookingAsCustomer'));
    expect(fn).toContain("payment_status ?? '').trim().toLowerCase() === 'authorized'");
    expect(fn).toContain("stayBookingRequestAction({ bookingId, action: 'withdraw' })");
    // Withdraw path returns before the traveler cancel RPC for authorized rows.
    const authorizedIdx = fn.indexOf("=== 'authorized'");
    const rpcIdx = fn.indexOf("rpc('cancel_booking_as_traveler'");
    expect(authorizedIdx).toBeGreaterThan(-1);
    expect(rpcIdx).toBeGreaterThan(authorizedIdx);
  });

  it('SQL cancel_booking_as_traveler rejects authorized payment_status', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/256_cancel_rejects_authorized_stay_request.sql'),
      'utf8'
    );
    expect(sql).toContain("v_pay = 'authorized'");
    expect(sql).toMatch(/Withdraw this stay request to release the payment authorization/i);
  });
});
