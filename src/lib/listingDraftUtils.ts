import type { TourPackage } from '../types/tour';

/**
 * Ensures required listing columns are non-empty for draft insert/update (DB NOT NULL on title, destination, duration).
 * Destination should already be resolved by the listing builder; this is a last-resort fallback.
 */
export function normalizeListingForDraftSave(tour: TourPackage): TourPackage {
  return {
    ...tour,
    status: 'draft',
    title: tour.title.trim() || 'Untitled draft',
    destination: tour.destination.trim() || 'Various locations',
    duration: tour.duration.trim() || 'To be confirmed',
  };
}
