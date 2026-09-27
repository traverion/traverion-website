/**
 * Phase 1092: caller authorization for notify-customer-booking.
 * verify_jwt is off; booking-tied kinds must still reject anonymous forgery.
 */

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
 * True when the signed-in caller is the booking guest or the listing supplier.
 * Team members are not included here — only listings.supplier_id owner.
 */
export function bookingPartyAllowsCustomerNotify(params: {
  callerUserId?: string | null;
  callerEmail?: string | null;
  guestUserId?: string | null;
  guestEmail?: string | null;
  callerIsListingSupplier?: boolean;
}): boolean {
  const uid = (params.callerUserId ?? '').trim();
  const guestUid = (params.guestUserId ?? '').trim();
  if (uid && guestUid && uid === guestUid) return true;

  const email = (params.callerEmail ?? '').trim().toLowerCase();
  const guestEmail = (params.guestEmail ?? '').trim().toLowerCase();
  if (email && guestEmail && email === guestEmail) return true;

  if (params.callerIsListingSupplier) return true;
  return false;
}
