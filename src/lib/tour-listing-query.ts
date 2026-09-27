/**
 * Resolve a tour listing id from traveler catalog query params.
 * Canonical: `tour=<uuid>`. Legacy alias: `uuid=<uuid>` (older sitemap / share links).
 */
export function resolveTourListingIdFromSearch(search: string): string | null {
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search
  );
  const tour = (params.get('tour') ?? '').trim();
  if (/^[0-9a-f-]{36}$/i.test(tour)) return tour;
  const legacy = (params.get('uuid') ?? '').trim();
  if (/^[0-9a-f-]{36}$/i.test(legacy)) return legacy;
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
