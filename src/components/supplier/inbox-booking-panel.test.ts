import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('InboxBookingPanel', () => {
  const src = readFileSync(resolve(__dirname, 'InboxBookingPanel.tsx'), 'utf8');

  it('reuses partner arrival helpers and private ops notes API', () => {
    expect(src).toContain('resolvePartnerArrivalDisplay');
    expect(src).toContain('fetchSupplierBookingOpsNotes');
    expect(src).toContain('upsertSupplierBookingOpsNote');
    expect(src).toContain('deleteSupplierBookingOpsNote');
    expect(src).toContain('Visible only to your team');
    expect(src).toContain('View full booking');
    expect(src).toContain('displayCheckInAddressFromPurchase');
    expect(src).toContain('formatBookingParticipantsLabel');
  });

  it('does not invent pickup for meeting-point bookings', () => {
    expect(src).toContain("arrival.fulfillment === 'pickup' && pickupHm");
    expect(src).toContain('bookingIsStayNight');
  });
});
