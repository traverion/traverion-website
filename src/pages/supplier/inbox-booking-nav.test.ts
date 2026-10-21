import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Inbox ↔ Booking Details navigation', () => {
  it('Message guest opens Inbox with booking identity and return transition', () => {
    const bookings = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    const nav = readFileSync(resolve(__dirname, '../../lib/supplierPortalNavigation.ts'), 'utf8');
    expect(nav).toContain('fromBookingDetail');
    expect(nav).toContain('markPartnerPageTransition');
    expect(bookings).toContain('openBookingInbox');
    expect(bookings).toContain('leaveBookingDetail');
    expect(bookings).toContain('partnerInboxReturnMatches');
    expect(bookings).toContain('Back to Inbox');
    expect(bookings).toContain('tour-ops-detail--skeleton');
    expect(bookings).toContain('takePartnerBookingsDeskPrefetch');
  });

  it('layout applies directional main-pane enter classes', () => {
    const layout = readFileSync(resolve(__dirname, '../../components/supplier/SupplierLayout.tsx'), 'utf8');
    expect(layout).toContain('consumePartnerPageTransition');
    expect(layout).toContain('lux-page-enter--forward');
    expect(layout).toContain('lux-page-enter--back');
    expect(layout).toContain('pageEnterKey');
  });
});
