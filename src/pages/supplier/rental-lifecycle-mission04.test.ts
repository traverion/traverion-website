import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RentalOpsBookingCard, {
  type RentalOpsCardModel,
} from '../../components/supplier/RentalOpsBookingCard';
import RentalOpsBookingDetail from '../../components/supplier/RentalOpsBookingDetail';
import {
  partnerHomeScheduleEventsForToday,
} from '../../lib/partner-home-schedule';
import {
  rentalBookingSimpleStatusLabel,
  rentalScheduledReturnElapsed,
} from '../../lib/rental-booking-status';
import { bookingMatchesTripView } from '../../lib/trip-views';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Mission 04.1: rental lifecycle final verification', () => {
  it('partner UI sources omit handover actions and overdue warnings', () => {
    const home = readFileSync(join(root, 'pages/supplier/SupplierDashboard.tsx'), 'utf8');
    const bookings = readFileSync(join(root, 'pages/supplier/SupplierBookings.tsx'), 'utf8');
    const card = readFileSync(join(root, 'components/supplier/RentalOpsBookingCard.tsx'), 'utf8');
    const detail = readFileSync(join(root, 'components/supplier/RentalOpsBookingDetail.tsx'), 'utf8');
    const trips = readFileSync(join(root, 'pages/MyBookings.tsx'), 'utf8');

    expect(home).toContain('rentalBookingSimpleStatusLabel');
    expect(home).toContain('partnerHomeScheduleEventsForToday');
    expect(home).not.toContain('Collection overdue');
    expect(home).not.toContain('rentalHandoverStatusLabel');

    expect(bookings).toContain('rentalBookingSimpleStatusLabel');
    expect(bookings).not.toContain('requestRentalHandover');
    expect(bookings).not.toContain('setRentalOpsStatus');
    expect(bookings).not.toContain('Mark collected');

    expect(card).not.toContain('handoverLabel');
    expect(detail).not.toContain('Handover');
    expect(detail).not.toContain('Mark returned');
    expect(detail).toContain('Rental terms');

    expect(trips).toContain('rentalBookingSimpleStatusLabel');
    // Legacy RPC file may remain — UI must not call it.
    expect(bookings).not.toContain("set_rental_ops_status");
  });

  it('renders only simplified status chips on card and detail', () => {
    const model: RentalOpsCardModel = {
      id: 'r1',
      listingTitle: 'Sony A7 IV',
      variantLabel: null,
      imageUrl: null,
      customerName: 'Ada',
      customerEmail: null,
      customerPhone: null,
      customerNotes: null,
      periodLine: '22 Sep 09:00 → 22 Sep 18:00',
      collectionLabel: '22 Sep 09:00',
      returnLabel: '22 Sep 18:00',
      quantityLabel: '1 camera',
      statusLabel: 'Confirmed',
      statusClass: '',
      referenceLabel: 'TV-1',
      purchaseDateLabel: null,
      collectionPlace: 'Desk',
      returnPlace: 'Desk',
      warning: null,
      guestPaidLabel: null,
      commissionLabel: null,
      commissionRateLabel: null,
      earningsLabel: null,
      financeLoading: false,
      paymentLabel: 'Paid',
      termsSummary: null,
    };
    const cardHtml = renderToStaticMarkup(
      createElement(RentalOpsBookingCard, {
        model,
        expanded: false,
        selected: false,
        checkbox: createElement('span'),
        onToggleExpand: () => undefined,
        onOpenDetails: () => undefined,
        onMessageCustomer: () => undefined,
        onCopyReference: () => undefined,
      })
    );
    expect(cardHtml).toContain('Confirmed');
    expect(cardHtml).not.toContain('Awaiting collection');
    expect(cardHtml).not.toContain('Awaiting return');

    const detailHtml = renderToStaticMarkup(
      createElement(RentalOpsBookingDetail, {
        model: {
          referenceLabel: 'TV-1',
          statusLabel: 'Completed',
          statusClass: '',
          listingTitle: 'Sony A7 IV',
          variantLabel: null,
          imageUrl: null,
          periodLine: '22 Sep 09:00 → 22 Sep 18:00',
          quantityLabel: '1 camera',
          customerName: 'Ada',
          customerEmail: null,
          customerPhone: null,
          requestNotes: null,
          collectionLabel: '22 Sep 09:00',
          returnLabel: '22 Sep 18:00',
          collectionPlace: 'Desk',
          returnPlace: 'Desk',
          returnSameAsCollection: true,
          collectionInstructions: null,
          returnInstructions: null,
          collectionLat: null,
          collectionLng: null,
          returnLat: null,
          returnLng: null,
          cancellationLabel: null,
          depositDisclosure: null,
          unpaidHoldMessage: null,
          cancelWaitingMessage: null,
          finance: {
            state: 'missing',
            customerPaid: null,
            commission: null,
            commissionRate: null,
            supplierEarnings: null,
            paymentStatus: 'Paid',
            commissionAdjusted: false,
          },
        },
        activity: [],
        canEdit: true,
        onBack: () => undefined,
        onCopyReference: () => undefined,
        onMessageCustomer: () => undefined,
      })
    );
    expect(detailHtml).toContain('Completed');
    expect(detailHtml).not.toContain('Mark collected');
    expect(detailHtml).not.toContain('Handover');
  });

  it('same-day Collection and Return schedule events stay separate', () => {
    const booking = {
      id: 'same-day',
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-09-20',
      check_out: '2026-09-20',
      purchase_snapshot: {
        inventoryFamily: 'rental',
        variantId: 'v1',
        quantity: 1,
        pickupAt: '2026-09-20T09:00:00+03:00',
        returnAt: '2026-09-20T18:00:00+03:00',
        durationCount: 1,
        durationUnit: 'day',
        unitMinor: 100,
        customerTotalMinor: 100,
        commissionMinor: 15,
        supplierEarningsMinor: 85,
        commissionBps: 1500,
        currency: 'EUR',
        rentalOpsStatus: 'returned',
        departureTimezone: 'Europe/Helsinki',
      },
    };
    const events = partnerHomeScheduleEventsForToday(
      [booking],
      Date.parse('2026-09-20T12:00:00+03:00')
    );
    expect(events.map((e) => e.kind)).toEqual(['rental_collection', 'rental_return']);
    expect(events.every((e) => e.collectionOverdue === false)).toBe(true);
    // Legacy returned ops must not hide schedule events or force Completed before return time.
    expect(
      rentalBookingSimpleStatusLabel(booking, Date.parse('2026-09-20T12:00:00+03:00'))
    ).toBe('Confirmed');
  });

  it('Trips Upcoming/Past flip at return datetime; legacy ops cannot override', () => {
    const returnAt = '2026-09-22T18:00:00+03:00';
    const returnMs = Date.parse(returnAt);
    const booking = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-09-20',
      check_out: '2026-09-22',
      purchase_snapshot: {
        inventoryFamily: 'rental',
        pickupAt: '2026-09-20T09:00:00+03:00',
        returnAt,
        rentalOpsStatus: 'returned',
        departureTimezone: 'Europe/Helsinki',
      },
    };
    expect(rentalScheduledReturnElapsed(booking, returnMs - 1)).toBe(false);
    expect(bookingMatchesTripView(booking, 'upcoming', undefined, returnMs - 1)).toBe(true);
    expect(bookingMatchesTripView(booking, 'past', undefined, returnMs - 1)).toBe(false);
    expect(bookingMatchesTripView(booking, 'past', undefined, returnMs)).toBe(true);
    expect(rentalBookingSimpleStatusLabel(booking, returnMs)).toBe('Completed');
  });
});
