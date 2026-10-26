import type { TourPackage } from '../types/tour';
import { parseListingExtras, materializedBookingOptions } from '../types/listingExtras';
import type { ListingDiscount } from '../data/supabase-discounts';
import {
  applyDiscount,
  discountsApplicableToOption,
  getValidDiscount,
} from '../data/supabase-discounts';
import { pickHeadlineOption, pricedNamesFromBookingOptions } from './headline-price';
import { normalizeCurrency } from './money';
import { localYmd } from './local-ymd';
import { experienceTodayIsoForListing } from './booking-quote';
import { listingIsFamily } from './inventory';
import {
  listingOptionHasSchedules,
  listingOptionReadySchedules,
  resolveScheduleForDate,
  tourSellingDeparturesOnDate,
} from './listing-option-schedules';
import { optionHeadlineUnitPrice, optionPricingMode } from './price-categories';
import type { ListingBookingOption } from '../types/listingExtras';

export function isSupabaseListingId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function activeOnCalendarDay(d: ListingDiscount, day: string): boolean {
  if (d.valid_from && day < d.valid_from) return false;
  if (d.valid_until && day > d.valid_until) return false;
  return true;
}

/** Discounts that apply to the listing “from” price when there are no structured booking options (legacy). */
function listingWideActiveDiscounts(discounts: ListingDiscount[], dayIso: string): ListingDiscount[] {
  return discounts.filter(
    (d) => activeOnCalendarDay(d, dayIso) && !(d.booking_option_id && d.booking_option_id.trim())
  );
}

/** Catalog “today” for offer badges — experience-local when the listing has a departure timezone. */
export function catalogOfferTodayIso(tour: TourPackage, nowMs: number = Date.now()): string {
  const tz = parseListingExtras(tour.listingExtras as unknown).departureTimezone;
  return experienceTodayIsoForListing(tz, nowMs);
}

function catalogOfferAnchorDate(tour: TourPackage, at: Date): Date {
  const day = catalogOfferTodayIso(tour, at.getTime());
  return new Date(`${day}T12:00:00`);
}

/**
 * Lowest genuine unit after offers that apply to this option on the departure day.
 * Returns no label when nothing reduces the price.
 */
export function discountedCatalogUnit(
  base: number,
  discounts: ListingDiscount[],
  optionId: string,
  dayIso: string,
  currency: string
): { price: number; originalPrice: number; label?: string } {
  const applicable = discountsApplicableToOption(discounts, optionId, dayIso, dayIso);
  const { price, label } = bestDiscountedPrice(base, applicable, currency);
  const reduced = price < base - 0.004;
  return { price: reduced ? price : base, originalPrice: base, label: reduced ? label : undefined };
}

function bestDiscountedPrice(
  base: number,
  applicable: ListingDiscount[],
  currency: string
): { price: number; label?: string } {
  if (applicable.length === 0 || base <= 0) return { price: base };
  let min = base;
  let label: string | undefined;
  for (const d of applicable) {
    const { price, label: l } = applyDiscount(base, d, currency);
    if (price < min) {
      min = price;
      label = l;
    }
  }
  return { price: min, label: min < base ? label : undefined };
}

export type TourDisplayPrice = {
  price: number;
  originalPrice: number;
  label?: string;
  /** e.g. “adult” when the headline is a participant type, not the cheapest child fare. */
  qualifier: string | null;
  /** “Adult €189 · Child €149” when that mix exists. */
  summary: string | null;
};

function discountedHeadline(
  tour: TourPackage,
  opt: { id: string; name: string; priceUsd: number },
  discounts: ListingDiscount[],
  at: Date,
  fallbackBase: number
): TourDisplayPrice {
  const currency = normalizeCurrency(tour.price?.currency);
  const extras = parseListingExtras(tour.listingExtras as unknown);
  const allOpts = materializedBookingOptions(extras.bookingOptions);
  const base = typeof opt.priceUsd === 'number' && opt.priceUsd > 0 ? opt.priceUsd : fallbackBase;
  const applicable = discountsApplicableToOption(discounts, opt.id, at);
  const { price, label } = bestDiscountedPrice(base, applicable, currency);
  const picked = pickHeadlineOption(allOpts);
  return {
    price,
    originalPrice: base,
    label,
    qualifier: picked.qualifier,
    // Participant breakdowns belong on the PDP / booking flow — not discovery cards.
    summary: null,
  };
}

