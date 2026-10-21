import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Partner Message guest entry points', () => {
  it('Bookings and Reservations open Inbox with the booking id', () => {
    const bookings = readFileSync(resolve(__dirname, '../pages/supplier/SupplierBookings.tsx'), 'utf8');
    const nav = readFileSync(resolve(__dirname, './supplierPortalNavigation.ts'), 'utf8');
    const inbox = readFileSync(resolve(__dirname, '../pages/supplier/SupplierInbox.tsx'), 'utf8');

    expect(nav).toContain('export function openSupplierInbox');
    expect(nav).toContain("q.set('booking', bookingId)");
    expect(bookings).toContain('openSupplierInbox(booking.id)');
    expect(bookings.match(/openSupplierInbox\(booking\.id\)/g)?.length).toBeGreaterThanOrEqual(3);

    // Deep-linked booking stays visible even without prior messages.
    expect(inbox).toContain('deepLinkId');
    expect(inbox).toContain('listed.unshift(deep)');
    expect(inbox).toContain('BookingMessageThread');
    expect(inbox).toContain('composeBlock');
  });

  it('supplier shell no longer shows the full-width Stripe test banner', () => {
    const layout = readFileSync(
      resolve(__dirname, '../components/supplier/SupplierLayout.tsx'),
      'utf8'
    );
    expect(layout).not.toContain('partner-test-banner');
    expect(layout).not.toContain('appStripeIsTestMode');
  });
});
