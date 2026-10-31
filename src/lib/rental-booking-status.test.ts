import { describe, expect, it } from 'vitest';
import {
  rentalBookingIsScheduleCompleted,
  rentalBookingSimpleStatus,
  rentalBookingSimpleStatusLabel,
} from './rental-booking-status';

function rental(partial: {
  status?: string;
  payment_status?: string;
  pickupAt: string;
  returnAt: string;
  rentalOpsStatus?: string;
}) {
  return {
    status: partial.status ?? 'confirmed',
    payment_status: partial.payment_status ?? 'paid',
    booking_date: partial.pickupAt.slice(0, 10),
    check_out: partial.returnAt.slice(0, 10),
    purchase_snapshot: {
      inventoryFamily: 'rental',
      pickupAt: partial.pickupAt,
      returnAt: partial.returnAt,
      rentalOpsStatus: partial.rentalOpsStatus ?? 'awaiting_pickup',
      departureTimezone: 'Europe/Helsinki',
    },
  };
}

describe('Mission 04: rental simple booking status', () => {
  it('maps confirmed rentals to Confirmed before scheduled return', () => {
    const b = rental({
      pickupAt: '2026-09-20T09:00:00+03:00',
      returnAt: '2026-09-22T18:00:00+03:00',
      rentalOpsStatus: 'awaiting_pickup',
    });
    expect(rentalBookingSimpleStatus(b, '2026-09-21')).toBe('confirmed');
    expect(rentalBookingSimpleStatusLabel(b, '2026-09-21')).toBe('Confirmed');
    expect(rentalBookingIsScheduleCompleted(b, '2026-09-21')).toBe(false);
  });

  it('completes automatically after scheduled return without handover ops', () => {
    const b = rental({
      pickupAt: '2026-09-20T09:00:00+03:00',
      returnAt: '2026-09-22T18:00:00+03:00',
      // Legacy ops ignored — still Completed by schedule.
      rentalOpsStatus: 'awaiting_pickup',
    });
    expect(rentalBookingIsScheduleCompleted(b, '2026-09-23')).toBe(true);
    expect(rentalBookingSimpleStatusLabel(b, '2026-09-23')).toBe('Completed');
    // Return day itself remains Confirmed.
    expect(rentalBookingSimpleStatusLabel(b, '2026-09-22')).toBe('Confirmed');
  });

  it('keeps Cancelled for cancelled / refunded rows', () => {
    expect(
      rentalBookingSimpleStatusLabel(
        rental({
          status: 'cancelled',
          payment_status: 'paid',
          pickupAt: '2026-09-20T09:00:00+03:00',
          returnAt: '2026-09-22T18:00:00+03:00',
        }),
        '2026-09-30'
      )
    ).toBe('Cancelled');
    expect(
      rentalBookingSimpleStatusLabel(
        rental({
          status: 'confirmed',
          payment_status: 'refunded',
          pickupAt: '2026-09-20T09:00:00+03:00',
          returnAt: '2026-09-22T18:00:00+03:00',
        }),
        '2026-09-30'
      )
    ).toBe('Cancelled');
  });

  it('ignores collected/returned ops for status chips (soft migrate)', () => {
    const collected = rental({
      pickupAt: '2026-09-20T09:00:00+03:00',
      returnAt: '2026-09-22T18:00:00+03:00',
      rentalOpsStatus: 'collected',
    });
    const returnedEarly = rental({
      pickupAt: '2026-09-20T09:00:00+03:00',
      returnAt: '2026-09-22T18:00:00+03:00',
      rentalOpsStatus: 'returned',
    });
    expect(rentalBookingSimpleStatusLabel(collected, '2026-09-21')).toBe('Confirmed');
    expect(rentalBookingSimpleStatusLabel(returnedEarly, '2026-09-21')).toBe('Confirmed');
    expect(rentalBookingSimpleStatusLabel(returnedEarly, '2026-09-23')).toBe('Completed');
  });
});
