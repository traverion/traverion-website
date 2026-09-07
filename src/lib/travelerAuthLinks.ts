/** Canonical traveler login URL so “Log in” never opens sign-up or the wrong next page. */

export const TRAVELER_AUTH_NEXT_PAGES = [
  'home',
  'packages',
  'cart',
  'bookings',
  'booking-confirmed',
  'account',
  'wishlist',
  'contact',
] as const;

export type TravelerAuthNextPage = (typeof TRAVELER_AUTH_NEXT_PAGES)[number];

export function sanitizeTravelerAuthNext(next: string | null | undefined): TravelerAuthNextPage {
  const n = (next ?? '').trim();
  return (TRAVELER_AUTH_NEXT_PAGES as readonly string[]).includes(n) ? (n as TravelerAuthNextPage) : 'home';
}

export function travelerLoginHref(next: string): string {
  return `/log-in?next=${encodeURIComponent(sanitizeTravelerAuthNext(next))}`;
}
