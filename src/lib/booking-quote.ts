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
import { discountsApplicableToOption } from '../data/supabase-discounts';
import { bestCustomerDiscount } from './offer-eligibility';
import { getPartySizeBounds, getPartySizeBoundsForVariant, guestCountValidationError } from './booking-flow';
import { listingCanUseTravelerQuote } from './inventory';
import { travelerFacingBookingOptions } from './legacy-participant-options';
import { DEFAULT_CURRENCY, normalizeCurrency } from './money';
import { ymdInTimeZone } from './booking-lifecycle-calendar';
import { localYmd } from './local-ymd';
import { STAY_MAX_OCCUPIED_NIGHTS } from './stayOccupancy';
import { quoteStayLodging, stayNightDates } from './stay-season-quote';
import { resolveStayLodgingWithOffers } from './stay-offer-pricing';
import { validateStayGuestParty, type StayGuestBreakdownRow, type StayGuestParty } from './stay-guest-party';
import { priceStayAddOns, stayChargeLines, type StayExtraSelection, type StayPaidExtra, type StayPricedExtra } from './stay-price';
import { confirmedDepartureKey, evaluateDepartureBookingWindow } from './last-minute-booking';
import { findSlotOverride, resolveSlotCutoffHours } from './listing-slot-overrides';
import {
  normalizeBookingCutoffHours,
  resolveDepartureTimezone,
  TRAVERION_DEPARTURE_TIMEZONE,
  wallTimeInZoneToUtcMs,
} from './tour-departure-cutoff';

/** Calendar “today” for quote past-date gates — listing departure TZ, not browser/UTC. */
export function experienceTodayIsoForListing(
  departureTimezone: unknown,
  nowMs: number = Date.now()
): string {
  const tz = resolveDepartureTimezone(departureTimezone);
  // Phase 1274: platform Helsinki before browser-local — matches edge checkout quote.
  return (
    ymdInTimeZone(nowMs, tz) ??
    ymdInTimeZone(nowMs, TRAVERION_DEPARTURE_TIMEZONE) ??
    localYmd(new Date(nowMs))
  );
}
import {
  buildParticipantMixLines,
  guestBreakdownFromLines,
  mixLineAmount,
  mixSubtotal,
  optionUsesAgePricing,
  optionUsesPrivateFlatPrice,
  totalGuestsFromMix,
  validateParticipantMix,
  type ParticipantMixSelection,
} from './participant-mix';
import {
  applyScheduleToOption,
  listingOptionHasSchedules,
  optionHasScheduleCoverageOnDate,
  resolveScheduleForDate,
  scheduleIsBookable,
  tourSellingDeparturesOnDate,
  type TourSellingDeparture,
} from './listing-option-schedules';
import { optionHeadlineUnitPrice } from './price-categories';

export type BookingQuoteDiscount = Pick<
  ListingDiscount,
  | 'id'
  | 'type'
  | 'value'
  | 'valid_from'
  | 'valid_until'
  | 'booking_option_id'
  | 'book_from'
  | 'book_until'
  | 'activity_from'
  | 'activity_until'
  | 'paused'
  | 'deleted_at'
  | 'booking_limit'
  | 'redeemed_count'
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
  /** Undiscounted customer total for the same party. Equals totalAmount when no offer applies. */
  originalTotalAmount?: number;
  /** Present when age-dependent pricing was used. */
  lineItems?: { label: string; quantity: number; unitPrice: number; amount: number }[];
  guestBreakdown?: { categoryId: string; label: string; kind: string; quantity: number; unitPrice: number }[];
};

