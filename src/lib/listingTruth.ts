import { TRAVERION_STANDARD_CANCELLATION_POLICY } from '../types/listingExtras';
import type { TourPackage } from '../types/tour';
import { materializedBookingOptions, parseListingExtras } from '../types/listingExtras';

/** Show “Free cancellation” only when the listing actually uses Traverion’s 24h terms or the tag. */
export function listingShowsFreeCancellation(input: {
  tags?: string[] | null;
  cancellationPolicy?: string | null;
}): boolean {
  if (input.tags?.includes('free-cancellation')) return true;
  const policy = (input.cancellationPolicy ?? '').trim();
  return policy.length === 0 || policy === TRAVERION_STANDARD_CANCELLATION_POLICY;
}

/** Browse tag chips must match real listing fields, not stale tags[] alone. */
export function listingTourMatchesBrowseTag(tour: TourPackage, tagId: string): boolean {
  if (tagId === 'free-cancellation') {
    return listingShowsFreeCancellation({ tags: tour.tags, cancellationPolicy: tour.cancellationPolicy });
  }
  if (tagId === 'pickup-available') {
    const opts = materializedBookingOptions(parseListingExtras(tour.listingExtras).bookingOptions);
    if (opts.some((o) => (o.pickupPlace ?? '').trim().length >= 8)) return true;
    if ((tour.pickupInstructions ?? '').trim().length >= 8) return true;
    if ((tour.meetingPoint ?? '').trim().length >= 8) return true;
    return Boolean(tour.tags?.includes('pickup-available'));
  }
  return Boolean(tour.tags?.includes(tagId));
}

export type ReviewAggregate = { rating: number; count: number };

/** Guest-facing score: real aggregates only. Never a default 4.5. */
export function publicReviewLabel(aggregate: ReviewAggregate | null | undefined): {
  score: string | null;
  count: number;
} {
  if (aggregate && aggregate.count > 0) {
    return { score: Number.isFinite(aggregate.rating) ? aggregate.rating.toFixed(1) : null, count: aggregate.count };
  }
  return { score: null, count: 0 };
}
