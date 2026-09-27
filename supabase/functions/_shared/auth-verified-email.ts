/**
 * Session email usable for guest-email ownership (parity with SQL jwt_verified_email).
 * Unconfirmed accounts must not match bookings.guest_email for resume / cancel / expire / reconcile.
 */
export function authUserVerifiedEmail(
  user: { email?: string | null; email_confirmed_at?: string | null } | null | undefined
): string | null {
  const email = String(user?.email ?? '')
    .trim()
    .toLowerCase();
  if (!email) return null;
  if (!user?.email_confirmed_at) return null;
  return email;
}