export type BookingQuoteErr = {
  ok: false;
  code: 'unpublished' | 'bad_date' | 'weekday' | 'season' | 'party' | 'option' | 'time' | 'price' | 'inventory';
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

export function optionRunsOnDate(option: ListingBookingOption, isoDate: string, startTime?: string): string | null {
  if (listingOptionHasSchedules(option)) {
    if (optionHasScheduleCoverageOnDate(option, isoDate)) {
      if (startTime?.trim()) {
        const resolved = resolveScheduleForDate(option, isoDate, startTime);
        if (!resolved) return 'This option is not offered at that time on that date.';
      }
      return null;
    }
    return 'This option is not available on that date.';
  }
  const idx = weekdayIndexMondayFirst(isoDate);
  if (idx == null) return 'Choose a valid date.';
  const days = option.weekdays;
  if (Array.isArray(days) && days.length >= 7 && !days[idx]) {
    return 'This option is not offered on that day of the week. Pick another date.';
  }
  const from = option.availabilityDateFrom?.trim() ?? '';
  const to = option.availabilityDateTo?.trim() ?? '';
  // Phase 1507: empty season start must not open the traveler calendar — departureTimesOnDate
  // already requires scheduleIsBookable (from + startTime); optionRunsOnDate must match.
  if (!from) {
    return 'This option is missing a season start date and cannot be booked.';
  }
  if (from && isoDate < from) {
    return 'This option is not available yet on that date.';
  }
  if (to && isoDate > to) {
    return 'This option is no longer available on that date.';
  }
  return null;
}

/**
 * Whether a listing can run on this date for search.
 * If it has no booking options, do not hide it. If it has options, keep it when at least one option runs.
 */
export function listingRunsOnDate(tour: QuoteTourSlice, isoDate: string): boolean {
  if (!ISO_DATE.test(isoDate)) return true;
  const extras = parseListingExtras(tour.listingExtras);
  const opts = materializedBookingOptions(extras.bookingOptions);
  if (opts.length === 0) return true;
  return opts.some((o) => optionRunsOnDate(o, isoDate) === null);
}

/**
 * Selling departures that still pass booking cutoff (same set as PDP time chips).
 * Capacity / sold-out calendars must use this — not raw tourSellingDeparturesOnDate —
 * or a past-cutoff morning slot with seats can keep a day “open” while evening is sold out.
 */
export function tourBookableSellingDeparturesOnDate(
  options: ListingBookingOption[] | null | undefined,
  isoDate: string,
  params: {
    cutoffHoursBeforeStart?: number | null;
    timeZone?: string | null;
    nowMs?: number;
    /** Date-specific cutoff overrides from listing_extras.slotOverrides */
    slotOverrides?: Array<{ date: string; startTimeHm: string; cutoffHours?: number }> | null;
    /** `YYYY-MM-DD|HH:MM|optionId` for departures that already have a confirmed paid booking. */
    confirmedDepartureKeys?: ReadonlySet<string>;
  } = {}
): TourSellingDeparture[] {
  const listingCutoff = normalizeBookingCutoffHours(params.cutoffHoursBeforeStart);
  const timeZone = resolveDepartureTimezone(params.timeZone);
  const byId = new Map((options ?? []).map((o) => [o.id, o]));
  const overrides = params.slotOverrides ?? [];
  return tourSellingDeparturesOnDate(options, isoDate).filter((d) => {
    const hm = d.startTime.trim();
    const optionCutoff = normalizeBookingCutoffHours(
      byId.get(d.optionId)?.bookingCutoffHoursBeforeStart
    );
    const baseline = optionCutoff > 0 ? optionCutoff : listingCutoff;
    const ov = overrides.find(
      (o) => o.date === isoDate && (o.startTimeHm === hm || o.startTimeHm === hm.slice(0, 5))
    );
    const cutoff =
      ov?.cutoffHours != null ? normalizeBookingCutoffHours(ov.cutoffHours) : baseline;
    if (!hm) return cutoff <= 0;
    const option = byId.get(d.optionId);
    const confirmed = params.confirmedDepartureKeys?.has(confirmedDepartureKey(isoDate, hm, d.optionId)) === true;
    return evaluateDepartureBookingWindow({
      bookingDate: isoDate,
      startTimeHm: hm,
      cutoffHoursBeforeStart: cutoff,
      nowMs: params.nowMs,
      timeZone,
      lastMinuteEnabled: option?.lastMinuteBookings === true,
      lastMinuteUntil: option?.lastMinuteUntil,
      confirmedPaidOnDeparture: confirmed,
    }).ok;
  });
}

/**
 * Browse/search date filter: listing must run that day AND still have at least one
 * departure that passes booking cutoff in the listing timezone (same rule as TourDetails
 * departure chips). Without this, catalog shows tours that quote then rejects.
 */
export function listingHasBookableDepartureOnDate(
  tour: QuoteTourSlice,
  isoDate: string,
  nowMs?: number
): boolean {
  if (!ISO_DATE.test(isoDate)) return true;
  if (!listingRunsOnDate(tour, isoDate)) return false;
  const extras = parseListingExtras(tour.listingExtras);
  const opts = materializedBookingOptions(extras.bookingOptions);
  if (opts.length === 0) return true;
  const cutoff = normalizeBookingCutoffHours(extras.bookingCutoffHoursBeforeStart);
  const bookable = tourBookableSellingDeparturesOnDate(opts, isoDate, {
    cutoffHoursBeforeStart: cutoff,
    timeZone: extras.departureTimezone,
    nowMs,
    slotOverrides: extras.slotOverrides,
  });
  const selling = tourSellingDeparturesOnDate(opts, isoDate).filter((d) => d.startTime.trim());
  if (selling.length === 0) {
    // Weekday/window open but no concrete start times — cutoff cannot be evaluated.
    return cutoff <= 0;
  }
  return bookable.length > 0;
}

/**
 * Phase 1260: catalog without a date filter must still hide tours whose every
 * ready season has already ended (publish 1258/1259 parity).
 */
export function listingHasUpcomingBookableSeason(
  tour: QuoteTourSlice,
  todayIso?: string,
  nowMs?: number
): boolean {
  const extras = parseListingExtras(tour.listingExtras);
  const today =
    todayIso ?? experienceTodayIsoForListing(extras.departureTimezone, nowMs);
  if (!ISO_DATE.test(today)) return true;
  const opts = materializedBookingOptions(extras.bookingOptions);
  if (opts.length === 0) return true;
  for (const o of opts) {
    if (Array.isArray(o.schedules) && o.schedules.length > 0) {
      for (const s of o.schedules) {
        // Phase 1295: ready + scheduleIsBookable + not-ended (partner publish / quote parity).
        if (s.status !== 'ready' || !scheduleIsBookable(s)) continue;
        const to = (s.availabilityDateTo ?? '').trim();
        if (!to || to >= today) return true;
      }
    } else {
      // Phase 1296: flat options need from + startTime like tourSellingDeparturesOnDate 1293.
      const from = (o.availabilityDateFrom ?? '').trim();
      const to = (o.availabilityDateTo ?? '').trim();
      if (!from || !(o.startTime ?? '').trim()) continue;
      if (!to || to >= today) return true;
    }
  }
  return false;
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

function listingWideDiscounts(
  discounts: BookingQuoteDiscount[],
  activityDay: string,
  bookingDay: string
): BookingQuoteDiscount[] {
  return discountsApplicableToOption(
    discounts as ListingDiscount[],
    '',
    activityDay,
    bookingDay
  ).filter((d) => !(d.booking_option_id && d.booking_option_id.trim()));
}

function bestUnitPrice(
  base: number,
  applicable: BookingQuoteDiscount[],
  currency: string
): { price: number; label?: string } {
  const best = bestCustomerDiscount(base, applicable, currency);
  return { price: money(best.price), label: best.label };
}

function isListingBookable(status: TourPackage['status'] | string | null | undefined): boolean {
  // Phase 583: a falsy status (null, undefined, '') must NEVER be treated
  // as bookable. It used to be, as a defensive fallback for pre-migration
  // -003 rows -- but migration 003's ADD COLUMN ... DEFAULT 'published'
  // already backfilled every existing row to the literal string
  // 'published', so a falsy status today can only mean an explicit
  // status: null set directly against the REST API, which also bypassed
  // the migration-082 publish-verification trigger. Only the literal
  // string 'published' is ever bookable.
  return status === 'published';
}

export type QuoteTourSlice = {
  status?: TourPackage['status'] | string | null;
  price?: { startingFrom?: number; currency?: string };
  listingExtras?: unknown;
  groupSize?: string;
  isHolidayPackage?: boolean;
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
  /** Age-category quantities when the selected option uses age-dependent pricing. */
  participantMix?: ParticipantMixSelection | null;
  /** Local departure HH:MM when an option has more than one time on this date. */
  startTime?: string | null;
  /** YYYY-MM-DD; defaults to experience-local today (listing departureTimezone). */
  todayIso?: string;
  /** Epoch ms for cut-off tests; defaults to Date.now(). */
  nowMs?: number;
  /**
   * True only when this exact departure already has a confirmed paid booking.
   * The checkout server recomputes this from booking rows; the client uses it
   * so the calendar and quote agree before payment.
   */
  confirmedPaidOnDeparture?: boolean;
}): BookingQuoteResult {
  const date = (input.bookingDate ?? '').trim();
  let guests = Number(input.guests);

  if (!isListingBookable(input.tour.status)) {
    return { ok: false, code: 'unpublished', error: 'This tour is not available to book.' };
  }
  if (!listingCanUseTravelerQuote(input.tour)) {
    return { ok: false, code: 'inventory', error: 'This listing is not available to book yet.' };
  }

  const extras = parseListingExtras(input.tour.listingExtras);
  const cutoffHours = normalizeBookingCutoffHours(extras.bookingCutoffHoursBeforeStart);
  const departureTimezone = resolveDepartureTimezone(extras.departureTimezone);
  // Phase 1531: cutoff uses live clock (Date.now), not noon-on-todayIso.
  // todayIso remains only for calendar "today or later" gates (PDP chip parity).
  const nowMs = input.nowMs ?? Date.now();
  const today = input.todayIso ?? experienceTodayIsoForListing(departureTimezone, nowMs);
  if (!ISO_DATE.test(date)) {
    return { ok: false, code: 'bad_date', error: 'Choose a valid date.' };
  }
  if (!isIsoDateNotInPast(date, today)) {
    return { ok: false, code: 'bad_date', error: 'Choose a date that is today or later.' };
  }
  const opts = travelerFacingBookingOptions(extras.bookingOptions);
  const fallbackBase = Number(input.tour.price?.startingFrom ?? 0);
  const currency = normalizeCurrency(input.tour.price?.currency ?? DEFAULT_CURRENCY);
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

    const dayErr = optionRunsOnDate(option, date, input.startTime ?? undefined);
    if (dayErr) {
      const code = dayErr.includes('week') ? 'weekday' : dayErr.includes('yet') || dayErr.includes('longer') || dayErr.includes('not available') ? 'season' : 'weekday';
      return { ok: false, code, error: dayErr };
    }

    if (listingOptionHasSchedules(option)) {
      const resolved = resolveScheduleForDate(option, date, input.startTime ?? undefined);
      if (!resolved) {
        return {
          ok: false,
          code: 'time',
          error: 'Choose a departure time to continue.',
        };
      }
      option = applyScheduleToOption(option, resolved, input.startTime ?? undefined);
    }

    const departureHm = (input.startTime ?? option.startTime ?? '').trim().slice(0, 5);
    if (departureHm) {
      // Option cutoff → listing fallback → per-slot override (same as server effectiveBookingCutoffHours).
      const optionCutoff = normalizeBookingCutoffHours(option.bookingCutoffHoursBeforeStart);
      const baselineCutoff = optionCutoff > 0 ? optionCutoff : cutoffHours;
      const effectiveCutoff = resolveSlotCutoffHours({
        baselineCutoffHours: baselineCutoff,
        override: findSlotOverride(extras.slotOverrides, date, departureHm),
      });
      const cut = evaluateDepartureBookingWindow({
        bookingDate: date,
        startTimeHm: departureHm,
        cutoffHoursBeforeStart: effectiveCutoff,
        nowMs,
        timeZone: departureTimezone,
        lastMinuteEnabled: option.lastMinuteBookings === true,
        lastMinuteUntil: option.lastMinuteUntil,
        confirmedPaidOnDeparture: input.confirmedPaidOnDeparture === true,
      });
      if (!cut.ok) {
        // Phase 1531: cutoff/past-start are departure-time failures (sticky Pick time).
        return { ok: false, code: 'time', error: cut.error };
      }
    }

    if (optionUsesPrivateFlatPrice(option)) {
      if (!Number.isFinite(guests) || guests < 1 || guests > 99) {
        return { ok: false, code: 'party', error: 'Guest count must be between 1 and 99.' };
      }
      const bounds = getPartySizeBoundsForVariant(asTour, {
        id: option.id,
        label: option.name,
        subtitle: '',
        pricePerPerson: 0,
        listingOption: option,
      });
      const partyErr = guestCountValidationError(guests, bounds);
      if (partyErr) return { ok: false, code: 'party', error: partyErr };
      const flat = option.privateGroupPriceUsd ?? option.priceUsd;
      if (!(flat > 0)) {
        return { ok: false, code: 'price', error: 'This tour does not have a bookable price yet.' };
      }
      const applicable = discountsApplicableToOption(input.discounts as ListingDiscount[], option.id, date, today);
      const { price: discountedFlat, label } = bestUnitPrice(flat, applicable, currency);
      // Phase 584 (supabase/functions/_shared/booking-quote.ts) closed this exact
      // gap in the server-authoritative Deno copy: every sibling pricing branch
      // (age-dependent categories, the standard per-guest option, the no-option
      // fallback) re-checks the price for positivity AFTER discounts are applied,
      // but this client-side display mirror gained its own private flat-group
      // branch later without carrying that guard over -- a discount that brings
      // the flat price to zero (100%-off) or negative (a >100%-off misconfiguration;
      // listing_discounts.value has no upper bound at the schema level) returned
      // ok: true with a zero/negative totalAmount here, diverging from the
      // authoritative server quote and showing the traveler a broken price.
      if (!(discountedFlat > 0)) {
        return { ok: false, code: 'price', error: 'This tour does not have a bookable price yet.' };
      }
      return {
        ok: true,
        currency,
        unitPrice: money(discountedFlat / Math.max(1, guests)),
        originalUnitPrice: money(flat / Math.max(1, guests)),
        totalAmount: money(discountedFlat),
        guests,
        bookingDate: date,
        optionId: option.id,
        optionLabel: option.name.trim() || 'Private tour',
        discountLabel: label,
        originalTotalAmount: money(flat),
        lineItems: [{ label: 'Private group', quantity: 1, unitPrice: money(discountedFlat), amount: money(discountedFlat) }],
      };
    }

    if (optionUsesAgePricing(option)) {
      const mix = input.participantMix ?? {};
      const mixErr = validateParticipantMix(option, mix);
      if (mixErr) return { ok: false, code: 'party', error: mixErr };
      const lines = buildParticipantMixLines(option, mix);
      guests = totalGuestsFromMix(lines);
      if (!Number.isFinite(guests) || guests < 1 || guests > 99) {
        return { ok: false, code: 'party', error: 'Guest count must be between 1 and 99.' };
      }
      const applicable = discountsApplicableToOption(input.discounts as ListingDiscount[], option.id, date, today);
      const originalTotal = money(
        lines.filter((l) => l.quantity > 0).reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
      );
      const pricedLines = lines
        .filter((l) => l.quantity > 0)
        .map((l) => {
          const { price: unit } = bestUnitPrice(l.unitPrice, applicable, currency);
          return {
            ...l,
            unitPrice: unit,
          };
        });
      const lineItems = pricedLines.map((l) => ({
        label: l.label,
        quantity: l.quantity,
        unitPrice: money(l.unitPrice),
        amount: mixLineAmount(l),
      }));
      const totalAmount = mixSubtotal(pricedLines);
      if (!(totalAmount > 0) && !pricedLines.every((l) => l.unitPrice === 0)) {
        return { ok: false, code: 'price', error: 'This tour does not have a bookable price yet.' };
      }
      if (!(totalAmount > 0) && pricedLines.every((l) => l.unitPrice === 0)) {
        return { ok: false, code: 'price', error: 'This tour does not have a bookable price yet.' };
      }
      const headline = optionHeadlineUnitPrice(option) || pricedLines[0]?.unitPrice || 0;
      return {
        ok: true,
        currency,
        unitPrice: money(headline),
        originalUnitPrice: money(headline),
        totalAmount: money(totalAmount),
        guests,
        bookingDate: date,
        optionId: option.id,
        optionLabel: option.name.trim() || 'Tour option',
        discountLabel: applicable.length ? bestUnitPrice(headline, applicable, currency).label : undefined,
        originalTotalAmount: originalTotal,
        lineItems,
        guestBreakdown: guestBreakdownFromLines(pricedLines),
      };
    }

    if (!Number.isFinite(guests) || guests < 1 || guests > 99) {
      return { ok: false, code: 'party', error: 'Guest count must be between 1 and 99.' };
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
      return { ok: false, code: 'price', error: 'This tour does not have a bookable price yet.' };
    }
    const applicable = discountsApplicableToOption(input.discounts as ListingDiscount[], option.id, date, today);
    const { price: unitPrice, label } = bestUnitPrice(base, applicable, currency);
    if (!(unitPrice > 0)) {
      return { ok: false, code: 'price', error: 'This tour does not have a bookable price yet.' };
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
      originalTotalAmount: money(base * guests),
    };
  }

  if (!Number.isFinite(guests) || guests < 1 || guests > 99) {
    return { ok: false, code: 'party', error: 'Guest count must be between 1 and 99.' };
  }

  const bounds = getPartySizeBounds(asTour);
  const partyErr = guestCountValidationError(guests, bounds);
  if (partyErr) return { ok: false, code: 'party', error: partyErr };
  if (!(fallbackBase > 0)) {
    return { ok: false, code: 'price', error: 'This tour does not have a bookable price yet.' };
  }
  const { price: unitPrice, label } = bestUnitPrice(
    fallbackBase,
    listingWideDiscounts(input.discounts, date, today),
    currency
  );
  if (!(unitPrice > 0)) {
    return { ok: false, code: 'price', error: 'This tour does not have a bookable price yet.' };
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
    optionLabel: 'Standard tour',
    discountLabel: label,
    originalTotalAmount: money(fallbackBase * guests),
  };
}

