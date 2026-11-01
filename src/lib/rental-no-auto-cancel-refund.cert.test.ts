import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Mission 06.5 — rental no automatic cancel refund', () => {
  const root = resolve(__dirname, '../..');
  const mig = readFileSync(
    resolve(root, 'supabase/migrations/297_rental_no_auto_cancel_refund.sql'),
    'utf8'
  );
  const edge = readFileSync(
    resolve(root, 'supabase/functions/execute-booking-refund/index.ts'),
    'utf8'
  );
  const bookings = readFileSync(resolve(root, 'src/data/supabase-bookings.ts'), 'utf8');
  const policy = readFileSync(resolve(root, 'src/lib/rental-cancellation.ts'), 'utf8');

  it('SQL ensure skips rentals via booking_is_rental', () => {
    expect(mig).toContain('rental_no_auto_refund');
    expect(mig).toContain('booking_is_rental');
    expect(mig).toContain('skipped');
    expect(mig).toMatch(/if public\.booking_is_rental\(v_booking\)/);
  });

  it('execute-booking-refund refuses rental purchase_snapshot', () => {
    expect(edge).toContain('rental_no_auto_refund');
    expect(edge).toContain("snapFamily === 'rental'");
  });

  it('traveler cancel client skips executeBookingRefund for rentals', () => {
    const fn = bookings.slice(bookings.indexOf('export async function cancelBookingAsCustomer'));
    expect(fn).toContain('isRentalCancel');
    expect(fn).toMatch(/full_refund' && !isRentalCancel/);
  });

  it('product copy still states no automatic rental refunds', () => {
    expect(policy).toContain('does not issue automatic rental refunds');
  });
});
