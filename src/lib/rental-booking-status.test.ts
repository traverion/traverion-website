import { describe, expect, it } from 'vitest';
import {
  rentalBookingIsScheduleCompleted,
  rentalBookingSimpleStatus,
  rentalBookingSimpleStatusLabel,
  rentalScheduledReturnAtMs,
  rentalScheduledReturnElapsed,
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

describe('Mission 04.1: rental Completed at exact return datetime', () => {
  const returnAt = '2026-09-22T18:00:00+03:00';
  const returnMs = Date.parse(returnAt);

  it('resolves scheduled return to the listing-local instant', () => {
    const b = rental({
      pickupAt: '2026-09-20T09:00:00+03:00',
      returnAt,
    });
    expect(rentalScheduledReturnAtMs(b)).toBe(returnMs);
  });

  it('stays Confirmed until the exact return instant', () => {
    const b = rental({
      pickupAt: '2026-09-20T09:00:00+03:00',
      returnAt,
      rentalOpsStatus: 'awaiting_pickup',
    });
    expect(rentalBookingIsScheduleCompleted(b, returnMs - 1)).toBe(false);
    expect(rentalBookingSimpleStatusLabel(b, returnMs - 1)).toBe('Confirmed');
    expect(rentalScheduledReturnElapsed(b, returnMs - 1)).toBe(false);
  });

  it('becomes Completed at the return instant (same calendar day after time)', () => {
    const b = rental({
      pickupAt: '2026-09-20T09:00:00+03:00',
      returnAt,
      rentalOpsStatus: 'awaiting_pickup',
    });
    expect(rentalBookingIsScheduleCompleted(b, returnMs)).toBe(true);
    expect(rentalBookingSimpleStatusLabel(b, returnMs)).toBe('Completed');
    expect(rentalBookingSimpleStatus(b, returnMs + 60_000)).toBe('completed');
  });

  it('keeps Cancelled for cancelled / refunded rows', () => {
    expect(
      rentalBookingSimpleStatusLabel(
        rental({
          status: 'cancelled',
          payment_status: 'paid',
          pickupAt: '2026-09-20T09:00:00+03:00',
          returnAt,
        }),
        returnMs + 86_400_000
      )
    ).toBe('Cancelled');
    expect(
      rentalBookingSimpleStatusLabel(
        rental({
          status: 'confirmed',
          payment_status: 'refunded',
          pickupAt: '2026-09-20T09:00:00+03:00',
          returnAt,
        }),
        returnMs + 86_400_000
      )
    ).toBe('Cancelled');
  });

  it('ignores collected/returned ops for status chips (soft migrate)', () => {
    const collected = rental({
      pickupAt: '2026-09-20T09:00:00+03:00',
      returnAt,
      rentalOpsStatus: 'collected',
    });
    const returnedEarly = rental({
      pickupAt: '2026-09-20T09:00:00+03:00',
      returnAt,
      rentalOpsStatus: 'returned',
    });
    expect(rentalBookingSimpleStatusLabel(collected, returnMs - 1)).toBe('Confirmed');
    expect(rentalBookingSimpleStatusLabel(returnedEarly, returnMs - 1)).toBe('Confirmed');
    expect(rentalBookingSimpleStatusLabel(returnedEarly, returnMs)).toBe('Completed');
  });
});
