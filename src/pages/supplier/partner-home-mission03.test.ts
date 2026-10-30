import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  partnerBookingIsTodaySchedule,
  partnerBookingIsUpcomingSchedule,
  partnerBookingNextScheduleYmd,
  partnerRentalScheduleYmds,
} from '../../lib/trip-views';
import { formatRentalQuantityLabel } from '../../lib/rental-presentation';
import { partnerBookingDeskFamily } from '../../lib/pickup-completeness';
import { partnerBookingDeskPath } from '../../lib/partner-booking-desk-path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const rentalSnap = {
  inventoryFamily: 'rental' as const,
  pickupAt: '2026-10-30T09:00:00+03:00',
  returnAt: '2026-11-02T09:00:00+03:00',
  quantity: 1,
  listingTitle: 'Sony A7 IV',
  variantName: 'Body only',
  pickupAddress: 'Studio desk, Helsinki',
  rentalOpsStatus: 'awaiting_pickup' as const,
};

describe('Mission 03: Partner Home category-aware schedule', () => {
  it('places tours, stays, and rentals on Today independently', () => {
    const tour = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-10-30',
      purchase_snapshot: { inventoryFamily: 'tour' },
    };
    const stay = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-10-28',
      check_out: '2026-11-01',
      purchase_snapshot: { inventoryFamily: 'stay', checkOut: '2026-11-01' },
    };
    const rentalCollection = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-10-30',
      check_out: '2026-11-02',
      purchase_snapshot: rentalSnap,
    };
    const rentalReturnDay = {
      ...rentalCollection,
      purchase_snapshot: {
        ...rentalSnap,
        pickupAt: '2026-10-28T09:00:00+03:00',
        returnAt: '2026-10-30T09:00:00+03:00',
        rentalOpsStatus: 'collected' as const,
      },
    };

    expect(partnerBookingIsTodaySchedule(tour, '2026-10-30')).toBe(true);
    expect(partnerBookingIsTodaySchedule(tour, '2026-10-31')).toBe(false);

    expect(partnerBookingIsTodaySchedule(stay, '2026-10-30')).toBe(true);
    expect(partnerBookingIsTodaySchedule(stay, '2026-11-01')).toBe(true);
    expect(partnerBookingIsTodaySchedule(stay, '2026-11-02')).toBe(false);

    expect(partnerRentalScheduleYmds(rentalCollection).sort()).toEqual([
      '2026-10-30',
      '2026-11-02',
    ]);
    expect(partnerBookingIsTodaySchedule(rentalCollection, '2026-10-30')).toBe(true);
    expect(partnerBookingIsTodaySchedule(rentalCollection, '2026-10-31')).toBe(false);
    expect(partnerBookingIsTodaySchedule(rentalReturnDay, '2026-10-30')).toBe(true);
  });

  it('Next 7 days uses next collection/return/check-in/departure after today', () => {
    const tour = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-11-03',
      purchase_snapshot: { inventoryFamily: 'tour' },
    };
    const stay = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-11-04',
      check_out: '2026-11-07',
      purchase_snapshot: { inventoryFamily: 'stay', checkOut: '2026-11-07' },
    };
    const rental = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-10-30',
      check_out: '2026-11-02',
      purchase_snapshot: rentalSnap,
    };

    expect(partnerBookingIsUpcomingSchedule(tour, '2026-10-30')).toBe(true);
    expect(partnerBookingNextScheduleYmd(tour, '2026-10-30')).toBe('2026-11-03');

    expect(partnerBookingIsUpcomingSchedule(stay, '2026-10-30')).toBe(true);
    expect(partnerBookingNextScheduleYmd(stay, '2026-10-30')).toBe('2026-11-04');
    expect(partnerBookingIsUpcomingSchedule(stay, '2026-11-04')).toBe(false);

    // Collection is today — next schedule day is return.
    expect(partnerBookingIsUpcomingSchedule(rental, '2026-10-30')).toBe(true);
    expect(partnerBookingNextScheduleYmd(rental, '2026-10-30')).toBe('2026-11-02');
    expect(partnerBookingIsUpcomingSchedule(rental, '2026-11-02')).toBe(false);
  });

  it('routes each category to the correct partner desk and shows rental item qty', () => {
    const tour = { purchase_snapshot: { inventoryFamily: 'tour' } };
    const stay = {
      booking_date: '2026-10-28',
      check_out: '2026-11-01',
      purchase_snapshot: { inventoryFamily: 'stay' },
    };
    const rental = { purchase_snapshot: rentalSnap };

    expect(partnerBookingDeskFamily(tour)).toBe('tour');
    expect(partnerBookingDeskFamily(stay)).toBe('stay');
    expect(partnerBookingDeskFamily(rental)).toBe('rental');

    expect(partnerBookingDeskPath({ family: 'tour', bookingId: 't1' })).toBe(
      '/partner/bookings/t1'
    );
    expect(partnerBookingDeskPath({ family: 'stay', bookingId: 's1' })).toBe(
      '/partner/reservations/s1'
    );
    expect(partnerBookingDeskPath({ family: 'rental', bookingId: 'r1' })).toBe(
      '/partner/rental-bookings/r1'
    );

    expect(formatRentalQuantityLabel(1, 'cameras_electronics')).toBe('1 camera');
    expect(formatRentalQuantityLabel(2, 'cameras_electronics')).toBe('2 cameras');
    expect(formatRentalQuantityLabel(1, 'cameras_electronics')).not.toMatch(/guest/i);
  });
});

describe('Mission 03: Partner Home dashboard wiring', () => {
  it('Sales KPI, schedule labels, recent columns, and rental return attention are wired', () => {
    const home = readFileSync(join(root, 'pages/supplier/SupplierDashboard.tsx'), 'utf8');

    expect(home).toContain('computePartnerHomeSales30d');
    expect(home).toContain('remaining_gross_minor');
    expect(home).toContain('>Sales<');
    expect(home).toContain('sales30d.subtitle');
    expect(home).not.toContain('Your earnings');
    expect(home).not.toContain('remaining_supplier_minor');

    expect(home).toContain('partnerHomeScheduleEventsForToday');
    expect(home).toContain('partnerHomeScheduleEventsForNext7Days');
    expect(home).toContain('lifecycleRentalReturnYmd');
    expect(home).toContain('rentalReturnsToday');
    expect(home).toContain('Rental return today');
    expect(home).toContain('Collection overdue');
    expect(home).toContain('scheduleEvents.length');
    expect(home).toMatch(/event\$\{scheduleEvents\.length === 1 \? '' : 's'\}/);
    expect(home).toContain('partnerHomeScheduleEventKindLabel');
    expect(home).toContain('Collection');
    expect(home).toContain('Return');
    expect(home).toContain('formatRentalQuantityLabel');
    expect(home).toContain('rentalHandoverStatusLabel');

    expect(home).toContain('>Customer<');
    expect(home).toContain('>Listing<');
    expect(home).toContain('>Details<');
    expect(home).toContain('>Paid<');
    expect(home).toContain("family: 'rental'");
    expect(home).toContain('partnerBookingDeskFamily');

    // Tour pickup gaps stay tour-only; rentals use collection/return alerts.
    expect(home).toContain('if (bookingIsRental(b)) return false');
    expect(home).toContain('Rental collection today');
    expect(home).toContain('openSupplierReviews');
  });
});
