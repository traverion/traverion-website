import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bookingIsRental,
  bookingIsStayNight,
  bookingNeedsPickupCopy,
  partnerBookingDeskFamily,
  partnerBookingHasPickupAttention,
} from '../../lib/pickup-completeness';
import { resolvePartnerArrivalDisplay } from '../../lib/partner-booking-logistics';
import { partnerBookingDeskPath } from '../../lib/partner-booking-desk-path';

const sonyRental = {
  status: 'confirmed',
  payment_status: 'paid',
  check_out: '2030-06-02',
  nights: 1,
  pickup_time: null,
  purchase_snapshot: {
    inventoryFamily: 'rental',
    variantId: 'sony-a7iv',
    quantity: 1,
    pickupAt: '2030-06-01T09:00:00.000Z',
    returnAt: '2030-06-02T09:00:00.000Z',
    durationCount: 1,
    durationUnit: 'day',
    unitMinor: 8900,
    customerTotalMinor: 8900,
    commissionMinor: 1335,
    supplierEarningsMinor: 7565,
    commissionBps: 1500,
    discountApplied: false,
    currency: 'EUR',
    rentalOpsStatus: 'awaiting_pickup',
    listingTitle: 'Sony A7 IV',
    pickupAddress: 'Collection desk, Helsinki',
    pickupInstructions: 'Show booking QR',
  },
};

const tourNeedsPickup = {
  status: 'confirmed',
  payment_status: 'paid',
  check_out: null,
  pickup_time: null,
  purchase_snapshot: {
    fulfillment: 'pickup',
    meetingPoint: null,
    pickupInstructions: null,
  },
};

const meetingPointTour = {
  status: 'confirmed',
  payment_status: 'paid',
  check_out: null,
  pickup_time: null,
  purchase_snapshot: {
    fulfillment: 'meeting_point',
    meetingPoint: 'Santa Claus Village gate, Rovaniemi',
    pickupInstructions: null,
    capturedAt: '2026-01-01T00:00:00.000Z',
    listingTitle: 'Aurora',
    optionLabel: 'Standard',
    startTimeHm: '20:00',
  },
};

const stayReservation = {
  status: 'confirmed',
  payment_status: 'paid',
  check_out: '2030-07-05',
  nights: 2,
  purchase_snapshot: { checkOut: '2030-07-05' },
};

describe('Mission 01: booking category routing', () => {
  it('keeps accommodation-pickup tours in pickup attention', () => {
    expect(bookingNeedsPickupCopy(tourNeedsPickup, 'Meet', '')).toBe(true);
    expect(partnerBookingHasPickupAttention(tourNeedsPickup, 'Meet', '')).toBe(true);
    expect(partnerBookingDeskFamily(tourNeedsPickup)).toBe('tour');
  });

  it('does not require guest pickup assignment for meeting-point-only tours with a place', () => {
    const arrival = resolvePartnerArrivalDisplay({
      purchaseSnapshot: meetingPointTour.purchase_snapshot,
    });
    expect(arrival.rail).toBe('meeting_point');
    expect(arrival.needsLocation).toBe(false);
    expect(
      partnerBookingHasPickupAttention(
        meetingPointTour,
        meetingPointTour.purchase_snapshot.meetingPoint,
        ''
      )
    ).toBe(false);
  });

  it('never treats confirmed stays as tour pickup work', () => {
    expect(bookingIsStayNight(stayReservation)).toBe(true);
    expect(bookingNeedsPickupCopy(stayReservation, '', '')).toBe(false);
    expect(partnerBookingHasPickupAttention(stayReservation, '', '')).toBe(false);
    expect(partnerBookingDeskFamily(stayReservation)).toBe('stay');
    expect(
      partnerBookingDeskPath({ family: 'stay', bookingId: 'stay-1' })
    ).toContain('/partner/reservations/stay-1');
  });

  it('routes Sony A7 IV rentals to rental bookings, never tour pickup attention', () => {
    expect(bookingIsRental(sonyRental)).toBe(true);
    expect(bookingIsStayNight(sonyRental)).toBe(false);
    expect(bookingNeedsPickupCopy(sonyRental, '', '')).toBe(false);
    expect(partnerBookingHasPickupAttention(sonyRental, '', '')).toBe(false);
    expect(partnerBookingDeskFamily(sonyRental)).toBe('rental');
    expect(
      partnerBookingDeskPath({ family: 'rental', bookingId: 'rental-sony' })
    ).toContain('/partner/rental-bookings/rental-sony');
  });

  it('does not flag Location needed when rental collection address exists', () => {
    const arrival = resolvePartnerArrivalDisplay({
      purchaseSnapshot: sonyRental.purchase_snapshot,
    });
    expect(arrival.railLabel).toBe('Collection');
    expect(arrival.place).toBe('Collection desk, Helsinki');
    expect(arrival.needsLocation).toBe(false);
  });

  it('Pickup planner and Partner Home exclude rentals from tour pickup surfaces', () => {
    const planner = readFileSync(
      resolve(__dirname, 'SupplierPickupPlanner.tsx'),
      'utf8'
    );
    expect(planner).toContain('bookingIsRental');
    expect(planner).toContain('rentalListingIds');
    expect(planner).toContain('!bookingIsRental(b)');

    const home = readFileSync(resolve(__dirname, 'SupplierDashboard.tsx'), 'utf8');
    expect(home).toContain('rentalCollectionsToday');
    expect(home).toContain('Rental collection today');
    expect(home).toContain("family: 'rental'");
    expect(home).toContain('partnerBookingDeskFamily');
    expect(home).toContain('if (bookingIsRental(b)) return false');
  });
});
