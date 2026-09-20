/**
 * Tour checkout lives on the listing origin (`/packages?tour=<id>`) with explicit
 * query state. The listing must not be replaced in React memory only — refresh,
 * back/forward, and Stripe TEST cancel need the same checkout.
 *
 * Stay nights already use `checkout` as the check-out date. Do not reuse that key.
 */

export const TOUR_CHECKOUT_PATH = '/packages';
export const TOUR_CHECKOUT_FLAG = 'book';
export const TOUR_CHECKOUT_OPTION = 'option';
export const TOUR_CHECKOUT_MIX = 'mix';
export const TOUR_CHECKOUT_STEP = 'step';
export const TOUR_CHECKOUT_PAYMENT = 'payment';

export type TourCheckoutFlowStep = 'review' | 'contact' | 'confirm';

export type TourCheckoutState = {
  date: string;
  optionId: string;
  guests: number;
  mix: Record<string, number> | null;
  step: TourCheckoutFlowStep;
  paymentCancelled: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const OPTION_ID = /^[\w.-]{1,128}$/;
const MIX_TOKEN = /^[\w.-]{1,128}:\d{1,2}$/;

const CHECKOUT_ONLY_KEYS = [
  TOUR_CHECKOUT_FLAG,
  TOUR_CHECKOUT_OPTION,
  TOUR_CHECKOUT_MIX,
  TOUR_CHECKOUT_STEP,
  TOUR_CHECKOUT_PAYMENT,
] as const;

export function isTourCheckoutFlowStep(raw: string | null | undefined): raw is TourCheckoutFlowStep {
  return raw === 'review' || raw === 'contact' || raw === 'confirm';
}

export function sanitizeTourCheckoutFlowStep(
  step: string | null | undefined,
  hasSessionUser: boolean
): TourCheckoutFlowStep {
  if (!isTourCheckoutFlowStep(step)) return 'review';
  if (step === 'confirm' && !hasSessionUser) return 'contact';
  return step;
}

export function parseParticipantMixQuery(raw: string | null | undefined): Record<string, number> | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const mix: Record<string, number> = {};
  for (const part of text.split(',')) {
    const token = part.trim();
    if (!MIX_TOKEN.test(token)) return null;
    const colon = token.lastIndexOf(':');
    const id = token.slice(0, colon);
    const qty = Number.parseInt(token.slice(colon + 1), 10);
    if (!id || !Number.isFinite(qty) || qty < 0 || qty > 99) return null;
    mix[id] = qty;
  }
  return Object.keys(mix).length > 0 ? mix : null;
}

export function serializeParticipantMixQuery(mix: Record<string, number> | null | undefined): string {
  if (!mix) return '';
  return Object.entries(mix)
    .filter(([, qty]) => Number.isFinite(qty) && qty > 0)
    .map(([id, qty]) => `${id}:${Math.min(99, Math.floor(qty))}`)
    .join(',');
}

export function parseTourCheckoutSearch(
  search: string | URLSearchParams
): TourCheckoutState | null {
  const params = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
  const flag = (params.get(TOUR_CHECKOUT_FLAG) ?? '').trim().toLowerCase();
  if (flag !== '1' && flag !== 'true') return null;
  const date = (params.get('date') ?? '').trim();
  const optionId = (params.get(TOUR_CHECKOUT_OPTION) ?? '').trim();
  if (!ISO_DATE.test(date) || !OPTION_ID.test(optionId)) return null;
  const guestsRaw = Number.parseInt(params.get('guests') ?? '', 10);
  const guests = Number.isFinite(guestsRaw) && guestsRaw >= 1 ? Math.min(99, Math.floor(guestsRaw)) : 1;
  const mixRaw = params.get(TOUR_CHECKOUT_MIX);
  const mix = mixRaw == null || mixRaw.trim() === '' ? null : parseParticipantMixQuery(mixRaw);
  if (mixRaw != null && mixRaw.trim() !== '' && mix == null) return null;
  const step = sanitizeTourCheckoutFlowStep(params.get(TOUR_CHECKOUT_STEP), true);
  const paymentCancelled = (params.get(TOUR_CHECKOUT_PAYMENT) ?? '').trim().toLowerCase() === 'cancelled';
  return { date, optionId, guests, mix, step, paymentCancelled };
}

export function applyTourCheckoutSearch(params: URLSearchParams, state: TourCheckoutState): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set(TOUR_CHECKOUT_FLAG, '1');
  next.set('date', state.date);
  next.set('guests', String(state.guests));
  next.set(TOUR_CHECKOUT_OPTION, state.optionId);
  next.set(TOUR_CHECKOUT_STEP, state.step);
  const mix = serializeParticipantMixQuery(state.mix);
  if (mix) next.set(TOUR_CHECKOUT_MIX, mix);
  else next.delete(TOUR_CHECKOUT_MIX);
  if (state.paymentCancelled) next.set(TOUR_CHECKOUT_PAYMENT, 'cancelled');
  else next.delete(TOUR_CHECKOUT_PAYMENT);
  return next;
}

export function stripTourCheckoutSearch(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of CHECKOUT_ONLY_KEYS) next.delete(key);
  return next;
}

export function tourListingPath(
  tourId: string,
  extras?: { date?: string; guests?: number }
): string {
  const params = new URLSearchParams();
  params.set('tour', tourId);
  const date = extras?.date?.trim() ?? '';
  if (ISO_DATE.test(date)) params.set('date', date);
  if (typeof extras?.guests === 'number' && extras.guests >= 1) {
    params.set('guests', String(Math.min(99, Math.floor(extras.guests))));
  }
  return `${TOUR_CHECKOUT_PATH}?${params.toString()}`;
}

export function tourCheckoutPath(tourId: string, state: TourCheckoutState): string {
  const params = applyTourCheckoutSearch(new URLSearchParams({ tour: tourId }), state);
  return `${TOUR_CHECKOUT_PATH}?${params.toString()}`;
}

/** Stripe cancel_url: same checkout, marked cancelled. Same-origin relative path only. */
export function tourCheckoutCancelPath(tourId: string, state: TourCheckoutState): string {
  return tourCheckoutPath(tourId, { ...state, paymentCancelled: true });
}

export function resolveTourCheckoutVariant<T extends { id: string }>(
  variants: readonly T[],
  optionId: string
): T | null {
  const exact = variants.find((v) => v.id === optionId);
  if (exact) return exact;
  if (optionId === '__default__' && variants.length === 1) return variants[0] ?? null;
  return null;
}
