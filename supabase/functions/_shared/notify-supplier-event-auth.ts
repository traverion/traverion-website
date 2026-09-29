/**
 * Mirror of src/lib/notify-supplier-event-auth.ts for Deno edge runtime.
 * Phase 1093 / 1349: bound guest_user_id blocks recycled-email party claims.
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

export function supplierEventPartyAllowsNotify(params: {
  callerUserId?: string | null;
  callerEmail?: string | null;
  listingSupplierId?: string | null;
  claimedSupplierId?: string | null;
  callerIsTeamMember?: boolean;
  guestUserId?: string | null;
  guestEmail?: string | null;
  reviewAuthorUserId?: string | null;
}): boolean {
  const uid = (params.callerUserId ?? '').trim();
  const listingSupplier = (params.listingSupplierId ?? '').trim();
  const claimed = (params.claimedSupplierId ?? '').trim();
  if (!listingSupplier || !claimed || listingSupplier !== claimed) return false;

  if (uid && uid === listingSupplier) return true;
  if (params.callerIsTeamMember) return true;

  if (
    travelerOwnsCheckoutBooking({
      authUserId: uid,
      verifiedEmail: params.callerEmail ?? '',
      guestUserId: params.guestUserId,
      guestEmail: params.guestEmail,
    })
  ) {
    return true;
  }

  const author = (params.reviewAuthorUserId ?? '').trim();
  if (uid && author && uid === author) return true;

  return false;
}

/**
 * Phase 1127: guest JWT may only invoke guest-originated booking events.
 * Phase 1705: cancellation_accepted / cancellation_declined are guest responses
 * to a host cancel request (MyBookings Accept/Decline) — same class as booking_cancelled.
 * Host/ops kinds (host_schedule_updated, new_booking, cancellation_requested, …)
 * still require supplier-side or service-role.
 */
export function guestMayInvokeSupplierEvent(eventType: string): boolean {
  const kind = (eventType ?? '').trim();
  return (
    kind === 'guest_message' ||
    kind === 'booking_detail_changed' ||
    kind === 'booking_cancelled' ||
    kind === 'cancellation_accepted' ||
    kind === 'cancellation_declined'
  );
}