export type StayQuoteOk = {
  ok: true;
  currency: string;
  nights: number;
  nightlyPrice: number;
  /** One price per occupied night. Absent on older callers; flat quotes repeat the base rate. */
  nightlyPrices?: number[];
  cleaningFee: number;
  totalAmount: number;
  extraGuestFee: number;
  extraGuestCount: number;
  discount: number;
  discountLabel: string | null;
  /** Offer row that produced a timed stay discount. Null when weekly/monthly or none applied. */
  appliedDiscountId?: string | null;
  extraLines: StayPricedExtra[];
  requests: StayPricedExtra[];
  offeredExtras: StayPaidExtra[];
  guests: number;
  /** Present when the traveler chose adults, children, and infants. */
  guestBreakdown?: StayGuestBreakdownRow[];
  checkIn: string;
  checkOut: string;
};

export type StayQuoteResult = StayQuoteOk | BookingQuoteErr;

function nightsBetween(checkIn: string, checkOut: string): number | null {
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut)) return null;
  const a = Date.parse(`${checkIn}T12:00:00Z`);
  const b = Date.parse(`${checkOut}T12:00:00Z`);
  const n = Math.round((b - a) / 86400000);
  return n >= 1 ? n : null;
}

/** Authoritative stay quote: nights × nightly + cleaning. Never trust a client total. */
export function quoteStayNights(input: {
  tour: QuoteTourSlice;
  checkIn: string;
  checkOut: string;
  guests: number;
  party?: StayGuestParty | null;
  selectedExtras?: StayExtraSelection[] | null;
  /** Timed listing Offers — applied to eligible nights; never stacked with weekly/monthly. */
  discounts?: ListingDiscount[];
  todayIso?: string;
  nowMs?: number;
}): StayQuoteResult {
  if (!isListingBookable(input.tour.status)) {
    return { ok: false, code: 'unpublished', error: 'This stay is not available to book.' };
  }
  const extras = parseListingExtras(input.tour.listingExtras);
  if (extras.inventoryFamily !== 'stay') {
    return { ok: false, code: 'inventory', error: 'This listing is not a stay.' };
  }
  const today =
    input.todayIso ?? experienceTodayIsoForListing(extras.departureTimezone, input.nowMs ?? Date.now());
  const stay = extras.stay;
  if (stay?.accommodationMode === 'multi') {
    return { ok: false, code: 'inventory', error: 'This property is not available to book yet.' };
  }
  const checkIn = (input.checkIn ?? '').trim();
  const checkOut = (input.checkOut ?? '').trim();
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut)) {
    return { ok: false, code: 'bad_date', error: 'Choose valid check-in and check-out dates.' };
  }
  if (checkIn < today) {
    return { ok: false, code: 'bad_date', error: 'Check-in must be today or later.' };
  }
  const nights = nightsBetween(checkIn, checkOut);
  if (nights == null) {
    return { ok: false, code: 'bad_date', error: 'Check-out must be after check-in.' };
  }
  if (nights > STAY_MAX_OCCUPIED_NIGHTS) {
    return {
      ok: false,
      code: 'bad_date',
      error: `This stay can be booked for up to ${STAY_MAX_OCCUPIED_NIGHTS} nights at a time.`,
    };
  }
  // Phase 1217: unknown maxGuests → fail closed (no invent-99; StayDetails 1216 parity).
  if (typeof stay?.maxGuests !== 'number' || !Number.isFinite(stay.maxGuests) || stay.maxGuests < 1) {
    return { ok: false, code: 'party', error: 'Guest capacity is unavailable for this stay.' };
  }
  const maxGuests = Math.floor(stay.maxGuests);
  let guests = Number(input.guests);
  let guestBreakdown: StayGuestBreakdownRow[] | undefined = undefined;
  if (input.party) {
    const checked = validateStayGuestParty(input.party, stay.guestPolicy, maxGuests);
    if (!checked.ok) return { ok: false, code: 'party', error: checked.error };
    guests = checked.counted;
    guestBreakdown = checked.breakdown;
  } else if (!Number.isFinite(guests) || guests < 1) {
    return { ok: false, code: 'party', error: 'Enter how many guests will stay.' };
  } else if (guests > maxGuests) {
    return { ok: false, code: 'party', error: `This stay allows up to ${maxGuests} guests.` };
  }
  const nightly =
    stay?.nightlyPriceUsd && stay.nightlyPriceUsd > 0
      ? stay.nightlyPriceUsd
      : Number(input.tour.price?.startingFrom ?? 0);
  if (!(nightly > 0)) {
    return { ok: false, code: 'price', error: 'This stay does not have a nightly price yet.' };
  }
  const lodging = quoteStayLodging({
    checkIn,
    nights,
    baseNightly: nightly,
    baseMinNights: stay?.minNights && stay.minNights >= 1 ? stay.minNights : 1,
    baseCleaningFee: stay?.cleaningFeeUsd ?? null,
    availabilityMode: stay?.availabilityMode,
    seasons: stay?.seasons,
  });
  if (!lodging.ok) return { ok: false, code: 'bad_date', error: lodging.error };
  if (nights < lodging.minNights) {
    return {
      ok: false,
      code: 'bad_date',
      error: `Minimum stay is ${lodging.minNights} night${lodging.minNights === 1 ? '' : 's'}.`,
    };
  }
  if (lodging.maxNights != null && nights > lodging.maxNights) {
    return {
      ok: false,
      code: 'bad_date',
      error: `This period can be booked for up to ${lodging.maxNights} night${lodging.maxNights === 1 ? '' : 's'}.`,
    };
  }
  if (lodging.minGuests != null && guests < lodging.minGuests) {
    return { ok: false, code: 'party', error: `This period requires at least ${lodging.minGuests} guests.` };
  }
  if (lodging.maxGuests != null && guests > lodging.maxGuests) {
    return { ok: false, code: 'party', error: `This period allows up to ${lodging.maxGuests} guests.` };
  }
  const cutoffMinutes = stay?.reservationCutoffMinutes;
  if (typeof cutoffMinutes === 'number' && cutoffMinutes >= 0) {
    const hm = lodging.checkIn || (stay?.checkInTime ?? '').trim().slice(0, 5);
    const arrivalMs = /^\d{2}:\d{2}$/.test(hm)
      ? wallTimeInZoneToUtcMs(checkIn, hm, resolveDepartureTimezone(extras.departureTimezone))
      : null;
    const closesAt = arrivalMs == null ? null : arrivalMs - cutoffMinutes * 60_000;
    if (closesAt != null && (input.nowMs ?? Date.now()) > closesAt) {
      return { ok: false, code: 'bad_date', error: 'Booking for this check-in has closed.' };
    }
  }
  const cleaning =
    lodging.cleaningFee != null
      ? lodging.cleaningFee
      : stay?.cleaningFeeUsd && stay.cleaningFeeUsd > 0
        ? stay.cleaningFeeUsd
        : 0;
  const currency = normalizeCurrency(input.tour.price?.currency ?? DEFAULT_CURRENCY);
  const addOns = priceStayAddOns({
    lodging: lodging.lodging,
    nights,
    countedGuests: guests,
    includedGuests: lodging.includedGuests,
    extraGuestNightly: lodging.extraGuestNightly,
    weeklyDiscountPercent: lodging.weeklyDiscountPercent,
    monthlyDiscountPercent: lodging.monthlyDiscountPercent,
    extras: lodging.extras,
    selected: input.selectedExtras,
  });
  if (!addOns.ok) return { ok: false, code: 'price', error: addOns.error };
  const resolved = resolveStayLodgingWithOffers({
    nightDates: stayNightDates(checkIn, nights),
    baseNightlyPrices: lodging.nightlyPrices,
    lengthOfStayDiscount: addOns.discount,
    lengthOfStayLabel: addOns.discountLabel,
    discounts: input.discounts ?? [],
  });
  const flat = resolved.nightlyPrices.every((price) => price === resolved.nightlyPrices[0]);
  const extraSum = addOns.extraLines.reduce((sum, line) => sum + line.amount, 0);
  const nightlyPrice = money(flat ? resolved.nightlyPrices[0] : nightly);
  return {
    ok: true,
    currency,
    nights,
    nightlyPrice,
    nightlyPrices: resolved.nightlyPrices,
    cleaningFee: money(cleaning),
    extraGuestFee: addOns.extraGuestFee,
    extraGuestCount: addOns.extraGuestCount,
    discount: resolved.discount,
    discountLabel: resolved.discountLabel,
    appliedDiscountId: resolved.appliedDiscountId,
    extraLines: addOns.extraLines,
    requests: addOns.requests,
    offeredExtras: addOns.offeredExtras,
    totalAmount: money(resolved.lodging + cleaning + addOns.extraGuestFee + extraSum - resolved.discount),
    guests,
    guestBreakdown,
    checkIn,
    checkOut,
  };
}

