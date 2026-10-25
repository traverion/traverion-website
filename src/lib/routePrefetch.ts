/**
 * Warm route chunks before navigation so common consumer transitions feel immediate.
 * Respects Save-Data / slow connections — never prefetches private/sensitive payloads.
 */

/** True when route-chunk prefetch is appropriate (not Save-Data / 2G). */
export function shouldPrefetchRoutes(): boolean {
  if (typeof navigator === 'undefined') return true;
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (conn?.saveData) return false;
  const type = (conn?.effectiveType || '').toLowerCase();
  if (type === 'slow-2g' || type === '2g') return false;
  return true;
}

function warm(loader: () => Promise<unknown>): void {
  if (!shouldPrefetchRoutes()) return;
  void loader().catch(() => {
    /* ignore — navigation will load normally */
  });
}

export function prefetchPackagesPage() {
  warm(() => import('../pages/Packages'));
}

/** Phase 1654: warm Stays browse the same way as Tours. */
export function prefetchStaysPage() {
  warm(() => import('../pages/Stays'));
}

export function prefetchTourDetailsPage() {
  warm(() => import('../pages/TourDetails'));
}

export function prefetchStayDetailsPage() {
  warm(() => import('../pages/StayDetails'));
}

export function prefetchRentalsPage() {
  warm(() => import('../pages/RentalsCatalog'));
}

export function prefetchRentalDetailsPage() {
  warm(() => import('../pages/RentalDetails'));
}

/** Prefetch the correct detail chunk for a catalog card. */
export function prefetchListingDetailsPage(kind: 'tour' | 'stay' | 'rental'): void {
  if (kind === 'stay') prefetchStayDetailsPage();
  else if (kind === 'rental') prefetchRentalDetailsPage();
  else prefetchTourDetailsPage();
}

export function prefetchDestinationPage() {
  warm(() => import('../pages/DestinationPage'));
}

export function prefetchMyBookingsPage() {
  warm(() => import('../pages/MyBookings'));
}

export function prefetchAuthPage() {
  warm(() => import('../pages/AuthPage'));
}

export function prefetchAccountPage() {
  warm(() => import('../pages/AccountPage'));
}

export function prefetchWishlistPage() {
  warm(() => import('../pages/WishlistPage'));
}

export function prefetchBookingConfirmationPage() {
  warm(() => import('../pages/BookingConfirmationPage'));
}
