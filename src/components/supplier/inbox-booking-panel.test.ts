import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('InboxBookingPanel', () => {
  const src = readFileSync(resolve(__dirname, 'InboxBookingPanel.tsx'), 'utf8');

  it('keeps a compact essentials-only sidebar without private notes', () => {
    expect(src).toContain('resolvePartnerArrivalDisplay');
    expect(src).toContain('View full booking');
    expect(src).toContain('formatBookingParticipantsLabel');
    expect(src).toContain('tv-inbox-booking__pickup-time');
    expect(src).not.toContain('fetchSupplierBookingOpsNotes');
    expect(src).not.toContain('Private notes');
    expect(src).not.toContain('displayCheckInAddressFromPurchase');
    expect(src).not.toContain('displayStayHouseRulesFromPurchase');
    expect(src).not.toContain('Guest notes');
  });

  it('does not invent pickup for meeting-point bookings', () => {
    expect(src).toContain("pickupHm && arrival?.fulfillment === 'pickup'");
    expect(src).toContain('bookingIsStayNight');
  });
});

describe('BookingOpsNotesEditor on full booking pages', () => {
  it('is wired into Tour and Stay booking details', () => {
    const bookings = readFileSync(resolve(__dirname, '../../pages/supplier/SupplierBookings.tsx'), 'utf8');
    expect(bookings).toContain('BookingOpsNotesEditor');
    expect(bookings).toContain('privateNotesSlot');
    const tour = readFileSync(resolve(__dirname, 'TourOpsBookingDetail.tsx'), 'utf8');
    const stay = readFileSync(resolve(__dirname, 'StayOpsBookingDetail.tsx'), 'utf8');
    expect(tour).toContain('privateNotesSlot');
    expect(stay).toContain('privateNotesSlot');
  });
});
