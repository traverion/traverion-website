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

/** After traveler login, reopen this stay with selected nights (consumer product only). */
export const TRAVELER_RETURN_STAY_KEY = 'traverion_return_stay';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

export type TravelerReturnStayState = {
  id: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
};

export function serializeTravelerReturnStay(state: TravelerReturnStayState): string {
  return JSON.stringify({
    id: state.id,
    ...(state.checkIn && ISO.test(state.checkIn) ? { checkIn: state.checkIn } : {}),
    ...(state.checkOut && ISO.test(state.checkOut) ? { checkOut: state.checkOut } : {}),
    ...(typeof state.guests === 'number' && Number.isFinite(state.guests) && state.guests >= 1
      ? { guests: Math.min(99, Math.floor(state.guests)) }
      : {}),
  });
}

export function parseTravelerReturnStay(raw: string | null | undefined): TravelerReturnStayState | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (UUID.test(trimmed)) return { id: trimmed };
  try {
    const parsed = JSON.parse(trimmed) as Partial<TravelerReturnStayState>;
    const id = typeof parsed.id === 'string' ? parsed.id : '';
    if (!UUID.test(id)) return null;
    const checkIn = typeof parsed.checkIn === 'string' && ISO.test(parsed.checkIn) ? parsed.checkIn : undefined;
    const checkOut = typeof parsed.checkOut === 'string' && ISO.test(parsed.checkOut) ? parsed.checkOut : undefined;
    const guests =
      typeof parsed.guests === 'number' && Number.isFinite(parsed.guests) && parsed.guests >= 1
        ? Math.min(99, Math.floor(parsed.guests))
        : undefined;
    return { id, checkIn, checkOut, guests };
  } catch {
    return null;
  }
}

export function rememberTravelerReturnStay(input: string | TravelerReturnStayState): void {
  if (typeof sessionStorage === 'undefined') return;
  const state: TravelerReturnStayState = typeof input === 'string' ? { id: input } : input;
  if (!UUID.test(state.id)) return;
  sessionStorage.setItem(TRAVELER_RETURN_STAY_KEY, serializeTravelerReturnStay(state));
}

export function takeTravelerReturnStay(): TravelerReturnStayState | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(TRAVELER_RETURN_STAY_KEY);
  if (raw) sessionStorage.removeItem(TRAVELER_RETURN_STAY_KEY);
  return parseTravelerReturnStay(raw);
}