export type DisplayPriceOptions = {
  at?: Date;
  /** Search browse civil date — price + offers for that day only. */
  browseDateIso?: string;
  /** Exclude options that cannot fit this party (maxPersons). */
  partySize?: number;
};

function resolveDisplayPriceArgs(
  atOrOptions: Date | DisplayPriceOptions | undefined
): Required<Pick<DisplayPriceOptions, 'at'>> & DisplayPriceOptions {
  if (!atOrOptions) return { at: new Date() };
  if (atOrOptions instanceof Date) return { at: atOrOptions };
  return { at: atOrOptions.at ?? new Date(), ...atOrOptions };
}

function optionEligibleForBrowse(
  option: ListingBookingOption,
  browseDateIso: string | undefined,
  partySize: number | undefined
): boolean {
  if (typeof partySize === 'number' && partySize > 0) {
    const max = option.maxPersons;
    if (typeof max === 'number' && max > 0 && partySize > max) return false;
  }
  if (!browseDateIso) return true;
  return tourSellingDeparturesOnDate([option], browseDateIso).length > 0;
}

function optionUnitForBrowseDate(option: ListingBookingOption, browseDateIso: string | undefined): number {
  if (browseDateIso && listingOptionHasSchedules(option)) {
    const resolved = resolveScheduleForDate(option, browseDateIso);
    if (resolved) {
      const n = optionHeadlineUnitPrice(resolved);
      if (n > 0) return n;
    }
  }
  return optionHeadlineUnitPrice(option);
}

/**
 * Catalog / header price. When options are participant types (Adult / Child), this is the
 * adult/standard fare — never the cheapest child price without context.
 * Discovery cards omit `summary` (participant breakdowns belong on the PDP).
 */
