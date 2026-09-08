/**
 * Product rule for traveler↔supplier chat. SQL RPCs are the authority;
 * this module documents the same rule for tests and UI gating.
 */
export function canAccessBookingThread(params: {
  authenticated: boolean;
  isGuestOnBooking: boolean;
  isSupplierOnListing: boolean;
}): boolean {
  if (!params.authenticated) return false;
  return params.isGuestOnBooking || params.isSupplierOnListing;
}

export function canPostBookingMessage(params: {
  authenticated: boolean;
  isGuestOnBooking: boolean;
  isSupplierOnListing: boolean;
  paymentPaid: boolean;
  bookingCancelled: boolean;
  openCancellationRequest: boolean;
}): { ok: boolean; reason: string } {
  if (!canAccessBookingThread(params)) {
    return { ok: false, reason: 'You can only message about a booking you are part of.' };
  }
  if (!params.paymentPaid) {
    return { ok: false, reason: 'Messaging opens after this booking is paid.' };
  }
  if (params.bookingCancelled && !params.openCancellationRequest) {
    return { ok: false, reason: 'This booking is closed. You can still read earlier messages.' };
  }
  return { ok: true, reason: '' };
}
