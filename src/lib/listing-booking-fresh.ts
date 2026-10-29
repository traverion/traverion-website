/**
 * Product detail pages start with a clean booking form on every fresh visit.
 * Active checkout (`book=1`) keeps its URL state. Edit/Back restores via React
 * handlers — listing URLs do not rehydrate selection on mount/refresh.
 */

export const LISTING_BOOKING_SELECTION_KEYS = [
  'date',
  'checkout',
  'checkIn',
  'checkOut',
  'adults',
  'children',
  'infants',
  'guests',
  'option',
  'mix',
  'time',
  'variant',
  'qty',
  'quantity',
  'unit',
  'start',
  'end',
  'pickup',
  'return',
  'pickupDate',
  'returnDate',
  'pickupHm',
  'returnHm',
  'payment',
  'step',
] as const;

const BOOK_FLAG = 'book';

export function listingHasActiveCheckoutFlag(
  search: string | URLSearchParams
): boolean {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search;
  const flag = (params.get(BOOK_FLAG) ?? '').trim().toLowerCase();
  return flag === '1' || flag === 'true';
}

/** Drop booking selection keys; keep listing identity (`tour`, `stay`) and unrelated filters. */
export function stripListingBookingSelectionParams(
  search: string | URLSearchParams
): URLSearchParams {
  const next =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : new URLSearchParams(search);
  next.delete(BOOK_FLAG);
  for (const key of LISTING_BOOKING_SELECTION_KEYS) next.delete(key);
  return next;
}

/**
 * When the listing PDP is not in active checkout, replace the address bar so a
 * refresh cannot revive stale dates/options. No-op when already clean or when
 * `book=1` is present.
 */
export function scrubListingBookingSelectionFromLocation(): boolean {
  if (typeof window === 'undefined') return false;
  const current = window.location.search;
  if (listingHasActiveCheckoutFlag(current)) return false;
  const cleaned = stripListingBookingSelectionParams(current);
  const nextSearch = cleaned.toString();
  const currentParams = new URLSearchParams(
    current.startsWith('?') ? current.slice(1) : current
  );
  // Compare canonical key sets so we do not thrash history.
  const same =
    [...currentParams.entries()].sort().join('|') === [...cleaned.entries()].sort().join('|');
  if (same) return false;
  const href = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', href);
  return true;
}
