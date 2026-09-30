/**
 * Phase 1092: caller authorization for notify-customer-booking.
 * verify_jwt is off; booking-tied kinds must still reject anonymous forgery.
 * Phase 1349: guest email match only when guest_user_id is unbound.
 */

import { travelerOwnsCheckoutBooking } from './booking-traveler-ownership.ts';

export function isServiceRoleBearer(
  authHeader: string | null | undefined,
  serviceRoleKey: string | null | undefined
): boolean {
  const key = (serviceRoleKey ?? '').trim();
  if (!key) return false;
  const auth = (authHeader ?? '').trim();
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return bearer.length > 0 && bearer === key;
}

/**
 * True when the signed-in caller is the booking guest, listing supplier, or
 * a supplier team member (Phase 1130).
 */
export function bookingPartyAllowsCustomerNotify(params: {
  callerUserId?: string | null;
  callerEmail?: string | null;
  guestUserId?: string | null;
  guestEmail?: string | null;
  callerIsListingSupplier?: boolean;
  callerIsSupplierTeamMember?: boolean;
}): boolean {
  if (params.callerIsListingSupplier) return true;
  if (params.callerIsSupplierTeamMember) return true;
  return travelerOwnsCheckoutBooking({
    authUserId: params.callerUserId ?? '',
    verifiedEmail: params.callerEmail ?? '',
    guestUserId: params.guestUserId,
    guestEmail: params.guestEmail,
  });
}

/**
 * Phase 1128: guest JWT may only invoke guest-originated customer email kinds.
 * Phase 1705: cancellation_accepted / cancellation_declined are guest responses
 * to a host cancel request — traveler self-receipt after Accept/Decline.
 * Host/ops/cron kinds require supplier-side or service-role.
 */
export function guestMayInvokeCustomerEmailKind(emailKind: string): boolean {
  const kind = (emailKind ?? '').trim();
  return (
    kind === 'your_details_updated' ||
    kind === 'booking_cancelled' ||
    kind === 'cancellation_accepted' ||
    kind === 'cancellation_declined'
  );
}

/**
 * Phase 1131: webhook/cron/promote kinds must use service-role bearer.
 * Listing-owner/team JWTs cannot fire paid confirmation, refund, or reminder mail.
 */
export function customerEmailKindRequiresServiceRole(emailKind: string): boolean {
  const kind = (emailKind ?? '').trim();
  return (
    kind === 'booking_confirmed_paid' ||
    kind === 'refund_completed' ||
    kind === 'partial_refund_recorded' ||
    kind === 'experience_reminder' ||
    kind === 'review_request' ||
    kind === 'checkout_payment_reversed'
  );
}
