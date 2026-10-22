/**
 * Option-card prices for the traveler's current date + party — same engine as sticky quoteBooking.
 * Never show a catalog "from" (cheapest age band) as if it were the live selection total.
 */

import type { ListingDiscount } from '../data/supabase-discounts';
import type { TourPackage } from '../types/tour';
import type { TourBookingVariant } from './booking-flow';
import {
  quoteBooking,
  type BookingQuoteOk,
  type BookingQuoteResult,
} from './booking-quote';
import { departureTimesOnDate, FLEXIBLE_DEPARTURE_HM } from './listing-option-schedules';
import {
  buildParticipantMixLines,
  emptyMixSelection,
  optionUsesAgePricing,
  optionUsesPrivateFlatPrice,
  remapMixToOption,
  totalGuestsFromMix,
  type ParticipantMixSelection,
} from './participant-mix';
import { discountedCatalogUnit } from './discount-display';
import { optionHeadlineUnitPrice } from './price-categories';
import { normalizeCurrency } from './money';

export type OptionCardPriceDisplay = {
  /** Live total for the current party on this option (preferred). */
  mode: 'selection' | 'from' | 'unavailable';
  total: number | null;
  originalTotal: number | null;
  discountLabel?: string;
  currency: string;
  /** e.g. "Total for 1 adult" | "From / adult" | "Per person" */
  caption: string;
  guests: number;
};

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function captionForQuote(quote: BookingQuoteOk): string {
  const lines = (quote.lineItems ?? []).filter((line) => line.quantity > 0);
  const several = quote.guests > 1 || lines.length > 1;
  if (several) return 'Total for this selection';
  if (lines[0]?.label) return `Per ${lines[0].label.toLowerCase()}`;
  return 'Per person';
}

function startTimeForPreview(
  variant: TourBookingVariant,
  date: string,
  selectedId: string | null,
  selectedDepartureTime: string
): string | undefined {
  const opt = variant.listingOption;
  if (!opt) return selectedDepartureTime.trim() || undefined;
  if (selectedId === variant.id && selectedDepartureTime.trim()) {
    return selectedDepartureTime.trim();
  }
  try {
    const times = departureTimesOnDate(opt, date).filter(
      (time) => time && time !== FLEXIBLE_DEPARTURE_HM
    );
    if (times.length >= 1) return times[0];
  } catch {
    /* incomplete option fixtures — quote without a time hint */
  }
  return undefined;
}

/**
 * Price shown on an available-option card for the traveler's current date and party.
 * Prefers a full quoteBooking total so cards stay aligned with the sticky panel.
 */
export function optionCardPriceForSelection(input: {
  tour: TourPackage;
  variant: TourBookingVariant;
  bookingDate: string;
  discounts: ListingDiscount[];
  guests: number;
  participantMix: ParticipantMixSelection | null;
  todayIso: string;
  selectedId: string | null;
  selectedDepartureTime: string;
  /** Option that owns the current participantMix category ids (usually the selected option). */
  mixSourceOption?: TourBookingVariant['listingOption'];
  hidePrice?: boolean;
}): OptionCardPriceDisplay {
  const currency = normalizeCurrency(input.tour.price?.currency);
  if (input.hidePrice) {
    return {
      mode: 'unavailable',
      total: null,
      originalTotal: null,
      currency,
      caption: 'Price unavailable',
      guests: input.guests,
    };
  }

  const date = input.bookingDate.trim();
  const opt = input.variant.listingOption;
  const mix =
    opt && optionUsesAgePricing(opt)
      ? Object.keys(input.participantMix ?? {}).length > 0
        ? remapMixToOption(opt, input.mixSourceOption ?? null, input.participantMix!)
        : emptyMixSelection(opt)
      : null;
  const guestsForQuote =
    opt && optionUsesAgePricing(opt) && mix
      ? Math.max(1, totalGuestsFromMix(buildParticipantMixLines(opt, mix)))
      : Math.max(1, input.guests);

  const startTime = startTimeForPreview(
    input.variant,
    date,
    input.selectedId,
    input.selectedDepartureTime
  );

  const quoted: BookingQuoteResult = quoteBooking({
    tour: input.tour,
    discounts: input.discounts,
    bookingDate: date,
    guests: guestsForQuote,
    bookingOptionId: input.variant.id !== '__default__' ? input.variant.id : null,
    participantMix: mix,
    startTime,
    todayIso: input.todayIso,
  });

  if (quoted.ok) {
    const showDiscount =
      Boolean(quoted.discountLabel) &&
      quoted.originalTotalAmount != null &&
      quoted.originalTotalAmount > quoted.totalAmount + 0.004;
    return {
      mode: 'selection',
      total: quoted.totalAmount,
      originalTotal: showDiscount ? quoted.originalTotalAmount! : quoted.totalAmount,
      discountLabel: showDiscount ? quoted.discountLabel : undefined,
      currency: quoted.currency,
      caption: captionForQuote(quoted),
      guests: quoted.guests,
    };
  }

  // Fallback: honest "From" using adult/headline unit — never cheapest child band.
  if (opt) {
    let base = optionHeadlineUnitPrice(opt);
    if (!(base > 0) && input.variant.pricePerPerson > 0) base = input.variant.pricePerPerson;
    if (optionUsesPrivateFlatPrice(opt)) {
      const flat = opt.privateGroupPriceUsd ?? opt.priceUsd;
      if (flat > 0) {
        const offer = discountedCatalogUnit(flat, input.discounts, opt.id, date, currency);
        return {
          mode: 'from',
          total: offer.price,
          originalTotal: offer.originalPrice,
          discountLabel: offer.label,
          currency,
          caption: 'For your group',
          guests: guestsForQuote,
        };
      }
    }
    if (base > 0) {
      const offer = discountedCatalogUnit(base, input.discounts, opt.id, date, currency);
      return {
        mode: 'from',
        total: offer.price,
        originalTotal: offer.originalPrice,
        discountLabel: offer.label,
        currency,
        caption: optionUsesAgePricing(opt) ? 'From / adult' : 'From / person',
        guests: guestsForQuote,
      };
    }
  }

  if (input.variant.pricePerPerson > 0) {
    return {
      mode: 'from',
      total: money(input.variant.pricePerPerson),
      originalTotal: money(input.variant.pricePerPerson),
      currency,
      caption: 'From / person',
      guests: guestsForQuote,
    };
  }

  return {
    mode: 'unavailable',
    total: null,
    originalTotal: null,
    currency,
    caption: 'Price unavailable',
    guests: guestsForQuote,
  };
}
