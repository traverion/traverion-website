/**
 * Deno copy of src/lib/booking-quote.ts — keep algorithms in sync.
 * Stripe checkout MUST use this; never trust client totalAmount.
 */

import { bookingOccupiesInventory, type InventoryHoldRow } from './booking-hold.ts';
import { ymdInTimeZone } from './booking-lifecycle-calendar.ts';
import {
  assertDepartureStillBookable,
  normalizeBookingCutoffHours,
  resolveDepartureTimezone,
  wallTimeInZoneToUtcMs,
} from './tour-departure-cutoff.ts';

/** Calendar “today” for quote past-date gates — listing departure TZ, not UTC. */
function experienceTodayIsoForListing(departureTimezone: unknown, nowMs: number = Date.now()): string {
  const tz = resolveDepartureTimezone(departureTimezone);
  return ymdInTimeZone(nowMs, tz) ?? new Date(nowMs).toISOString().slice(0, 10);
}

export type DiscountRow = {
  type: string;
  value: number;
  valid_from: string | null;
  valid_until: string | null;
  booking_option_id: string | null;
};

export type ListingQuoteRow = {
  status: string | null;
  price_starting_from: number | null;
  price_currency: string | null;
  listing_extras: unknown;
  group_size: string | null;
  title?: string | null;
};

type PriceCat = {
  id: string;
  label: string;
  kind: string;
  priceUsd: number;
  notPermitted: boolean;
  requiresAdult: boolean;
  countsTowardCapacity: boolean;
};

type Option = {
  id: string;
  name: string;
  priceUsd: number;
  minPersons: number;
  maxPersons: number;
  weekdays: boolean[];
  availabilityDateFrom: string;
  availabilityDateTo: string;
  pricingMode?: string;
  priceCategories?: PriceCat[];
  isPrivate?: boolean;
  privatePricing?: string;
  privateGroupPriceUsd?: number;
  pickupPlace?: string;
  startTime?: string;
  duration?: string;
  maxSpotsPerSlot?: number;
  schedules?: OptionSchedule[];
};

type OptionSchedule = {
  id: string;
  name: string;
  availabilityDateFrom: string;
  availabilityDateTo: string;
  weekdays: boolean[];
  startTime: string;
  pricingMode?: string;
  priceUsd: number;
  priceCategories?: PriceCat[];
  isPrivate?: boolean;
  privatePricing?: string;
  privateGroupPriceUsd?: number;
  minPersons: number;
  maxPersons: number;
  maxSpotsPerSlot: number;
  status?: string;
};

export type QuoteOk = {
  ok: true;
  currency: string;
  unitPrice: number;
  totalAmount: number;
  optionId: string | null;
  optionLabel: string;
  guests?: number;
  guestBreakdown?: { categoryId: string; label: string; kind: string; quantity: number; unitPrice: number }[];
  /** Stay quotes only. */
  nights?: number;
};

export type QuoteErr = { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function addCalendarDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function parseStayCheckOutFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  for (const raw of notes.split(/\n+/)) {
    const m = raw.trim().match(/^check_out:\s*(\d{4}-\d{2}-\d{2})/i);
    if (m?.[1] && ISO_DATE.test(m[1])) return m[1];
  }
  return null;
}

export function stayDateRangesOverlap(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  if (!ISO_DATE.test(aIn) || !ISO_DATE.test(aOut) || !ISO_DATE.test(bIn) || !ISO_DATE.test(bOut)) return false;
  return aIn < bOut && bIn < aOut;
}

export function stayRangeFromBooking(booking: {
  booking_date: string | null;
  check_out?: string | null;
  nights?: number | null;
  special_requests?: string | null;
}): { checkIn: string; checkOut: string } | null {
  const checkIn = (booking.booking_date ?? '').trim();
  if (!ISO_DATE.test(checkIn)) return null;
  const fromColumn = (booking.check_out ?? '').trim();
  const fromNotes = parseStayCheckOutFromNotes(booking.special_requests);
  const nights = Math.floor(Number(booking.nights ?? 0));
  const fromNights =
    Number.isFinite(nights) && nights >= 1 ? addCalendarDays(checkIn, nights) : null;
  const checkOut =
    fromColumn && fromColumn > checkIn
      ? fromColumn
      : fromNotes && fromNotes > checkIn
        ? fromNotes
        : fromNights && fromNights > checkIn
          ? fromNights
          : addCalendarDays(checkIn, 1);
  return { checkIn, checkOut };
}

/** Partner closed this night. Occupancy is paid + live holds, not listing_availability.booked. */
export function stayNightIsOperatorBlocked(capacity: number): boolean {
  return !Number.isFinite(capacity) || capacity <= 0;
}

export type StayCheckoutOccupancyRow = InventoryHoldRow & {
  id?: string | null;
  booking_date?: string | null;
  check_out?: string | null;
  nights?: number | null;
  special_requests?: string | null;
};

