/**
 * Authoritative booking quote: unit price × guests after discounts, plus date/option rules.
 * Used by the traveler UI and mirrored in supabase/functions/_shared/booking-quote.ts for Stripe.
 * Never trust a client-supplied total.
 */

import type { TourPackage } from '../types/tour';
import {
  materializedBookingOptions,
  parseListingExtras,
  type ListingBookingOption,
} from '../types/listingExtras';
import type { ListingDiscount } from '../data/supabase-discounts';
import { applyDiscount, discountsApplicableToOption } from '../data/supabase-discounts';
import { getPartySizeBounds, getPartySizeBoundsForVariant, guestCountValidationError } from './booking-flow';

export type BookingQuoteDiscount = Pick<
  ListingDiscount,
  'type' | 'value' | 'valid_from' | 'valid_until' | 'booking_option_id'
>;

export type BookingQuoteOk = {
  ok: true;
  currency: string;
  unitPrice: number;
  originalUnitPrice: number;
  totalAmount: number;
  guests: number;
  bookingDate: string;
  optionId: string | null;
  optionLabel: string;
  discountLabel?: string;
};

export type BookingQuoteErr = {
  ok: false;
  code: 'unpublished' | 'bad_date' | 'weekday' | 'season' | 'party' | 'option' | 'price';
  error: string;
};

export type BookingQuoteResult = BookingQuoteOk | BookingQuoteErr;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Monday=0 … Sunday=6 from a calendar date (UTC noon, date-only). */
export function weekdayIndexMondayFirst(isoDate: string): number | null {
  if (!ISO_DATE.test(isoDate)) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  return (dt.getUTCDay() + 6) % 7;
}

export function isIsoDateNotInPast(isoDate: string, todayIso: string): boolean {
  return ISO_DATE.test(isoDate) && isoDate >= todayIso;
}

export function optionRunsOnDate(option: ListingBookingOption, isoDate: string): string | null {
  const idx = weekdayIndexMondayFirst(isoDate);
  if (idx == null) return 'Choose a valid date.';
  const days = option.weekdays;
  if (Array.isArray(days) && days.length >= 7 && !days[idx]) {
    return 'This option is not offered on that day of the week. Pick another date.';
  }
  const from = option.availabilityDateFrom?.trim() ?? '';
  const to = option.availabilityDateTo?.trim() ?? '';
  if (from && isoDate < from) {
    return 'This option is not available yet on that date.';
  }
  if (to && isoDate > to) {
    return 'This option is no longer available on that date.';
  }
  return null;
}

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Human label for option weekdays (Mon=0). */
export function formatOptionWeekdays(weekdays: boolean[] | undefined | null): string {
  if (!Array.isArray(weekdays) || weekdays.length < 7) return 'Every day';
  if (weekdays.every(Boolean)) return 'Every day';
  const weekdayOnly = weekdays.every((on, i) => (i < 5 ? on : !on));
  if (weekdayOnly) return 'Mon–Fri';
  const on = DAY_SHORT.filter((_, i) => weekdays[i]);
  if (on.length === 0) return 'No days selected';
  return on.join(', ');
}

function listingWideDiscounts(discounts: BookingQuoteDiscount[], day: string): BookingQuoteDiscount[] {
  return discounts.filter((d) => {
    if (d.valid_from && day < d.valid_from) return false;
    if (d.valid_until && day > d.valid_until) return false;
    return !(d.booking_option_id && d.booking_option_id.trim());
  });
}

function bestUnitPrice(base: number, applicable: BookingQuoteDiscount[]): { price: number; label?: string } {
  if (applicable.length === 0 || base <= 0) return { price: base };
  let min = base;
  let label: string | undefined;
  for (const d of applicable) {
    const { price, label: l } = applyDiscount(base, d as ListingDiscount);
    if (price < min) {
      min = price;
      label = l;
    }
  }
  return { price: money(min), label: min < base ? label : undefined };
}

function isListingBookable(status: TourPackage['status'] | string | null | undefined): boolean {
  if (status == null || status === '') return true;
  return status === 'published';
}

export type QuoteTourSlice = {
  status?: TourPackage['status'] | string | null;
  price?: { startingFrom?: number; currency?: string };
  listingExtras?: unknown;
  groupSize?: string;
};

/**
 * Server-equivalent quote for a published listing, date, party size, and optional booking option id.
 */
