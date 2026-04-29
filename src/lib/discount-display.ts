import type { TourPackage } from '../types/tour';
import { parseListingExtras, materializedBookingOptions } from '../types/listingExtras';
import type { ListingDiscount } from '../data/supabase-discounts';
import {
  applyDiscount,
  discountsApplicableToOption,
  getValidDiscount,
} from '../data/supabase-discounts';

export function isSupabaseListingId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function activeOnCalendarDay(d: ListingDiscount, day: string): boolean {
  if (d.valid_from && day < d.valid_from) return false;
  if (d.valid_until && day > d.valid_until) return false;
  return true;
}

/** Discounts that apply to the listing “from” price when there are no structured booking options (legacy). */
function listingWideActiveDiscounts(discounts: ListingDiscount[], at: Date): ListingDiscount[] {
  const day = at.toISOString().slice(0, 10);
  return discounts.filter(
    (d) => activeOnCalendarDay(d, day) && !(d.booking_option_id && d.booking_option_id.trim())
  );
}

function bestDiscountedPrice(
  base: number,
  applicable: ListingDiscount[]
): { price: number; label?: string } {
  if (applicable.length === 0 || base <= 0) return { price: base };
  let min = base;
  let label: string | undefined;
  for (const d of applicable) {
    const { price, label: l } = applyDiscount(base, d);
    if (price < min) {
      min = price;
      label = l;
    }
  }
  return { price: min, label: min < base ? label : undefined };
}

/**
 * “From” price for cards and tour header: minimum across bookable options after applying
 * listing-wide and option-scoped discounts that are valid on `at`.
 */
export function getDisplayPriceForTour(
  tour: TourPackage,
  discountsByListing: Map<string, ListingDiscount[]>,
  at: Date = new Date()
): { price: number; originalPrice: number; label?: string } {
  const discounts = discountsByListing.get(tour.id) ?? [];
  const extras = parseListingExtras(tour.listingExtras as unknown);
  const opts = materializedBookingOptions(extras.bookingOptions);
  const fallbackBase = tour.price?.startingFrom ?? 0;

  if (opts.length === 0) {
    const applicable = listingWideActiveDiscounts(discounts, at);
    const { price, label } = bestDiscountedPrice(fallbackBase, applicable);
    return { price, originalPrice: fallbackBase, label };
  }

  let bestPrice = Infinity;
  let bestOriginal = fallbackBase;
  let bestLabel: string | undefined;

  for (const opt of opts) {
    const base = typeof opt.priceUsd === 'number' && opt.priceUsd > 0 ? opt.priceUsd : fallbackBase;
    const applicable = discountsApplicableToOption(discounts, opt.id, at);
    const { price, label } = bestDiscountedPrice(base, applicable);
    if (price < bestPrice) {
      bestPrice = price;
      bestOriginal = base;
      bestLabel = label;
    }
  }

  if (bestPrice === Infinity || !Number.isFinite(bestPrice)) {
    return { price: fallbackBase, originalPrice: fallbackBase };
  }
  return { price: bestPrice, originalPrice: bestOriginal, label: bestLabel };
}

/** Per-person price for a chosen booking variant (option-scoped or listing-wide discounts). */
export function getDisplayPriceForBookingVariant(
  tour: TourPackage,
  variant: {
    pricePerPerson: number;
    listingOption: import('../types/listingExtras').ListingBookingOption | null;
  },
  discountsByListing: Map<string, ListingDiscount[]>,
  bookingDateIso: string
): { price: number; originalPrice: number; label?: string } {
  const discounts = discountsByListing.get(tour.id) ?? [];
  const day = (bookingDateIso.trim() || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const at = new Date(`${day}T12:00:00`);
  const fallbackBase = tour.price?.startingFrom ?? 0;
  const base = variant.pricePerPerson > 0 ? variant.pricePerPerson : fallbackBase;
  if (variant.listingOption) {
    const applicable = discountsApplicableToOption(discounts, variant.listingOption.id, at);
    const { price, label } = bestDiscountedPrice(base, applicable);
    return { price, originalPrice: base, label };
  }
  const applicable = listingWideActiveDiscounts(discounts, at);
  const { price, label } = bestDiscountedPrice(base, applicable);
  return { price, originalPrice: base, label };
}

/**
 * @deprecated Prefer {@link getDisplayPriceForTour} when you have the full tour (correct per-option discounts).
 */
export function getDisplayPrice(
  listingId: string,
  originalPrice: number,
  discountsByListing: Map<string, ListingDiscount[]>,
  at: Date = new Date()
): { price: number; originalPrice: number; label?: string } {
  const discounts = discountsByListing.get(listingId) ?? [];
  const valid = getValidDiscount(discounts, at);
  if (!valid) {
    return { price: originalPrice, originalPrice };
  }
  const { price, label } = applyDiscount(originalPrice, valid);
  return { price, originalPrice, label };
}
