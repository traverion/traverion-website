/**
 * User-visible errors: human language only. Never pass through provider/database/stack text.
 */

export const USER_ERROR = {
  generic: 'Something went wrong. Check your connection and try again.',
  auth: 'Something went wrong. Check your details and try again.',
  tours: 'We could not load tours. Check your connection and try again.',
  tour: 'We could not load this tour. Check your connection and try again.',
  tourMissing: 'This tour is not available. It may have been unpublished or the link is wrong.',
  cart: 'We could not load your cart. Check your connection and try again.',
  wishlist: 'We could not load saved tours. Check your connection and try again.',
  trips: 'We could not load your trips. Check your connection and try again.',
  booking: 'We could not load this booking. Check your connection and try again.',
  listings: 'We could not load listings. Check your connection and try again.',
  bookings: 'We could not load bookings. Check your connection and try again.',
  money: 'We could not load payouts. Check your connection and try again.',
  reviews: 'We could not load reviews. Check your connection and try again.',
  offers: 'We could not load offers. Check your connection and try again.',
  calendar: 'We could not load the calendar. Check your connection and try again.',
  pickup: 'We could not load pickups. Check your connection and try again.',
  today: 'We could not load today. Check your connection and try again.',
  upload: 'That photo could not be uploaded. Try another image, or try again.',
  listingSave: 'Could not save this listing. Check your connection and try again.',
  checkout: 'Could not start checkout. Check your connection and try again.',
  review: 'Could not submit your review. Try again in a moment.',
} as const;

const TECHNICAL =
  /supabase|postgrest|pgrst\d*|\bpostgres\b|postgresql|\bjwt\b|\brls\b|row-level security|edge function|functions\/v1|\bstripe\b|stripe\.com|\bsk_(live|test)_|permission denied for|column .+ does not exist|relation .+ does not exist|violates (unique|foreign|check|not-null)|foreign key|unique constraint|not null constraint|duplicate key|json object requested|\buuid\b|\bjsonb\b|internal server error|stack trace|at Object\.|TypeError:|NetworkError|Failed to fetch|Load failed|AbortError|\bCORS\b|ECONNREFUSED|ENOTFOUND|timeout of \d+ms|22P02|23505|42501|PGRST|P0001|no such checkout/i;

const KNOWN_HUMAN: Array<{ test: RegExp; copy: string }> = [
  {
    test: /those nights are already booked/i,
    copy: 'Those dates were just booked by another traveler. Choose different dates to continue.',
  },
  {
    test: /checkout session has expired|session expired/i,
    copy: 'This checkout expired and the hold was released. Start checkout again to continue.',
  },
  {
    test: /jwt expired|invalid jwt|auth session missing|refresh_token_not_found/i,
    copy: 'Your session ended. Sign in again to continue.',
  },
  {
    test: /not enough capacity|no capacity left/i,
    copy: 'That departure just filled up. Choose another time or date.',
  },
  {
    test: /failed rpc|rpc error|could not find the function/i,
    copy: "We couldn't update your booking. Nothing was changed. Try again.",
  },
  {
    test: /inventory (lock|hold) (lost|expired)|hold expired/i,
    copy: 'Those spots were released while you were checking out. Start checkout again to continue.',
  },
];

function stripSqlPrefix(raw: string): string {
  return raw.replace(/^(?:ERROR:\s*)?(?:P0001:\s*)+/i, '').trim();
}

export function isTechnicalErrorMessage(raw: string): boolean {
  const msg = raw.trim();
  if (!msg) return true;
  if (TECHNICAL.test(msg)) return true;
  if (msg.length > 220) return true;
  return false;
}

export function userFacingError(raw: unknown, fallback: string = USER_ERROR.generic): string {
  const msg =
    typeof raw === 'string'
      ? raw.trim()
      : raw instanceof Error
        ? raw.message.trim()
        : '';
  if (!msg) return fallback;
  const stripped = stripSqlPrefix(msg);
  for (const row of KNOWN_HUMAN) {
    if (row.test.test(stripped) || row.test.test(msg)) return row.copy;
  }
  if (isTechnicalErrorMessage(msg) && isTechnicalErrorMessage(stripped)) return fallback;
  if (isTechnicalErrorMessage(msg) && !isTechnicalErrorMessage(stripped)) return stripped;
  return stripped || fallback;
}
