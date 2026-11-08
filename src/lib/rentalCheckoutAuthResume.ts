import { parseRentalCheckoutSearch } from './rentalCheckoutUrl';

/**
 * After traveler login, auth onSuccess may pushState `book=1` while a remount
 * left React `locationSearch` empty. Return the window search when it is a
 * valid rental checkout and differs from the in-memory value.
 */
export function nextRentalCheckoutSearchAfterAuth(
  prevSearch: string,
  windowSearch: string,
  isAuthenticated: boolean
): string | null {
  if (!isAuthenticated) return null;
  if (!parseRentalCheckoutSearch(windowSearch)) return null;
  return prevSearch === windowSearch ? null : windowSearch;
}
