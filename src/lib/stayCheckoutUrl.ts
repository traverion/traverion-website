/**
 * Stay Instant Book confirmation lives on the listing origin with explicit query state.
 * `checkout` is already the check-out date — use `book=1` like tours, never reuse `checkout` as a flag.
 */

export const STAY_CHECKOUT_FLAG = 'book';
export const STAY_CHECKOUT_PAYMENT = 'payment';

export type StayCheckoutState = {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  infants: number;
  paymentCancelled: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clampGuests(raw: string | null, fallback: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(99, Math.floor(n));
}

export function parseStayCheckoutSearch(
  search: string | URLSearchParams
): StayCheckoutState | null {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search;
  const flag = (params.get(STAY_CHECKOUT_FLAG) ?? '').trim().toLowerCase();
  if (flag !== '1' && flag !== 'true') return null;
  const checkIn = (params.get('checkIn') ?? params.get('date') ?? '').trim();
  const checkOut = (params.get('checkOut') ?? params.get('checkout') ?? '').trim();
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut) || checkOut <= checkIn) return null;
  const adultsRaw = params.get('adults');
  const guestsFallback = clampGuests(params.get('guests'), 2);
  const adults = adultsRaw != null && adultsRaw.trim() !== '' ? Math.max(1, clampGuests(adultsRaw, 1)) : Math.max(1, guestsFallback);
  const children = clampGuests(params.get('children'), 0);
  const infants = clampGuests(params.get('infants'), 0);
  const paymentCancelled = (params.get(STAY_CHECKOUT_PAYMENT) ?? '').trim().toLowerCase() === 'cancelled';
  return { checkIn, checkOut, adults, children, infants, paymentCancelled };
}

export function applyStayCheckoutSearch(params: URLSearchParams, state: StayCheckoutState): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set(STAY_CHECKOUT_FLAG, '1');
  next.set('checkIn', state.checkIn);
  next.set('checkOut', state.checkOut);
  next.set('adults', String(state.adults));
  next.set('children', String(state.children));
  next.set('infants', String(state.infants));
  next.set('guests', String(Math.max(1, state.adults)));
  // Keep legacy keys in sync for StayDetails prefill / cancel returns.
  next.delete('date');
  next.delete('checkout');
  if (state.paymentCancelled) next.set(STAY_CHECKOUT_PAYMENT, 'cancelled');
  else next.delete(STAY_CHECKOUT_PAYMENT);
  return next;
}

export function clearStayCheckoutSearch(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(STAY_CHECKOUT_FLAG);
  next.delete(STAY_CHECKOUT_PAYMENT);
  return next;
}

/** Listing PDP with dates preserved (no book flag). */
export function buildStayListingHref(
  stayId: string,
  state?: Partial<Pick<StayCheckoutState, 'checkIn' | 'checkOut' | 'adults' | 'children' | 'infants'>>
): string {
  const id = stayId.trim();
  if (!UUID.test(id)) return '/stays';
  const params = new URLSearchParams();
  params.set('stay', id);
  if (state?.checkIn && ISO_DATE.test(state.checkIn)) params.set('checkIn', state.checkIn);
  if (state?.checkOut && ISO_DATE.test(state.checkOut)) params.set('checkOut', state.checkOut);
  if (typeof state?.adults === 'number' && state.adults >= 1) {
    params.set('adults', String(state.adults));
    params.set('guests', String(state.adults));
  }
  if (typeof state?.children === 'number' && state.children > 0) params.set('children', String(state.children));
  if (typeof state?.infants === 'number' && state.infants > 0) params.set('infants', String(state.infants));
  return `/stays?${params.toString()}`;
}

export function buildStayCheckoutHref(stayId: string, state: StayCheckoutState): string {
  const id = stayId.trim();
  if (!UUID.test(id)) return '/stays';
  const params = applyStayCheckoutSearch(new URLSearchParams({ stay: id }), state);
  return `/stays?${params.toString()}`;
}
