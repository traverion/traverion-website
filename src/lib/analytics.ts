/** Lightweight analytics stub: log events. Replace with your provider (GA, Plausible, etc.). */
export function track(event: string, props?: Record<string, string | number | boolean>) {
  if (typeof window === 'undefined') return;
  const payload = { event, ...props, ts: Date.now() };
  console.debug('[Analytics]', payload);
  // Example: window.gtag?.('event', event, props);
}

export const analytics = {
  search: (query: string, filters?: string) => track('search', { query, filters: filters ?? '' }),
  filter: (filterType: string, value: string) => track('filter', { filterType, value }),
  listingClick: (listingId: string, title: string) => track('listing_click', { listingId, title }),
  bookStart: (listingId: string) => track('book_start', { listingId }),
  bookComplete: (listingId: string, guests?: number) => track('book_complete', { listingId, guests: guests ?? 0 }),
};
