const LISTING_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Brochure / seed catalog ids (kebab-case), e.g. hanoi-food-street-tour. */
const LISTING_SLUG_RE = /^[a-z][a-z0-9-]{2,80}$/i;

/**
 * Resolve a tour listing id from traveler catalog query params.
 * Canonical: `tour=<uuid|slug>`. Legacy alias: `uuid=<uuid>` (older sitemap / share links).
 * Slugs enable seed/brochure deep links when VITE_SHOW_SEED_LISTINGS is on.
 */
export function resolveTourListingIdFromSearch(search: string): string | null {
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search
  );
  const tour = (params.get('tour') ?? '').trim();
  if (LISTING_UUID_RE.test(tour) || LISTING_SLUG_RE.test(tour)) return tour;
  const legacy = (params.get('uuid') ?? '').trim();
  if (LISTING_UUID_RE.test(legacy)) return legacy;
  return null;
}

/**
 * If the URL still uses legacy `uuid=`, rewrite in-place to canonical `tour=`
 * without dropping other query keys (book, date, step, …).
 */
export function normalizeLegacyTourUuidQueryParam(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const legacy = (params.get('uuid') ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(legacy)) return;
  if (/^[0-9a-f-]{36}$/i.test((params.get('tour') ?? '').trim())) {
    params.delete('uuid');
  } else {
    params.set('tour', legacy);
    params.delete('uuid');
  }
  const qs = params.toString();
  const path = window.location.pathname;
  window.history.replaceState(window.history.state, '', qs ? `${path}?${qs}` : path);
}
