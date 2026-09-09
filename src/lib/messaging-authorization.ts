import { bookingPaymentWasCollected } from './payment-states';
import { bookingIsCancelledTrip } from './trip-views';

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

export const BOOKING_MESSAGE_UNPAID = 'Messaging opens after this booking is paid.';
export const BOOKING_MESSAGE_CLOSED = 'This booking is closed. You can still read earlier messages.';

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
    return { ok: false, reason: BOOKING_MESSAGE_UNPAID };
  }
  if (params.bookingCancelled && !params.openCancellationRequest) {
    return { ok: false, reason: BOOKING_MESSAGE_CLOSED };
  }
  return { ok: true, reason: '' };
}

export function bookingAllowsMessaging(row: {
  status?: string | null;
  payment_status?: string | null;
  openCancellation?: boolean;
}): boolean {
  if (!bookingPaymentWasCollected(row.payment_status)) return false;
  if (bookingIsCancelledTrip(row) && !row.openCancellation) return false;
  return true;
}

export type MessagingComposeBlock = 'none' | 'unpaid' | 'closed';

export function messagingComposeBlock(row: {
  status?: string | null;
  payment_status?: string | null;
  openCancellation?: boolean;
}): MessagingComposeBlock {
  if (bookingAllowsMessaging(row)) return 'none';
  if (bookingPaymentWasCollected(row.payment_status)) return 'closed';
  return 'unpaid';
}

/** Inbox: live paid threads always; closed collected threads only if they already have messages. */
export function partnerInboxListsBooking(
  row: {
    status?: string | null;
    payment_status?: string | null;
    openCancellation?: boolean;
  },
  hasMessageHistory: boolean
): boolean {
  if (!bookingPaymentWasCollected(row.payment_status)) return false;
  if (bookingAllowsMessaging(row)) return true;
  return hasMessageHistory;
}
