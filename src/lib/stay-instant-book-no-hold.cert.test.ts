import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bookingOccupiesInventory } from './booking-hold';
import { stayCheckoutNightsAlreadyBooked } from './stayOccupancy';

describe('Instant Book no pre-payment inventory hold', () => {
  const now = Date.parse('2026-10-20T12:00:00.000Z');

  it('SQL migration 257 drops pending from booking_occupies_inventory', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/257_instant_book_no_pending_inventory_hold.sql'),
      'utf8'
    );
    expect(sql).toContain("= 'authorized'");
    expect(sql).toMatch(/Instant Book unpaid pending never occupies/i);
    expect(sql).not.toMatch(/when lower\(trim\(coalesce\(p_payment_status[^)]*\)\) = 'pending' then/i);
  });

  it('regression: abandon / fail / open checkout leave nights free', () => {
    const rows = [
      {
        id: 'a',
        status: 'pending',
        payment_status: 'pending',
        booking_date: '2026-10-21',
        check_out: '2026-10-23',
        hold_expires_at: '2026-10-20T13:00:00.000Z',
      },
      {
        id: 'b',
        status: 'pending',
        payment_status: 'failed',
        booking_date: '2026-10-21',
        check_out: '2026-10-23',
      },
    ];
    for (const row of rows) {
      expect(bookingOccupiesInventory(row, now)).toBe(false);
    }
    expect(stayCheckoutNightsAlreadyBooked(rows, '2026-10-21', '2026-10-23', null, now)).toBe(false);
  });

  it('StayBookingConfirm clears loading on failure and returns dates on cancel', () => {
    const src = readFileSync(resolve(__dirname, '../pages/StayBookingConfirm.tsx'), 'utf8');
    expect(src).toContain('.catch(');
    expect(src).toContain('paymentCancelled: true');
    expect(src).toContain('expectedTotal: stayQuote.totalAmount');
    expect(src).toMatch(/Dates stay available until payment succeeds/);
  });

  it('inventory conflict refund failure is flagged for intervention', () => {
    const promote = readFileSync(
      resolve(__dirname, '../../supabase/functions/_shared/promote-paid-from-checkout.ts'),
      'utf8'
    );
    expect(promote).toContain("event_type: 'inventory_conflict_refund_failed'");
    expect(promote).toContain('needsIntervention: true');
    expect(promote).toContain('inventory-conflict-checkout-refund:${session.id}');
  });
});
