/** Canonical traveler login URL so “Log in” never opens sign-up or the wrong next page. */

export const TRAVELER_AUTH_NEXT_PAGES = [
  'home',
  'packages',
  'stays',
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
  if (n === 'cart') return 'bookings';
  return (TRAVELER_AUTH_NEXT_PAGES as readonly string[]).includes(n) ? (n as TravelerAuthNextPage) : 'home';
}

export function travelerLoginHref(next: string): string {
  return `/log-in?next=${encodeURIComponent(sanitizeTravelerAuthNext(next))}`;
}

/** After traveler login, reopen this stay (consumer product only). */
export const TRAVELER_RETURN_STAY_KEY = 'traverion_return_stay';

export function rememberTravelerReturnStay(stayId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  if (!/^[0-9a-f-]{36}$/i.test(stayId)) return;
  sessionStorage.setItem(TRAVELER_RETURN_STAY_KEY, stayId);
}

export function takeTravelerReturnStay(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const id = sessionStorage.getItem(TRAVELER_RETURN_STAY_KEY);
  if (id) sessionStorage.removeItem(TRAVELER_RETURN_STAY_KEY);
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}
