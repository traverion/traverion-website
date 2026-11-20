/**
 * Phase 1092: caller authorization for notify-customer-booking.
 * verify_jwt is off; booking-tied kinds must still reject anonymous forgery.
 * Phase 1349: guest email match only when guest_user_id is unbound.
 */

import { travelerOwnsCheckoutBooking } from './booking-traveler-ownership.ts';

/**
 * Phase 1759: finance/viewer team JWTs are not supplier-side for notify writes.
 * Matches canManageBookings / is_supplier_account_editor.
 */
export function supplierTeamRoleIsEditor(role: string | null | undefined): boolean {
  const r = String(role ?? '')
    .trim()
    .toLowerCase();
  return r === 'owner' || r === 'manager' || r === 'ops';
}

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

export function bearerJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(padded));
    return typeof json.role === 'string' ? json.role : null;
  } catch {
    return null;
  }
}

/** GoTrue accepts the project service-role JWT, then rejects it for having no user subject. */
export function authRejectionIsSignedPlatformJwt(body: { msg?: string; message?: string }): boolean {
  const msg = String(body.msg || body.message || '');
  return msg.includes('missing sub claim');
}

/**
 * Exact service-role key match, or the legacy service_role JWT when the
 * function env holds a different platform key. The signature is checked with
 * the project's Auth API. Anon tokens share the missing-sub error and are
 * rejected by the role claim.
 */
export async function isAuthorizedServiceRoleRequest(params: {
  authHeader: string | null | undefined;
  serviceRoleKey: string | null | undefined;
  supabaseUrl: string | null | undefined;
  anonKey: string | null | undefined;
}): Promise<boolean> {
  if (isServiceRoleBearer(params.authHeader, params.serviceRoleKey)) return true;
  const auth = (params.authHeader ?? '').trim();
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : auth;
  if (bearerJwtRole(bearer) !== 'service_role') return false;
  const supabaseUrl = (params.supabaseUrl ?? '').replace(/\/$/, '');
  const anonKey = (params.anonKey ?? '').trim();
  if (!supabaseUrl || !anonKey) return false;
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${bearer}`, apikey: anonKey },
  });
  const body = (await res.json().catch(() => ({}))) as { msg?: string; message?: string };
  return authRejectionIsSignedPlatformJwt(body);
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
    // supplier_cancelled_choose_resolution: supplier/service only (not guest forge)
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
    kind === 'pickup_location_reminder' ||
    kind === 'review_request' ||
    kind === 'checkout_payment_reversed'
  );
}
