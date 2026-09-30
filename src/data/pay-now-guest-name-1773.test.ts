import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1773: Pay now resume passes customerName when guest_name empty', () => {
  it('resumePendingBookingCheckout accepts and forwards customerName', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-bookings.ts'), 'utf8');
    expect(src).toContain('Phase 1773');
    const fn = src.slice(
      src.indexOf('export async function resumePendingBookingCheckout'),
      src.indexOf('/**\n * @deprecated Client INSERT')
    );
    expect(fn).toContain('customerName');
    expect(fn).toContain('...(customerName ? { customerName } : {})');
  });

  it('MyBookings and Confirmation Pay now supply a fallback name', () => {
    const trips = readFileSync(resolve(__dirname, '../pages/MyBookings.tsx'), 'utf8');
    expect(trips).toContain('Phase 1773');
    expect(trips).toContain('customerName');
    expect(trips).toContain('resumePendingBookingCheckout({ bookingId: b.id, customerName })');

    const conf = readFileSync(resolve(__dirname, '../pages/BookingConfirmationPage.tsx'), 'utf8');
    expect(conf).toContain('Phase 1773');
    expect(conf).toContain('resumePendingBookingCheckout({ bookingId: booking.id, customerName })');
  });
});