/**
 * Checkout stay overlap: paid + live holds only.
 * Refunded, cancelled, and failed bookings must not block a new checkout.
 */
export function stayCheckoutNightsAlreadyBooked(
  rows: StayCheckoutOccupancyRow[],
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string | null,
  nowMs: number = Date.now()
): boolean {
  for (const row of rows) {
    if (excludeBookingId && String(row.id ?? '') === excludeBookingId) continue;
    if (!bookingOccupiesInventory(row, nowMs)) continue;
    const range = stayRangeFromBooking({
      booking_date: typeof row.booking_date === 'string' ? row.booking_date : null,
      check_out: typeof row.check_out === 'string' ? row.check_out : null,
      nights: row.nights ?? null,
      special_requests: typeof row.special_requests === 'string' ? row.special_requests : null,
    });
    if (range && stayDateRangesOverlap(checkIn, checkOut, range.checkIn, range.checkOut)) return true;
  }
  return false;
}

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function nightsBetween(checkIn: string, checkOut: string): number | null {
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut)) return null;
  const a = Date.parse(`${checkIn}T12:00:00Z`);
  const b = Date.parse(`${checkOut}T12:00:00Z`);
  const n = Math.round((b - a) / 86400000);
  return n >= 1 ? n : null;
}

function quoteStayListing(input: {
  listing: ListingQuoteRow;
  checkIn: string;
  checkOut: string;
  guests: number;
  today: string;
}): QuoteOk | QuoteErr {
  const extras =
    input.listing.listing_extras && typeof input.listing.listing_extras === 'object'
      ? (input.listing.listing_extras as { stay?: Record<string, unknown> })
      : null;
  const stay = extras?.stay ?? {};
  if (!ISO_DATE.test(input.checkIn) || !ISO_DATE.test(input.checkOut)) {
    return { ok: false, error: 'Choose valid check-in and check-out dates.' };
  }
  if (input.checkIn < input.today) return { ok: false, error: 'Check-in must be today or later.' };
  const nights = nightsBetween(input.checkIn, input.checkOut);
  if (nights == null) return { ok: false, error: 'Check-out must be after check-in.' };
  const minNights = typeof stay.minNights === 'number' && stay.minNights >= 1 ? Math.floor(stay.minNights) : 1;
  if (nights < minNights) {
    return { ok: false, error: `Minimum stay is ${minNights} night${minNights === 1 ? '' : 's'}.` };
  }
  // Phase 1217: unknown maxGuests → fail closed (no invent-99; StayDetails 1216 parity).
  if (typeof stay.maxGuests !== 'number' || !Number.isFinite(stay.maxGuests) || stay.maxGuests < 1) {
    return { ok: false, error: 'Guest capacity is unavailable for this stay.' };
  }
  const maxGuests = Math.floor(stay.maxGuests);
  if (!Number.isFinite(input.guests) || input.guests < 1) {
    return { ok: false, error: 'Enter how many guests will stay.' };
  }
  if (input.guests > maxGuests) {
    return { ok: false, error: `This stay allows up to ${maxGuests} guests.` };
  }
  const nightly =
    typeof stay.nightlyPriceUsd === 'number' && stay.nightlyPriceUsd > 0
      ? stay.nightlyPriceUsd
      : Number(input.listing.price_starting_from ?? 0);
  if (!(nightly > 0)) return { ok: false, error: 'This stay does not have a nightly price yet.' };
  const cleaning = typeof stay.cleaningFeeUsd === 'number' && stay.cleaningFeeUsd > 0 ? stay.cleaningFeeUsd : 0;
  const currency = (input.listing.price_currency ?? 'EUR').trim().toUpperCase() || 'EUR';
  return {
    ok: true,
    currency,
    unitPrice: money(nightly),
    totalAmount: money(nights * nightly + cleaning),
    optionId: null,
    optionLabel: `${nights} night${nights === 1 ? '' : 's'}`,
    nights,
  };
}

function weekdayIndexMondayFirst(isoDate: string): number | null {
  if (!ISO_DATE.test(isoDate)) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  return (dt.getUTCDay() + 6) % 7;
}

function isEmptyOption(o: Option): boolean {
  const hasCats = (o.priceCategories ?? []).some((c) => c.label.trim() || c.priceUsd > 0);
  const hasSchedules = (o.schedules ?? []).length > 0;
  return (
    !o.name.trim() &&
    o.priceUsd <= 0 &&
    !hasCats &&
    !(o.pickupPlace ?? '').trim() &&
    !(o.startTime ?? '').trim() &&
    !o.availabilityDateFrom.trim() &&
    !o.availabilityDateTo.trim() &&
    !o.isPrivate &&
    !hasSchedules
  );
}

function normalizeWeekdays(raw: unknown): boolean[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [true, true, true, true, true, false, false];
  }
  const out = raw.slice(0, 7).map((x) => Boolean(x));
  while (out.length < 7) out.push(false);
  return out;
}

