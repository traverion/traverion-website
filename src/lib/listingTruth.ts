import {
  STAY_GUEST_CANCELLATION_POLICY,
  TRAVERION_STANDARD_CANCELLATION_POLICY,
  materializedBookingOptions,
  parseListingExtras,
} from '../types/listingExtras';
import type { TourPackage } from '../types/tour';
import {
  STAY_GUEST_CANCELLATION_POLICY_48H,
  STAY_GUEST_CANCELLATION_POLICY_7D,
  isStayCancellationPreset,
} from './stay-cancellation-preset';

/** Show “Free cancellation” when the listing uses a free-cancel preset / matching policy text. */
export function listingShowsFreeCancellation(input: {
  tags?: string[] | null;
  cancellationPolicy?: string | null;
  listingExtras?: unknown;
}): boolean {
  if (input.tags?.includes('free-cancellation')) return true;
  if (input.listingExtras != null) {
    const preset = parseListingExtras(input.listingExtras).cancellationPreset;
    if (preset === 'non_refundable') return false;
    if (isStayCancellationPreset(preset) && preset !== 'non_refundable') return true;
  }
  const policy = (input.cancellationPolicy ?? '').trim();
  // Empty policy is unknown — do not advertise free cancellation by default.
  return (
    policy === TRAVERION_STANDARD_CANCELLATION_POLICY ||
    policy === STAY_GUEST_CANCELLATION_POLICY ||
    policy === STAY_GUEST_CANCELLATION_POLICY_48H ||
    policy === STAY_GUEST_CANCELLATION_POLICY_7D
  );
}

/** Browse tag chips must match real listing fields, not stale tags[] alone. */
export function listingTourMatchesBrowseTag(tour: TourPackage, tagId: string): boolean {
  if (tagId === 'free-cancellation') {
    return listingShowsFreeCancellation({
      tags: tour.tags,
      cancellationPolicy: tour.cancellationPolicy,
      listingExtras: tour.listingExtras,
    });
  }
  if (tagId === 'pickup-available') {
    const opts = materializedBookingOptions(parseListingExtras(tour.listingExtras).bookingOptions);
    // Meeting point alone is not pickup — require real pickup place/instructions.
    if (opts.some((o) => (o.pickupPlace ?? '').trim().length >= 8)) return true;
    if ((tour.pickupInstructions ?? '').trim().length >= 8) return true;
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
