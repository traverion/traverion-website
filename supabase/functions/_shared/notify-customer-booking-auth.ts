/**
 * Mirror of src/lib/notify-customer-booking-auth.ts for Deno edge runtime.
 * Phase 1092: caller authorization for notify-customer-booking.
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

/**
 * Phase 1128: guest JWT may only invoke guest-originated customer email kinds.
 * Host/ops/cron kinds require supplier-side or service-role.
 */
export function guestMayInvokeCustomerEmailKind(emailKind: string): boolean {
  const kind = (emailKind ?? '').trim();
  return kind === 'your_details_updated' || kind === 'booking_cancelled';
}