/** True when a client-sent amount does not match the authoritative quote (underpay / overpay). */
export function clientAmountConflictsWithQuote(clientTotal: number, quoteTotal: number): boolean {
  if (!Number.isFinite(clientTotal)) return false;
  return Math.abs(clientTotal - quoteTotal) > 0.009;
}

export function tourQuotePriceLines(quote: BookingQuoteOk): { label: string; amount: number }[] {
  if (quote.lineItems && quote.lineItems.length > 0) {
    return quote.lineItems.map((l) => ({
      label: `${l.label} × ${l.quantity}`,
      amount: l.amount,
    }));
  }
  const unit = quote.optionLabel?.trim() || 'Guest';
  return [{ label: `${unit} × ${quote.guests}`, amount: quote.totalAmount }];
}

export function stayQuotePriceLines(quote: StayQuoteOk): { label: string; amount: number }[] {
  return stayChargeLines({
    nights: quote.nights,
    nightlyPrice: quote.nightlyPrice,
    nightlyPrices: quote.nightlyPrices,
    cleaningFee: quote.cleaningFee,
    extraGuestCount: quote.extraGuestCount,
    extraGuestFee: quote.extraGuestFee,
    discount: quote.discount,
    discountLabel: quote.discountLabel,
    extraLines: quote.extraLines,
  });
}
