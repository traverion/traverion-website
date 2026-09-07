/** Warm route chunks before navigation so Tours / a tour page feel instant. */

export function prefetchPackagesPage() {
  void import('../pages/Packages');
}

export function prefetchTourDetailsPage() {
  void import('../pages/TourDetails');
}

export function prefetchMyBookingsPage() {
  void import('../pages/MyBookings');
}

export function prefetchAuthPage() {
  void import('../pages/AuthPage');
}
