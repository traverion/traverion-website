/**
 * Rental booking review lives on the listing origin with explicit query state (`book=1`),
 * mirroring Stay Instant Book confirm (stayCheckoutUrl).
 */

export const RENTAL_CHECKOUT_FLAG = 'book';
export const RENTAL_CHECKOUT_PAYMENT = 'payment';

export type RentalCheckoutState = {
  variantId: string;
  quantity: number;
  durationUnit: 'hour' | 'day';
  startDate: string;
  endDate: string;
  pickupHm: string;
  returnHm: string;
  paymentCancelled: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^\d{2}:\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function normalizeHm(raw: string | null, fallback: string): string {
  const v = (raw ?? '').trim();
  if (!HM.test(v)) return fallback;
  return v;
}

export function parseRentalCheckoutSearch(
  search: string | URLSearchParams
): RentalCheckoutState | null {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search;
  const flag = (params.get(RENTAL_CHECKOUT_FLAG) ?? '').trim().toLowerCase();
  if (flag !== '1' && flag !== 'true') return null;
  const variantId = (params.get('variant') ?? params.get('option') ?? '').trim();
  if (!variantId) return null;
  const startDate = (params.get('start') ?? params.get('pickupDate') ?? '').trim();
  const endDate = (params.get('end') ?? params.get('returnDate') ?? '').trim();
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate) || endDate < startDate) return null;
  const durationUnitRaw = (params.get('unit') ?? 'day').trim().toLowerCase();
  const durationUnit: 'hour' | 'day' = durationUnitRaw === 'hour' ? 'hour' : 'day';
  if (durationUnit === 'hour' && endDate !== startDate) return null;
  const quantity = clampInt(params.get('qty') ?? params.get('quantity'), 1, 1, 99);
  const pickupHm = normalizeHm(params.get('pickup') ?? params.get('pickupHm'), '09:00');
  const returnHm = normalizeHm(params.get('return') ?? params.get('returnHm'), '18:00');
  const paymentCancelled = (params.get(RENTAL_CHECKOUT_PAYMENT) ?? '').trim().toLowerCase() === 'cancelled';
  return {
    variantId,
    quantity,
    durationUnit,
    startDate,
    endDate,
    pickupHm,
    returnHm,
    paymentCancelled,
  };
}

export function applyRentalCheckoutSearch(
  params: URLSearchParams,
  state: RentalCheckoutState
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set(RENTAL_CHECKOUT_FLAG, '1');
  next.set('variant', state.variantId);
  next.set('qty', String(state.quantity));
  next.set('unit', state.durationUnit);
  next.set('start', state.startDate);
  next.set('end', state.endDate);
  next.set('pickup', state.pickupHm);
  next.set('return', state.returnHm);
  if (state.paymentCancelled) next.set(RENTAL_CHECKOUT_PAYMENT, 'cancelled');
  else next.delete(RENTAL_CHECKOUT_PAYMENT);
  return next;
}

export function clearRentalCheckoutSearch(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(RENTAL_CHECKOUT_FLAG);
  next.delete(RENTAL_CHECKOUT_PAYMENT);
  return next;
}

/** Listing PDP with selection preserved (no book flag). */
export function buildRentalListingHref(
  listingId: string,
  state?: Partial<
    Pick<
      RentalCheckoutState,
      'variantId' | 'quantity' | 'durationUnit' | 'startDate' | 'endDate' | 'pickupHm' | 'returnHm'
    >
  >
): string {
  const id = listingId.trim();
  if (!UUID.test(id)) return '/rentals';
  const params = new URLSearchParams();
  if (state?.variantId?.trim()) params.set('variant', state.variantId.trim());
  if (typeof state?.quantity === 'number' && state.quantity >= 1) params.set('qty', String(state.quantity));
  if (state?.durationUnit === 'hour' || state?.durationUnit === 'day') params.set('unit', state.durationUnit);
  if (state?.startDate && ISO_DATE.test(state.startDate)) params.set('start', state.startDate);
  if (state?.endDate && ISO_DATE.test(state.endDate)) params.set('end', state.endDate);
  if (state?.pickupHm && HM.test(state.pickupHm)) params.set('pickup', state.pickupHm);
  if (state?.returnHm && HM.test(state.returnHm)) params.set('return', state.returnHm);
  const q = params.toString();
  return q ? `/rentals/${id}?${q}` : `/rentals/${id}`;
}

export function buildRentalCheckoutHref(listingId: string, state: RentalCheckoutState): string {
  const id = listingId.trim();
  if (!UUID.test(id)) return '/rentals';
  const params = applyRentalCheckoutSearch(new URLSearchParams(), state);
  return `/rentals/${id}?${params.toString()}`;
}
