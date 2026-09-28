import { describe, expect, it } from 'vitest';
import {
  customerLifecycleNotifyAllowed,
  supplierLifecycleNotifyAllowed,
} from '../../supabase/functions/_shared/notify-lifecycle-gate.ts';

describe('customerLifecycleNotifyAllowed', () => {
  it('blocks booking_cancelled / cancellation_accepted unless status is cancelled', () => {
    expect(
      customerLifecycleNotifyAllowed({ kind: 'booking_cancelled', bookingStatus: 'confirmed' })
    ).toEqual({ ok: false, error: 'Booking is not cancelled', status: 409 });
    expect(
      customerLifecycleNotifyAllowed({ kind: 'cancellation_accepted', bookingStatus: 'confirmed' })
    ).toEqual({ ok: false, error: 'Booking is not cancelled', status: 409 });
    expect(
      customerLifecycleNotifyAllowed({ kind: 'booking_cancelled', bookingStatus: 'cancelled' })
    ).toEqual({ ok: true });
  });

  it('requires an open cancellation_requests row for supplier request mail', () => {
    expect(
      customerLifecycleNotifyAllowed({
        kind: 'cancellation_requested_by_supplier',
        bookingStatus: 'confirmed',
        openCancellationRequest: false,
      })
    ).toEqual({
      ok: false,
      error: 'No open cancellation request for this booking',
      status: 409,
    });
    expect(
      customerLifecycleNotifyAllowed({
        kind: 'cancellation_requested_by_supplier',
        bookingStatus: 'confirmed',
        openCancellationRequest: true,
      })
    ).toEqual({ ok: true });
  });

  it('requires declined request + active booking for cancellation_declined', () => {
    expect(
      customerLifecycleNotifyAllowed({
        kind: 'cancellation_declined',
        bookingStatus: 'cancelled',
        declinedCancellationRequest: true,
      })
    ).toEqual({ ok: false, error: 'Booking is cancelled', status: 409 });
    expect(
      customerLifecycleNotifyAllowed({
        kind: 'cancellation_declined',
        bookingStatus: 'confirmed',
        declinedCancellationRequest: true,
      })
    ).toEqual({ ok: true });
  });

  it('does not gate non-lifecycle kinds', () => {
    expect(
      customerLifecycleNotifyAllowed({ kind: 'your_details_updated', bookingStatus: 'confirmed' })
    ).toEqual({ ok: true });
  });
});

describe('supplierLifecycleNotifyAllowed', () => {
  it('blocks forged cancel / accept events on active bookings', () => {
    expect(
      supplierLifecycleNotifyAllowed({ eventType: 'booking_cancelled', bookingStatus: 'confirmed' })
    ).toEqual({ ok: false, error: 'Booking is not cancelled', status: 409 });
    expect(
      supplierLifecycleNotifyAllowed({ eventType: 'booking_cancelled', bookingStatus: 'cancelled' })
    ).toEqual({ ok: true });
  });
});
