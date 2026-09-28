/**
 * Pending-hold / checkout resume ownership.
 *
 * When `guest_user_id` is set, that account alone may resume/reconcile/pay —
 * matching a recycled `guest_email` must NOT reassign the hold.
 * Email matching is only for legacy rows with null `guest_user_id`.
 */
export function travelerOwnsCheckoutBooking(opts: {
  authUserId: string;
  /** Verified auth email (already lowercased preferred). */
  verifiedEmail: string;
  guestUserId: string | null | undefined;
  guestEmail: string | null | undefined;
}): boolean {
  const authUserId = String(opts.authUserId ?? '').trim();

  const boundUid =
    typeof opts.guestUserId === 'string' ? opts.guestUserId.trim() : '';
  if (boundUid) {
    return Boolean(authUserId) && boundUid === authUserId;
  }

  const ownerEmail = String(opts.guestEmail ?? '')
    .trim()
    .toLowerCase();
  const email = String(opts.verifiedEmail ?? '')
    .trim()
    .toLowerCase();
  return ownerEmail.length > 0 && email.length > 0 && ownerEmail === email;
}

/** Patch for reclaiming unbound holds / refreshing email — never steals a bound uid. */
export function travelerCheckoutIdentitySyncPatch(opts: {
  authUserId: string;
  verifiedEmail: string;
  guestUserId: string | null | undefined;
  guestEmail: string | null | undefined;
}): { guest_email?: string; guest_user_id?: string } | null {
  if (!travelerOwnsCheckoutBooking(opts)) return null;

  const email = String(opts.verifiedEmail ?? '')
    .trim()
    .toLowerCase();
  if (!email) return null;

  const ownerEmail = String(opts.guestEmail ?? '')
    .trim()
    .toLowerCase();
  const boundUid =
    typeof opts.guestUserId === 'string' ? opts.guestUserId.trim() : '';

  const patch: { guest_email?: string; guest_user_id?: string } = {};
  if (ownerEmail.length === 0 || ownerEmail !== email) {
    patch.guest_email = email;
  }
  if (!boundUid) {
    patch.guest_user_id = opts.authUserId;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