export function getDisplayPriceForTour(
  tour: TourPackage,
  discountsByListing: Map<string, ListingDiscount[]>,
  atOrOptions: Date | DisplayPriceOptions = new Date()
): TourDisplayPrice {
  const { at, browseDateIso, partySize } = resolveDisplayPriceArgs(atOrOptions);
  const browseDay =
    browseDateIso && /^\d{4}-\d{2}-\d{2}$/.test(browseDateIso.trim()) ? browseDateIso.trim() : undefined;

  if (listingIsFamily(tour, 'stay')) {
    const extras = parseListingExtras(tour.listingExtras as unknown);
    const nightly =
      extras.stay?.nightlyPriceUsd && extras.stay.nightlyPriceUsd > 0
        ? extras.stay.nightlyPriceUsd
        : tour.price?.startingFrom ?? 0;
    const discounts = discountsByListing.get(tour.id) ?? [];
    const offerDayIso = browseDay ?? catalogOfferTodayIso(tour, at.getTime());
    const applicable = listingWideActiveDiscounts(discounts, offerDayIso).filter(
      (d) => !d.paused && !d.deleted_at
    );
    const { price, label } = bestDiscountedPrice(nightly, applicable, normalizeCurrency(tour.price?.currency));
    return {
      price,
      originalPrice: nightly,
      label,
      qualifier: null,
      summary: null,
    };
  }
  const discounts = discountsByListing.get(tour.id) ?? [];
  const extras = parseListingExtras(tour.listingExtras as unknown);
  const allOpts = materializedBookingOptions(extras.bookingOptions);
  const opts = allOpts.filter((o) => optionEligibleForBrowse(o, browseDay, partySize));
  const fallbackBase = tour.price?.startingFrom ?? 0;
  const currency = normalizeCurrency(tour.price?.currency);
  const emptyMeta = {
    qualifier: null as string | null,
    // Discovery must not surface Adult/Child breakdowns — keep null for card/PDP header consistency.
    summary: null as string | null,
  };
  // Offer day: selected browse date when present, else experience-local today.
  const offerDayIso = browseDay ?? catalogOfferTodayIso(tour, at.getTime());
  const offerAt = browseDay ? new Date(`${browseDay}T12:00:00`) : catalogOfferAnchorDate(tour, at);

  if (opts.length === 0) {
    if (browseDay || (typeof partySize === 'number' && partySize > 0)) {
      // No eligible option for this search context — do not invent a catalog price.
      return { price: 0, originalPrice: 0, label: undefined, ...emptyMeta };
    }
    const applicable = listingWideActiveDiscounts(discounts, offerDayIso);
    const { price, label } = bestDiscountedPrice(fallbackBase, applicable, currency);
    return { price, originalPrice: fallbackBase, label, ...emptyMeta };
  }

  const named = pricedNamesFromBookingOptions(opts);
  const picked = pickHeadlineOption(named.length > 0 ? named : opts);
  if (picked.option && (picked.mode === 'participant-standard' || picked.mode === 'single')) {
    const host =
      opts.find((o) => {
        if (listingOptionHasSchedules(o)) {
          return listingOptionReadySchedules(o).some((s) =>
            optionPricingMode(s) === 'age_dependent'
              ? (s.priceCategories ?? []).some(
                  (c) =>
                    !c.notPermitted &&
                    c.label.trim() === picked.option!.name.trim() &&
                    c.priceUsd === picked.option!.priceUsd
                )
              : s.priceUsd === picked.option!.priceUsd
          );
        }
        return (
          (o.pricingMode === 'age_dependent' &&
            (o.priceCategories ?? []).some(
              (c) =>
                !c.notPermitted &&
                c.label.trim() === picked.option!.name.trim() &&
                c.priceUsd === picked.option!.priceUsd
            )) ||
          (o.name.trim() === picked.option!.name.trim() && o.priceUsd === picked.option!.priceUsd)
        );
      }) ?? opts[0];
    const unit = optionUnitForBrowseDate(host, browseDay) || picked.option.priceUsd;
    return discountedHeadline(
      tour,
      { id: host.id, name: picked.option.name, priceUsd: unit },
      discounts,
      offerAt,
      fallbackBase
    );
  }

  let bestPrice = Infinity;
  let bestOriginal = fallbackBase;
  let bestLabel: string | undefined;

  for (const opt of opts) {
    const base = optionUnitForBrowseDate(opt, browseDay);
    if (!(base > 0)) continue;
    const applicable = discountsApplicableToOption(discounts, opt.id, offerAt);
    const { price, label } = bestDiscountedPrice(base, applicable, currency);
    if (price < bestPrice) {
      bestPrice = price;
      bestOriginal = base;
      bestLabel = label;
    }
  }

  if (bestPrice === Infinity || !Number.isFinite(bestPrice)) {
    return { price: fallbackBase, originalPrice: fallbackBase, ...emptyMeta };
  }
  return {
    price: bestPrice,
    originalPrice: bestOriginal,
    label: bestLabel,
    qualifier: picked.qualifier,
    summary: null,
  };
}

/** Amount used for catalog filters/sort when stored `startingFrom` may still be a child min. */
export function catalogHeadlineAmount(tour: TourPackage): number {
  const extras = parseListingExtras(tour.listingExtras as unknown);
  const opts = materializedBookingOptions(extras.bookingOptions);
  const named = pricedNamesFromBookingOptions(opts);
  const picked = pickHeadlineOption(named.length > 0 ? named : opts);
  if (picked.option && picked.option.priceUsd > 0) return picked.option.priceUsd;
  return tour.price?.startingFrom ?? 0;
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
  const day = (bookingDateIso.trim() || localYmd()).slice(0, 10);
  const at = new Date(`${day}T12:00:00`);
  const fallbackBase = tour.price?.startingFrom ?? 0;
  let base = variant.pricePerPerson > 0 ? variant.pricePerPerson : fallbackBase;
  if (variant.listingOption && listingOptionHasSchedules(variant.listingOption)) {
    const resolved = resolveScheduleForDate(variant.listingOption, day);
    if (resolved) {
      const scheduled = optionHeadlineUnitPrice(resolved);
      if (scheduled > 0) base = scheduled;
    }
  }
  const currency = normalizeCurrency(tour.price?.currency);
  if (variant.listingOption) {
    const applicable = discountsApplicableToOption(discounts, variant.listingOption.id, at);
    const { price, label } = bestDiscountedPrice(base, applicable, currency);
    return { price, originalPrice: base, label };
  }
  const applicable = listingWideActiveDiscounts(discounts, day);
  const { price, label } = bestDiscountedPrice(base, applicable, currency);
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
