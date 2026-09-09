import { describe, expect, it } from 'vitest';
import { canAccessBookingThread, canPostBookingMessage, bookingAllowsMessaging, messagingComposeBlock, partnerInboxListsBooking } from './messaging-authorization';

describe('messaging authorization', () => {
  it('blocks anonymous and pre-booking contact', () => {
    expect(
      canAccessBookingThread({ authenticated: false, isGuestOnBooking: false, isSupplierOnListing: false })
    ).toBe(false);
    expect(
      canPostBookingMessage({
        authenticated: true,
        isGuestOnBooking: false,
        isSupplierOnListing: false,
        paymentPaid: true,
        bookingCancelled: false,
        openCancellationRequest: false,
      }).ok
    ).toBe(false);
    expect(
      canPostBookingMessage({
        authenticated: true,
        isGuestOnBooking: true,
        isSupplierOnListing: false,
        paymentPaid: false,
        bookingCancelled: false,
        openCancellationRequest: false,
      }).reason
    ).toMatch(/after this booking is paid/i);
  });

  it('denies contact without a paid booking relationship', () => {
    const denyPost = {
      authenticated: true,
      paymentPaid: true,
      bookingCancelled: false,
      openCancellationRequest: false,
    } as const;
    expect(
      canAccessBookingThread({ authenticated: true, isGuestOnBooking: false, isSupplierOnListing: false })
    ).toBe(false);
    expect(canPostBookingMessage({ ...denyPost, isGuestOnBooking: false, isSupplierOnListing: false }).ok).toBe(false);
    expect(canPostBookingMessage({ ...denyPost, isGuestOnBooking: true, isSupplierOnListing: true }).ok).toBe(true);
  });

  it('allows post-paid booking parties and keeps history after cancel', () => {
    expect(
      canPostBookingMessage({
        authenticated: true,
        isGuestOnBooking: true,
        isSupplierOnListing: false,
        paymentPaid: true,
        bookingCancelled: false,
        openCancellationRequest: false,
      }).ok
    ).toBe(true);
    expect(
      canPostBookingMessage({
        authenticated: true,
        isGuestOnBooking: false,
        isSupplierOnListing: true,
        paymentPaid: true,
        bookingCancelled: true,
        openCancellationRequest: true,
      }).ok
    ).toBe(true);
    expect(
      canPostBookingMessage({
        authenticated: true,
        isGuestOnBooking: true,
        isSupplierOnListing: false,
        paymentPaid: true,
        bookingCancelled: true,
        openCancellationRequest: false,
      }).ok
    ).toBe(false);
  });

  it('treats refunded bookings as closed, not unpaid', () => {
    const refunded = { status: 'confirmed', payment_status: 'refunded' };
    expect(bookingAllowsMessaging(refunded)).toBe(false);
    expect(messagingComposeBlock(refunded)).toBe('closed');
    expect(messagingComposeBlock({ status: 'pending', payment_status: 'pending' })).toBe('unpaid');
    expect(
      bookingAllowsMessaging({ status: 'confirmed', payment_status: 'paid' })
    ).toBe(true);
    expect(
      bookingAllowsMessaging({
        status: 'cancelled',
        payment_status: 'paid',
        openCancellation: true,
      })
    ).toBe(true);
  });

  it('keeps closed paid threads in Inbox only when they have message history', () => {
    const refunded = { status: 'confirmed', payment_status: 'refunded' };
    const paid = { status: 'confirmed', payment_status: 'paid' };
    const pending = { status: 'pending', payment_status: 'pending' };
    expect(partnerInboxListsBooking(paid, false)).toBe(true);
    expect(partnerInboxListsBooking(refunded, false)).toBe(false);
    expect(partnerInboxListsBooking(refunded, true)).toBe(true);
    expect(partnerInboxListsBooking(pending, true)).toBe(false);
    expect(
      partnerInboxListsBooking({ status: 'cancelled', payment_status: 'paid' }, true)
    ).toBe(true);
  });
});
