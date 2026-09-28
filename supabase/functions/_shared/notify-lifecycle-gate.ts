/**
 * Phase 1511: lifecycle notify templates must match booking / cancellation_request
 * truth. Party JWTs may invoke cancel-related kinds, but must not forge
 * "cancelled" / "Cancellation confirmed" mail while the booking is still active.
 */

export type LifecycleNotifyGate = { ok: true } | { ok: false; error: string; status: number };

function normStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase();
}

/** Customer email kinds that assert the booking is already cancelled. */
export function customerEmailKindRequiresCancelledBooking(kind: string): boolean {
  const k = (kind ?? '').trim();
  return k === 'booking_cancelled' || k === 'cancellation_accepted';
}

/** Customer email kinds that assert an open supplier cancellation request. */
export function customerEmailKindRequiresOpenCancellationRequest(kind: string): boolean {
  return (kind ?? '').trim() === 'cancellation_requested_by_supplier';
}

/** Customer email kinds that assert a declined request and an active booking. */
export function customerEmailKindRequiresDeclinedCancellation(kind: string): boolean {
  return (kind ?? '').trim() === 'cancellation_declined';
}

export function customerLifecycleNotifyAllowed(params: {
  kind: string;
  bookingStatus?: string | null;
  openCancellationRequest?: boolean | null;
  declinedCancellationRequest?: boolean | null;
}): LifecycleNotifyGate {
  const kind = (params.kind ?? '').trim();
  const status = normStatus(params.bookingStatus);

  if (customerEmailKindRequiresCancelledBooking(kind)) {
    if (status !== 'cancelled') {
      return { ok: false, error: 'Booking is not cancelled', status: 409 };
    }
    return { ok: true };
  }

  if (customerEmailKindRequiresOpenCancellationRequest(kind)) {
    if (status === 'cancelled') {
      return { ok: false, error: 'Booking is already cancelled', status: 409 };
    }
    if (params.openCancellationRequest !== true) {
      return { ok: false, error: 'No open cancellation request for this booking', status: 409 };
    }
    return { ok: true };
  }

  if (customerEmailKindRequiresDeclinedCancellation(kind)) {
    if (status === 'cancelled') {
      return { ok: false, error: 'Booking is cancelled', status: 409 };
    }
    if (params.declinedCancellationRequest !== true) {
      return { ok: false, error: 'No declined cancellation request for this booking', status: 409 };
    }
    return { ok: true };
  }

  return { ok: true };
}

export function supplierEventRequiresCancelledBooking(eventType: string): boolean {
  const ev = (eventType ?? '').trim();
  return ev === 'booking_cancelled' || ev === 'cancellation_accepted';
}

export function supplierEventRequiresDeclinedCancellation(eventType: string): boolean {
  return (eventType ?? '').trim() === 'cancellation_declined';
}

export function supplierLifecycleNotifyAllowed(params: {
  eventType: string;
  bookingStatus?: string | null;
  declinedCancellationRequest?: boolean | null;
}): LifecycleNotifyGate {
  const eventType = (params.eventType ?? '').trim();
  const status = normStatus(params.bookingStatus);

  if (supplierEventRequiresCancelledBooking(eventType)) {
    if (status !== 'cancelled') {
      return { ok: false, error: 'Booking is not cancelled', status: 409 };
    }
    return { ok: true };
  }

  if (supplierEventRequiresDeclinedCancellation(eventType)) {
    if (status === 'cancelled') {
      return { ok: false, error: 'Booking is cancelled', status: 409 };
    }
    if (params.declinedCancellationRequest !== true) {
      return { ok: false, error: 'No declined cancellation request for this booking', status: 409 };
    }
    return { ok: true };
  }

  return { ok: true };
}