export function quoteBooking(input: {
  tour: QuoteTourSlice;
  discounts: BookingQuoteDiscount[];
  bookingDate: string;
  guests: number;
  bookingOptionId?: string | null;
  /** YYYY-MM-DD; defaults to today UTC. */
  todayIso?: string;
}): BookingQuoteResult {
  const today = input.todayIso ?? new Date().toISOString().slice(0, 10);
  const date = (input.bookingDate ?? '').trim();
  const guests = Number(input.guests);

  if (!isListingBookable(input.tour.status)) {
    return { ok: false, code: 'unpublished', error: 'This experience is not available to book.' };
  }
  if (!ISO_DATE.test(date)) {
    return { ok: false, code: 'bad_date', error: 'Choose a valid date.' };
  }
  if (!isIsoDateNotInPast(date, today)) {
    return { ok: false, code: 'bad_date', error: 'Choose a date that is today or later.' };
  }
  if (!Number.isFinite(guests) || guests < 1 || guests > 99) {
    return { ok: false, code: 'party', error: 'Guest count must be between 1 and 99.' };
  }

  const extras = parseListingExtras(input.tour.listingExtras);
  const opts = materializedBookingOptions(extras.bookingOptions);
  const fallbackBase = Number(input.tour.price?.startingFrom ?? 0);
  const currency = (input.tour.price?.currency ?? 'USD').trim().toUpperCase() || 'USD';
  const requestedId = (input.bookingOptionId ?? '').trim();

  const asTour = input.tour as TourPackage;

  if (opts.length > 0) {
    let option: ListingBookingOption | undefined;
    if (requestedId) {
      option = opts.find((o) => o.id === requestedId);
      if (!option) {
        return { ok: false, code: 'option', error: 'That booking option is not available.' };
      }
    } else if (opts.length === 1) {
      option = opts[0];
    } else {
      return { ok: false, code: 'option', error: 'Choose a booking option to continue.' };
    }

    const dayErr = optionRunsOnDate(option, date);
    if (dayErr) {
      const code = dayErr.includes('week') ? 'weekday' : dayErr.includes('yet') || dayErr.includes('longer') ? 'season' : 'weekday';
      return { ok: false, code, error: dayErr };
    }

    const variant = {
      id: option.id,
      label: option.name.trim() || 'Tour option',
      subtitle: '',
      pricePerPerson: option.priceUsd > 0 ? option.priceUsd : fallbackBase,
      listingOption: option,
    };
    const bounds = getPartySizeBoundsForVariant(asTour, variant);
    const partyErr = guestCountValidationError(guests, bounds);
    if (partyErr) return { ok: false, code: 'party', error: partyErr };

    const base = variant.pricePerPerson > 0 ? variant.pricePerPerson : fallbackBase;
    if (!(base > 0)) {
      return { ok: false, code: 'price', error: 'This experience does not have a bookable price yet.' };
    }
    const at = new Date(`${date}T12:00:00`);
    const applicable = discountsApplicableToOption(input.discounts as ListingDiscount[], option.id, at);
    const { price: unitPrice, label } = bestUnitPrice(base, applicable);
    if (!(unitPrice > 0)) {
      return { ok: false, code: 'price', error: 'This experience does not have a bookable price yet.' };
    }
    return {
      ok: true,
      currency,
      unitPrice,
      originalUnitPrice: money(base),
      totalAmount: money(unitPrice * guests),
      guests,
      bookingDate: date,
      optionId: option.id,
      optionLabel: variant.label,
      discountLabel: label,
    };
  }

  const bounds = getPartySizeBounds(asTour);
  const partyErr = guestCountValidationError(guests, bounds);
  if (partyErr) return { ok: false, code: 'party', error: partyErr };
  if (!(fallbackBase > 0)) {
    return { ok: false, code: 'price', error: 'This experience does not have a bookable price yet.' };
  }
  const { price: unitPrice, label } = bestUnitPrice(fallbackBase, listingWideDiscounts(input.discounts, date));
  if (!(unitPrice > 0)) {
    return { ok: false, code: 'price', error: 'This experience does not have a bookable price yet.' };
  }
  return {
    ok: true,
    currency,
    unitPrice,
    originalUnitPrice: money(fallbackBase),
    totalAmount: money(unitPrice * guests),
    guests,
    bookingDate: date,
    optionId: null,
    optionLabel: 'Standard experience',
    discountLabel: label,
  };
}

/** True when a client-sent amount does not match the authoritative quote (underpay / overpay). */
export function clientAmountConflictsWithQuote(clientTotal: number, quoteTotal: number): boolean {
  if (!Number.isFinite(clientTotal)) return false;
  return Math.abs(clientTotal - quoteTotal) > 0.009;
}
