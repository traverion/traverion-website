/** Shared traveler / partner auth error copy. URLs are passed in so staging (VITE_PARTNER_PORTAL_URL) stays correct. */

export const EMAIL_ALREADY_IN_USE =
  'This email is already in use. Try signing in instead, or use another email.';

export function customerSignInPartnerOnlyMessage(partnerLoginUrl: string): string {
  return `This email is registered for the Traverion partner (supplier) portal, not for booking trips here. Sign in at ${partnerLoginUrl} to manage your listings.`;
}

export function partnerSignInTravelerOnlyMessage(travelerSignInUrl: string): string {
  return `This email is registered as a traveler on traverion.com. Sign in at ${travelerSignInUrl} to book and manage your trips.`;
}
