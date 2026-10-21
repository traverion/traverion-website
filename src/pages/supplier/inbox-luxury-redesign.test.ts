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
    expect(src).not.toContain('setDetailsOpen');
    expect(src).not.toMatch(/className=["'][^"']*tv-inbox-details["']/);
  });

  it('opens canonical Tour/Stay booking details without a third-column panel', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierInbox.tsx'), 'utf8');
    expect(src).toContain('openSupplierBooking');
    expect(src).toContain('bookingIsStayNight(booking) || isStayRequestAwaitingHost(booking)');
    expect(src).toContain('resolvePartnerArrivalDisplay');
    expect(src).toContain('writePartnerInboxUiState');
    expect(src).toContain('inboxListingLine');
    expect(src).not.toContain('Open in Reservations');
    expect(src).not.toContain('Open in Bookings');
  });

  it('keeps list pane width in the compact 320–360px range', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('width: 21.5rem');
    expect(css).toContain('min-width: 20rem');
    expect(css).toContain('max-width: 22.5rem');
    expect(css).toContain('.tv-inbox-chat__title-row');
    expect(css).toContain('.tv-inbox-chat__chip');
  });
});
