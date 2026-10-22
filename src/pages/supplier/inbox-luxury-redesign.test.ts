import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Partner Inbox luxury redesign', () => {
  it('uses premium workspace chrome and conversation row structure', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierInbox.tsx'), 'utf8');
    expect(src).toContain('partner-inbox');
    expect(src).toContain('tv-inbox-search');
    expect(src).toContain('tv-inbox-thread__avatar');
    expect(src).toContain('tv-inbox-chat__guest');
    expect(src).toContain('tv-inbox-empty-pane');
    expect(src).toContain('tv-btn-secondary');
    expect(src).toContain('Select a conversation');
    expect(src).toContain('View booking');
    expect(src).toContain('openCanonicalBooking');
    expect(src).toContain('tv-inbox-view-booking');
    expect(src).toContain('tv-inbox-chat-skeleton');
    expect(src).toContain('InboxBookingPanel');
    expect(src).toContain('tv-inbox-booking-pane');
    expect(src).toContain('INBOX_BOOKING_DOCK_MIN_PX');
  });

  it('opens canonical Tour/Stay booking details and docks a contextual booking panel', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierInbox.tsx'), 'utf8');
    expect(src).toContain('openSupplierBooking');
    expect(src).toContain('bookingIsStayNight(booking) || isStayRequestAwaitingHost(booking)');
    expect(src).toContain('writePartnerInboxUiState');
    expect(src).toContain('inboxListingLine');
    expect(src).toContain('inboxHeaderExperienceTitle');
    expect(src).toContain('rememberPartnerInboxReturn');
    expect(src).toContain('markPartnerPageTransition');
    expect(src).toContain('prefetchPartnerBookingsDesk');
    expect(src).toContain('partner-inbox-booking-panel');
    expect(src).not.toContain('Open in Reservations');
    expect(src).not.toContain('Open in Bookings');
    expect(src).not.toContain('partnerPaymentLabel');
  });

  it('keeps list and booking panes in the compact width band', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('width: 18.5rem');
    expect(css).toContain('min-width: 17.5rem');
    expect(css).toContain('max-width: 19.5rem');
    expect(css).toContain('.tv-inbox-booking-pane');
    expect(css).toContain('.tv-inbox-booking__ref-code');
    expect(css).not.toContain('.tv-inbox-booking__note-input');
    expect(css).toContain('.tv-inbox-chat__title-row');
    expect(css).toContain('.tv-inbox-chat__experience');
    expect(css).toContain('.lux-page-enter--forward');
    expect(css).toContain('.lux-page-enter--back');
  });

  it('hides header View booking while the booking panel is open', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierInbox.tsx'), 'utf8');
    expect(src).toContain('!showBookingPanel ? (');
    expect(src).toContain('View booking');
  });

  it('preserves URL booking selection across partner workspace clear', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierInbox.tsx'), 'utf8');
    expect(src).toContain('preserveUrlBooking');
    expect(src).toContain('setOpenId(preserveUrlBooking ? readBookingIdFromUrl() : null)');
  });
});