function parsePriceCategories(raw: unknown): PriceCat[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: PriceCat[] = [];
  for (let i = 0; i < raw.length; i++) {
    const x = raw[i];
    if (x == null || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    out.push({
      id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `cat-${i}`,
      label: typeof o.label === 'string' && o.label.trim() ? o.label.trim() : 'Participant',
      kind: typeof o.kind === 'string' ? o.kind : 'participant',
      priceUsd: typeof o.priceUsd === 'number' && !Number.isNaN(o.priceUsd) ? Math.max(0, o.priceUsd) : 0,
      notPermitted: Boolean(o.notPermitted),
      requiresAdult: Boolean(o.requiresAdult),
      countsTowardCapacity: o.countsTowardCapacity === false ? false : true,
    });
  }
  return out.length > 0 ? out : undefined;
}

function parseSchedule(raw: Record<string, unknown>, fallbackId: string): OptionSchedule {
  const minP = typeof raw.minPersons === 'number' && raw.minPersons >= 1 ? Math.floor(raw.minPersons) : 1;
  // Phase 1235: unset maxPersons → 0 (no invent as minPersons; client 1232 parity).
  const maxP =
    typeof raw.maxPersons === 'number' && raw.maxPersons >= minP ? Math.floor(raw.maxPersons) : 0;
  // Phase 1205: never invent slot cap from maxPersons (assert_checkout_inventory only reads maxSpotsPerSlot).
  const spots =
    typeof raw.maxSpotsPerSlot === 'number' && Number.isFinite(raw.maxSpotsPerSlot) && raw.maxSpotsPerSlot >= 1
      ? Math.floor(raw.maxSpotsPerSlot)
      : 0;
  const cats = parsePriceCategories(raw.priceCategories);
  let priceUsd = typeof raw.priceUsd === 'number' && !Number.isNaN(raw.priceUsd) ? Math.max(0, raw.priceUsd) : 0;
  if (raw.pricingMode === 'age_dependent' && cats?.length) {
    const usable = cats.filter((c) => !c.notPermitted);
    const adult = usable.find((c) => c.kind === 'adult' && c.priceUsd > 0);
    if (adult) priceUsd = adult.priceUsd;
    else {
      const priced = usable.filter((c) => c.priceUsd > 0).sort((a, b) => b.priceUsd - a.priceUsd);
      if (priced[0]) priceUsd = priced[0].priceUsd;
    }
  }
  if (raw.isPrivate && raw.privatePricing === 'flat_group') {
    const flat =
      typeof raw.privateGroupPriceUsd === 'number' && !Number.isNaN(raw.privateGroupPriceUsd)
        ? Math.max(0, raw.privateGroupPriceUsd)
        : 0;
    if (flat > 0) priceUsd = flat;
  }
  const out: OptionSchedule = {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : fallbackId,
    name: typeof raw.name === 'string' ? raw.name : '',
    availabilityDateFrom: typeof raw.availabilityDateFrom === 'string' ? raw.availabilityDateFrom : '',
    availabilityDateTo: typeof raw.availabilityDateTo === 'string' ? raw.availabilityDateTo : '',
    weekdays: normalizeWeekdays(raw.weekdays),
    startTime: typeof raw.startTime === 'string' ? raw.startTime : '',
    priceUsd,
    minPersons: minP,
    maxPersons: maxP,
    maxSpotsPerSlot: spots,
  };
  if (raw.pricingMode === 'age_dependent' || raw.pricingMode === 'uniform') out.pricingMode = String(raw.pricingMode);
  if (cats) out.priceCategories = cats;
  if (raw.isPrivate) {
    out.isPrivate = true;
    if (raw.privatePricing === 'flat_group' || raw.privatePricing === 'per_person') {
      out.privatePricing = String(raw.privatePricing);
    }
    if (typeof raw.privateGroupPriceUsd === 'number' && !Number.isNaN(raw.privateGroupPriceUsd)) {
      out.privateGroupPriceUsd = Math.max(0, raw.privateGroupPriceUsd);
    }
  }
  if (raw.status === 'ready' || raw.status === 'draft') out.status = String(raw.status);
  return out;
}

function scheduleIsBookable(s: OptionSchedule): boolean {
  if (s.status === 'draft') return false;
  if (!(s.priceUsd > 0) && !(s.privateGroupPriceUsd && s.privateGroupPriceUsd > 0)) {
    const catPriced = (s.priceCategories ?? []).some((c) => !c.notPermitted && c.priceUsd > 0);
    if (!catPriced) return false;
  }
  if (!s.weekdays.some(Boolean)) return false;
  const from = (s.availabilityDateFrom ?? '').trim();
  const to = (s.availabilityDateTo ?? '').trim();
  if (to && !from) return false;
  if (from && to && from > to) return false;
  if (!from || !s.startTime.trim()) return false;
  return s.minPersons >= 1 && s.maxPersons >= s.minPersons && s.maxSpotsPerSlot >= 1;
}

function scheduleAppliesOnDate(s: OptionSchedule, isoDate: string): boolean {
  const from = (s.availabilityDateFrom ?? '').trim();
  const to = (s.availabilityDateTo ?? '').trim();
  if (from && isoDate < from) return false;
  if (to && isoDate > to) return false;
  const idx = weekdayIndexMondayFirst(isoDate);
  if (idx == null) return false;
  if (s.weekdays.length >= 7 && !s.weekdays[idx]) return false;
  return true;
}

function resolveScheduleForDate(option: Option, isoDate: string, startTime?: string | null): OptionSchedule | null {
  const ready = (option.schedules ?? []).filter((s) => scheduleIsBookable(s) && scheduleAppliesOnDate(s, isoDate));
  const time = (startTime ?? '').trim();
  const pool = time ? ready.filter((s) => s.startTime.trim() === time) : ready;
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  const times = new Set(pool.map((s) => s.startTime.trim()));
  if (times.size === 1) return pool[0];
  return null;
}

function applyScheduleToOption(option: Option, schedule: OptionSchedule): Option {
  return {
    ...option,
    startTime: schedule.startTime,
    weekdays: [...schedule.weekdays],
    availabilityDateFrom: schedule.availabilityDateFrom,
    availabilityDateTo: schedule.availabilityDateTo,
    pricingMode: schedule.pricingMode,
    priceUsd: schedule.priceUsd,
    priceCategories: schedule.priceCategories,
    isPrivate: schedule.isPrivate,
    privatePricing: schedule.privatePricing,
    privateGroupPriceUsd: schedule.privateGroupPriceUsd,
    minPersons: schedule.minPersons,
    maxPersons: schedule.maxPersons,
    maxSpotsPerSlot: schedule.maxSpotsPerSlot,
  };
}

function parseOptions(extras: unknown): Option[] {
  if (extras == null || typeof extras !== 'object' || Array.isArray(extras)) return [];
  const raw = (extras as { bookingOptions?: unknown }).bookingOptions;
  if (!Array.isArray(raw)) return [];
  const opts: Option[] = [];
  for (let i = 0; i < raw.length; i++) {
    const x = raw[i];
    if (x == null || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const minP = typeof o.minPersons === 'number' && o.minPersons >= 1 ? Math.floor(o.minPersons) : 1;
    // Phase 1235: unset maxPersons → 0 (no invent as minPersons; client 1232 parity).
    const maxP =
      typeof o.maxPersons === 'number' && o.maxPersons >= minP ? Math.floor(o.maxPersons) : 0;
    const cats = parsePriceCategories(o.priceCategories);
    let priceUsd = typeof o.priceUsd === 'number' && !Number.isNaN(o.priceUsd) ? Math.max(0, o.priceUsd) : 0;
    if (o.pricingMode === 'age_dependent' && cats?.length) {
      const usable = cats.filter((c) => !c.notPermitted);
      const adult = usable.find((c) => c.kind === 'adult' && c.priceUsd > 0);
      if (adult) priceUsd = adult.priceUsd;
      else {
        const priced = usable.filter((c) => c.priceUsd > 0).sort((a, b) => b.priceUsd - a.priceUsd);
        if (priced[0]) priceUsd = priced[0].priceUsd;
      }
    }
    if (o.isPrivate && o.privatePricing === 'flat_group') {
      const flat =
        typeof o.privateGroupPriceUsd === 'number' && !Number.isNaN(o.privateGroupPriceUsd)
          ? Math.max(0, o.privateGroupPriceUsd)
          : 0;
      if (flat > 0) priceUsd = flat;
    }
    const opt: Option = {
      id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `opt-${i}`,
      name: typeof o.name === 'string' ? o.name : '',
      priceUsd,
      minPersons: minP,
      maxPersons: maxP,
      weekdays: normalizeWeekdays(o.weekdays),
      availabilityDateFrom: typeof o.availabilityDateFrom === 'string' ? o.availabilityDateFrom : '',
      availabilityDateTo: typeof o.availabilityDateTo === 'string' ? o.availabilityDateTo : '',
    };
    if (typeof o.pickupPlace === 'string' && o.pickupPlace.trim()) opt.pickupPlace = o.pickupPlace.trim();
    if (typeof o.startTime === 'string' && o.startTime.trim()) opt.startTime = o.startTime.trim();
    if (typeof o.duration === 'string' && o.duration.trim()) opt.duration = o.duration.trim();
    if (typeof o.maxSpotsPerSlot === 'number' && Number.isFinite(o.maxSpotsPerSlot) && o.maxSpotsPerSlot >= 1) {
      opt.maxSpotsPerSlot = Math.floor(o.maxSpotsPerSlot);
    }
    if (o.pricingMode === 'age_dependent' || o.pricingMode === 'uniform') opt.pricingMode = String(o.pricingMode);
    if (cats) opt.priceCategories = cats;
    if (o.isPrivate) {
      opt.isPrivate = true;
      if (o.privatePricing === 'flat_group' || o.privatePricing === 'per_person') {
        opt.privatePricing = String(o.privatePricing);
      }
      if (typeof o.privateGroupPriceUsd === 'number' && !Number.isNaN(o.privateGroupPriceUsd)) {
        opt.privateGroupPriceUsd = Math.max(0, o.privateGroupPriceUsd);
      }
    }
    if (Array.isArray(o.schedules) && o.schedules.length > 0) {
      opt.schedules = o.schedules
        .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
        .map((x, si) => parseSchedule(x, `${opt.id}-sch-${si}`))
        .slice(0, 24);
    }
    if (!isEmptyOption(opt)) opts.push(opt);
  }
  return coalesceLegacyParticipantTicketOptions(opts);
}

/**
 * Remaining seats for a departure: slot occupancy always, and when a day override
 * exists also the shared day-wide budget (Phase 1113).
 */
export function tourDepartureRemainingSeats(params: {
  slotMaxSpots: number;
  paidGuestsSlot: number;
  dayCapacityOverride?: number | null;
  paidGuestsDay?: number;
}): number {
  const slotCap = Math.max(0, Math.floor(params.slotMaxSpots));
  const slotPaid = Math.max(0, Math.floor(params.paidGuestsSlot));
  const slotLeft = Math.max(0, slotCap - slotPaid);
  const dayCap =
    params.dayCapacityOverride != null && Number.isFinite(params.dayCapacityOverride)
      ? Math.max(0, Math.floor(params.dayCapacityOverride))
      : null;
  if (dayCap == null) return slotLeft;
  const dayPaid = Math.max(0, Math.floor(params.paidGuestsDay ?? 0));
  const dayLeft = Math.max(0, dayCap - dayPaid);
  return Math.min(slotLeft, dayLeft);
}

/**
 * Spots for the traveler's chosen departure (option + date + optional start time).
 * Null when options are missing or the slot cannot be resolved — caller may fall back.
 */
export function tourDepartureSlotCapacity(input: {
  listing_extras: unknown;
  bookingDate: string;
  bookingOptionId?: string | null;
  startTime?: string | null;
}): number | null {
  const opts = parseOptions(input.listing_extras);
  if (opts.length === 0) return null;
  const requestedId = (input.bookingOptionId ?? '').trim();
  let option: Option | undefined;
  if (requestedId) {
    option = opts.find((o) => o.id === requestedId);
    if (!option) return null;
  } else if (opts.length === 1) {
    option = opts[0];
  } else {
    return null;
  }
  const date = (input.bookingDate ?? '').trim();
  if (option.schedules && option.schedules.length > 0) {
    const resolved = resolveScheduleForDate(option, date, input.startTime);
    if (!resolved) return null;
    return Math.min(99, Math.max(1, resolved.maxSpotsPerSlot));
  }
  const spots = option.maxSpotsPerSlot;
  if (typeof spots === 'number' && Number.isFinite(spots) && spots >= 1) {
    return Math.min(99, Math.floor(spots));
  }
  // Phase 1205: unknown legacy slot cap → null (no invent from maxPersons).
  return null;
}

function legacyParticipantKind(name: string): 'adult' | 'reduced' | 'other' {
  const n = (name ?? '').trim();
  if (!n) return 'other';
  if (/\b(adults?|grown[-\s]?ups?)\b/i.test(n) && !/\b(child|children|kids?|infants?)\b/i.test(n)) {
    return 'adult';
  }
  if (/\b(child|children|kids?|infants?|toddlers?|youth|teen(?:ager)?s?|students?|seniors?)\b/i.test(n)) {
    return 'reduced';
  }
  return 'other';
}

function deriveCoalescedName(anchor: Option): string {
  const pickup = (anchor.pickupPlace ?? '').trim();
  if (/hotel\s*pick[\s-]?up/i.test(pickup) || /hotel\s*pick[\s-]?up/i.test(anchor.name)) {
    return 'Hotel pickup';
  }
  if (pickup.length >= 3 && pickup.length <= 56) return pickup;
  if ((anchor.startTime ?? '').trim()) return `Departure ${anchor.startTime!.trim()}`;
  if ((anchor.duration ?? '').trim()) return `${anchor.duration!.trim()} tour`;
  return 'Standard tour';
}

/** Adult/Child as separate options → one age_dependent option (mirrors src/lib/legacy-participant-options.ts). */
function coalesceLegacyParticipantTicketOptions(opts: Option[]): Option[] {
  if (opts.length < 2) return opts;
  if (opts.some((o) => o.pricingMode === 'age_dependent' && (o.priceCategories?.length ?? 0) > 0)) {
    return opts;
  }
  const kinds = opts.map((o) => legacyParticipantKind(o.name));
  if (kinds.some((k) => k === 'other')) return opts;
  if (!kinds.includes('adult') || !kinds.includes('reduced')) return opts;

  const adults = opts.filter((o) => legacyParticipantKind(o.name) === 'adult');
  const reduced = opts.filter((o) => legacyParticipantKind(o.name) === 'reduced');
  const anchor = adults.reduce((a, b) => (a.priceUsd >= b.priceUsd ? a : b), adults[0]);
  const ordered = [...adults, ...reduced].sort((a, b) => b.priceUsd - a.priceUsd);
  const priceCategories: PriceCat[] = ordered.map((o) => {
    const pk = legacyParticipantKind(o.name);
    const infant = /\binfants?\b|\btoddlers?\b/i.test(o.name);
    const youth = /\byouth\b|\bteen/i.test(o.name);
    const senior = /\bseniors?\b/i.test(o.name);
    let kind = 'child';
    if (pk === 'adult') kind = 'adult';
    else if (infant) kind = 'infant';
    else if (youth) kind = 'youth';
    else if (senior) kind = 'senior';
    return {
      id: o.id,
      label: o.name.trim() || 'Participant',
      kind,
      priceUsd: o.priceUsd,
      notPermitted: false,
      requiresAdult: kind !== 'adult' && kind !== 'senior',
      countsTowardCapacity: true,
    };
  });

  const minPersons = Math.min(...opts.map((o) => Math.max(1, o.minPersons || 1)));
  // Phase 1235: do not invent maxPersons as minPersons when legacy tickets omit a cap.
  const maxPersons =
    typeof anchor.maxPersons === 'number' && Number.isFinite(anchor.maxPersons) && anchor.maxPersons >= 1
      ? Math.floor(anchor.maxPersons)
      : 0;
  // Phase 1211: parity with client 1208 — do not invent capacity 8 on edge coalesce.
  const spotsRaw = anchor.maxSpotsPerSlot;
  const maxSpotsPerSlot =
    typeof spotsRaw === 'number' && Number.isFinite(spotsRaw) && spotsRaw >= 1
      ? Math.floor(spotsRaw)
      : undefined;
  return [
    {
      ...anchor,
      name: deriveCoalescedName(anchor),
      priceUsd: anchor.priceUsd,
      minPersons,
      maxPersons,
      ...(maxSpotsPerSlot != null ? { maxSpotsPerSlot } : { maxSpotsPerSlot: undefined }),
      pricingMode: 'age_dependent',
      priceCategories,
    },
  ];
}

function discountActive(d: DiscountRow, day: string): boolean {
  if (d.valid_from && day < d.valid_from) return false;
  if (d.valid_until && day > d.valid_until) return false;
  return true;
}

function applyDiscount(price: number, d: DiscountRow): number {
  if (d.type === 'percent') return money(price * (1 - Number(d.value) / 100));
  return money(Math.max(0, price - Number(d.value)));
}

function bestPrice(base: number, discounts: DiscountRow[]): number {
  if (discounts.length === 0 || base <= 0) return money(base);
  let min = base;
  for (const d of discounts) {
    const p = applyDiscount(base, d);
    if (p < min) min = p;
  }
  return money(min);
}

function applicable(discounts: DiscountRow[], optionId: string | null, day: string): DiscountRow[] {
  return discounts.filter((d) => {
    if (!discountActive(d, day)) return false;
    const scope = (d.booking_option_id ?? '').trim();
    if (!scope) return true;
    return optionId != null && scope === optionId;
  });
}

function optionRunsOnDate(option: Option, isoDate: string, startTime?: string | null): string | null {
  if (option.schedules && option.schedules.length > 0) {
    const ready = option.schedules.filter((s) => scheduleIsBookable(s) && scheduleAppliesOnDate(s, isoDate));
    if (ready.length === 0) return 'This option is not available on that date.';
    const time = (startTime ?? '').trim();
    if (time && !ready.some((s) => s.startTime.trim() === time)) {
      return 'This option is not offered at that time on that date.';
    }
    return null;
  }
  const idx = weekdayIndexMondayFirst(isoDate);
  if (idx == null) return 'Choose a valid date.';
  if (option.weekdays.length >= 7 && !option.weekdays[idx]) {
    return 'This option is not offered on that day of the week. Pick another date.';
  }
  const from = option.availabilityDateFrom.trim();
  const to = option.availabilityDateTo.trim();
  if (from && isoDate < from) return 'This option is not available yet on that date.';
  if (to && isoDate > to) return 'This option is no longer available on that date.';
  return null;
}

/** Phase 1228: null when group_size cannot be parsed — no invent 1–12. */
function parseGroupSize(groupSize: string | null): { min: number; max: number } | null {
  const m = (groupSize ?? '').match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return null;
  const min = Number.parseInt(m[1], 10);
  const max = Number.parseInt(m[2], 10);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min) return null;
  return { min: Math.max(1, min), max: Math.min(99, max) };
}

export function quoteListingBooking(input: {
  listing: ListingQuoteRow;
  discounts: DiscountRow[];
  bookingDate: string;
  guests: number;
  bookingOptionId?: string | null;
  todayIso?: string;
  checkoutDate?: string | null;
  participantMix?: Record<string, number> | null;
  startTime?: string | null;
  nowMs?: number;
}): QuoteOk | QuoteErr {
  const date = (input.bookingDate ?? '').trim();
  let guests = Number(input.guests);
  const status = (input.listing.status ?? '').trim();
  // Phase 583: a falsy status (null/undefined/'') must never be treated
  // as bookable -- see src/lib/booking-quote.ts's isListingBookable for
  // the full explanation (migration-082 verification bypass).
  if (status !== 'published') {
    return { ok: false, error: 'This listing is not available to book.' };
  }
  const extrasObj =
    input.listing.listing_extras && typeof input.listing.listing_extras === 'object'
      ? (input.listing.listing_extras as {
          inventoryFamily?: unknown;
          stay?: Record<string, unknown>;
          bookingCutoffHoursBeforeStart?: unknown;
          departureTimezone?: unknown;
        })
      : null;
  const family = extrasObj?.inventoryFamily;
  if (family === 'experience' || family === 'package') {
    return { ok: false, error: 'This listing is not available to book yet.' };
  }
  const departureTimezone = resolveDepartureTimezone(extrasObj?.departureTimezone);
  const nowMs =
    input.nowMs ??
    (input.todayIso ? wallTimeInZoneToUtcMs(input.todayIso, '12:00') ?? Date.now() : Date.now());
  const today = input.todayIso ?? experienceTodayIsoForListing(departureTimezone, nowMs);
  if (family === 'stay') {
    return quoteStayListing({
      listing: input.listing,
      checkIn: date,
      checkOut: (input.checkoutDate ?? '').trim(),
      guests,
      today,
    });
  }
  if (!ISO_DATE.test(date)) return { ok: false, error: 'Choose a valid date.' };
  if (date < today) return { ok: false, error: 'Choose a date that is today or later.' };

  const cutoffHours = normalizeBookingCutoffHours(extrasObj?.bookingCutoffHoursBeforeStart);
  const opts = parseOptions(input.listing.listing_extras);
  const fallbackBase = Number(input.listing.price_starting_from ?? 0);
  const currency = (input.listing.price_currency ?? 'EUR').trim().toUpperCase() || 'EUR';
  const requestedId = (input.bookingOptionId ?? '').trim();

  if (opts.length > 0) {
    let option: Option | undefined;
    if (requestedId) {
      option = opts.find((o) => o.id === requestedId);
      if (!option) return { ok: false, error: 'That booking option is not available.' };
    } else if (opts.length === 1) {
      option = opts[0];
    } else {
      return { ok: false, error: 'Choose a booking option to continue.' };
    }
    const dayErr = optionRunsOnDate(option, date, input.startTime);
    if (dayErr) return { ok: false, error: dayErr };

    if (option.schedules && option.schedules.length > 0) {
      const resolved = resolveScheduleForDate(option, date, input.startTime);
      if (!resolved) return { ok: false, error: 'Choose a departure time to continue.' };
      option = applyScheduleToOption(option, resolved);
    }

    // Phase 1235: missing/invalid option maxPersons → fail closed (assert 1233 parity).
    if (
      !Number.isFinite(option.maxPersons) ||
      option.maxPersons < 1 ||
      option.maxPersons < option.minPersons
    ) {
      return { ok: false, error: 'Guest capacity is unavailable for this tour.' };
    }

    const departureHm = (input.startTime ?? option.startTime ?? '').trim().slice(0, 5);
    if (departureHm) {
      const cut = assertDepartureStillBookable({
        bookingDate: date,
        startTimeHm: departureHm,
        cutoffHoursBeforeStart: cutoffHours,
        nowMs,
        timeZone: departureTimezone,
      });
      if (!cut.ok) return { ok: false, error: cut.error };
    }

    if (option.isPrivate && option.privatePricing === 'flat_group') {
      if (!Number.isFinite(guests) || guests < 1 || guests > 99) {
        return { ok: false, error: 'Guest count must be between 1 and 99.' };
      }
      if (guests < option.minPersons) {
        return { ok: false, error: `At least ${option.minPersons} guests are required for this tour.` };
      }
      if (guests > option.maxPersons) {
        return { ok: false, error: `No more than ${option.maxPersons} guests allowed for this tour.` };
      }
      const flat = option.privateGroupPriceUsd ?? option.priceUsd;
      if (!(flat > 0)) return { ok: false, error: 'This tour does not have a bookable price yet.' };
      const unit = bestPrice(flat, applicable(input.discounts, option.id, date));
      // Phase 584: every sibling pricing branch (age-dependent categories,
      // the standard per-guest option, and the no-option fallback)
      // re-checks the price for positivity AFTER discounts are applied --
      // this branch only checked the pre-discount `flat` price above and
      // returned ok:true unconditionally afterward, so a discount that
      // brings the flat group price to zero (e.g. a 100%-off promo) or
      // below (e.g. a misconfigured >100%-off value -- listing_discounts.value
      // has no upper bound at the schema level) silently produced ok:true
      // with a zero/negative totalAmount instead of the same clear
      // rejection every other branch gives.
      if (!(unit > 0)) return { ok: false, error: 'This tour does not have a bookable price yet.' };
      return {
        ok: true,
        currency,
        unitPrice: money(unit / Math.max(1, guests)),
        totalAmount: money(unit),
        optionId: option.id,
        optionLabel: option.name.trim() || 'Private tour',
        guests,
      };
    }

    if (option.pricingMode === 'age_dependent' && (option.priceCategories?.length ?? 0) > 0) {
      const mix = input.participantMix ?? {};
      const cats = (option.priceCategories ?? []).filter((c) => !c.notPermitted);
      const lines = cats.map((c) => ({
        categoryId: c.id,
        label: c.label,
        kind: c.kind,
        quantity: Math.max(0, Math.floor(Number(mix[c.id] ?? 0) || 0)),
        unitPrice: c.priceUsd,
        requiresAdult: c.requiresAdult,
        countsTowardCapacity: c.countsTowardCapacity,
      }));
      const headcount = lines.reduce((s, l) => s + l.quantity, 0);
      const capacityGuests = lines.reduce((s, l) => s + (l.countsTowardCapacity ? l.quantity : 0), 0);
      if (headcount < 1) return { ok: false, error: 'Add at least one participant.' };
      if (capacityGuests < option.minPersons) {
        return { ok: false, error: `At least ${option.minPersons} guests are required for this tour.` };
      }
      if (capacityGuests > option.maxPersons) {
        return { ok: false, error: `No more than ${option.maxPersons} guests allowed for this tour.` };
      }
      const adults = lines
        .filter((l) => l.kind === 'adult' || l.kind === 'senior')
        .reduce((s, l) => s + l.quantity, 0);
      for (const line of lines) {
        if (line.quantity > 0 && line.requiresAdult && adults < 1) {
          return { ok: false, error: `${line.label} must be accompanied by an adult.` };
        }
      }
      guests = capacityGuests;
      const disc = applicable(input.discounts, option.id, date);
      let total = 0;
      const breakdown: { categoryId: string; label: string; kind: string; quantity: number; unitPrice: number }[] = [];
      for (const line of lines) {
        if (line.quantity <= 0) continue;
        const unit = bestPrice(line.unitPrice, disc);
        total += unit * line.quantity;
        breakdown.push({
          categoryId: line.categoryId,
          label: line.label,
          kind: line.kind,
          quantity: line.quantity,
          unitPrice: unit,
        });
      }
      total = money(total);
      if (!(total > 0)) return { ok: false, error: 'This tour does not have a bookable price yet.' };
      return {
        ok: true,
        currency,
        unitPrice: money(option.priceUsd > 0 ? option.priceUsd : breakdown[0]?.unitPrice ?? 0),
        totalAmount: total,
        optionId: option.id,
        optionLabel: option.name.trim() || 'Tour option',
        guests,
        guestBreakdown: breakdown,
      };
    }

    if (!Number.isFinite(guests) || guests < 1 || guests > 99) {
      return { ok: false, error: 'Guest count must be between 1 and 99.' };
    }
    if (guests < option.minPersons) {
      return { ok: false, error: `At least ${option.minPersons} guests are required for this tour.` };
    }
    if (guests > option.maxPersons) {
      return { ok: false, error: `No more than ${option.maxPersons} guests allowed for this tour.` };
    }
    const base = option.priceUsd > 0 ? option.priceUsd : fallbackBase;
    if (!(base > 0)) return { ok: false, error: 'This tour does not have a bookable price yet.' };
    const unit = bestPrice(base, applicable(input.discounts, option.id, date));
    if (!(unit > 0)) return { ok: false, error: 'This tour does not have a bookable price yet.' };
    return {
      ok: true,
      currency,
      unitPrice: unit,
      totalAmount: money(unit * guests),
      optionId: option.id,
      optionLabel: option.name.trim() || 'Tour option',
      guests,
    };
  }

  if (!Number.isFinite(guests) || guests < 1 || guests > 99) {
    return { ok: false, error: 'Guest count must be between 1 and 99.' };
  }
  const bounds = parseGroupSize(input.listing.group_size);
  if (!bounds) {
    return { ok: false, error: 'Guest capacity is unavailable for this tour.' };
  }
  if (guests < bounds.min) {
    return { ok: false, error: `At least ${bounds.min} guests are required for this tour.` };
  }
  if (guests > bounds.max) {
    return { ok: false, error: `No more than ${bounds.max} guests allowed for this tour.` };
  }
  if (!(fallbackBase > 0)) return { ok: false, error: 'This tour does not have a bookable price yet.' };
  const unit = bestPrice(fallbackBase, applicable(input.discounts, null, date));
  if (!(unit > 0)) return { ok: false, error: 'This tour does not have a bookable price yet.' };
  return {
    ok: true,
    currency,
    unitPrice: unit,
    totalAmount: money(unit * guests),
    optionId: null,
    optionLabel: 'Standard tour',
    guests,
  };
}
