/** Shared traveler / partner auth error copy. URLs are passed in so staging (VITE_PARTNER_PORTAL_URL) stays correct. */

export const EMAIL_ALREADY_IN_USE =
  'This email is already in use. Try signing in instead, or use another email.';

/** Pass-through guard in mapAuthError: do not replace these with shorter copy. */
export const DUPLICATE_TRAVERION_EMAIL_MESSAGE_PREFIX = 'This email is already registered for Traverion';

/**
 * Traveler sign-up when the email already exists in Supabase (partner account, traveler account, or both).
 * Supabase does not say which; we point users to both entry points.
 */
export function travelerSignUpDuplicateEmailMessage(partnerLoginUrl: string): string {
  return `${DUPLICATE_TRAVERION_EMAIL_MESSAGE_PREFIX} (traveler bookings and/or the partner portal). Sign in below, or open the partner portal at ${partnerLoginUrl} if you list tours. You can use a different email or an inbox alias (e.g. you+partner@gmail.com) if you need another account.`;
}

/**
 * Partner sign-up when the email already exists (traveler and/or partner). Same Supabase limitation as traveler sign-up.
 */
export function partnerSignUpDuplicateEmailMessage(travelerSignInUrl: string): string {
  return `${DUPLICATE_TRAVERION_EMAIL_MESSAGE_PREFIX} (traveler bookings and/or this partner portal). Sign in below, or open your traveler account at ${travelerSignInUrl} if you book trips on traverion.com. You can use a different email or an inbox alias if you need another account.`;
}

export function customerSignInPartnerOnlyMessage(partnerLoginUrl: string): string {
  return `This email is registered for the Traverion partner (supplier) portal, not for booking trips here. Sign in at ${partnerLoginUrl} to manage your listings.`;
}

export function partnerSignInTravelerOnlyMessage(travelerSignInUrl: string): string {
  return `This email is registered as a traveler on traverion.com. Sign in at ${travelerSignInUrl} to book and manage your trips.`;
}

/** Shown on the partner login email field (not the full-screen traveler notice). */
export function partnerSignInTravelerOnlyEmailError(travelerSignInUrl: string): string {
  return `This email is already used for traveler bookings on traverion.com. Sign in at ${travelerSignInUrl} to manage trips, or use a different email (e.g. you+partner@gmail.com) to register as a partner.`;
}

/** Partner sign-up when email exists as traveler only (consumer profile, no partner profile). */
export function partnerSignUpTravelerEmailExistsError(travelerSignInUrl: string): string {
  return `This email is already registered as a traveler. Sign in at ${travelerSignInUrl} for bookings, or use another email to create a partner account.`;
}
