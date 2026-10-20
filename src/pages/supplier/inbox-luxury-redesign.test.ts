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
  });

  it('keeps Stay versus tour booking context distinct in the open header', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierInbox.tsx'), 'utf8');
    expect(src).toContain("bookingIsStayNight(openBooking) || isStayRequestAwaitingHost(openBooking)");
    expect(src).toContain("'Stay'");
    expect(src).toContain('Open in Reservations');
    expect(src).toContain('Open in Bookings');
  });
});
