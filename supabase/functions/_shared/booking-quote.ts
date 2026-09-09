/**
 * Deno copy of src/lib/booking-quote.ts — keep algorithms in sync.
 * Stripe checkout MUST use this; never trust client totalAmount.
 */

import { bookingOccupiesInventory, type InventoryHoldRow } from './booking-hold.ts';

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

type Option = {
  id: string;
  name: string;
  priceUsd: number;
  minPersons: number;
  maxPersons: number;
  weekdays: boolean[];
  availabilityDateFrom: string;
  availabilityDateTo: string;
};

export type QuoteOk = {
  ok: true;
  currency: string;
  unitPrice: number;
  totalAmount: number;
  optionId: string | null;
  optionLabel: string;
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
  special_requests?: string | null;
}): { checkIn: string; checkOut: string } | null {
  const checkIn = (booking.booking_date ?? '').trim();
  if (!ISO_DATE.test(checkIn)) return null;
  const fromColumn = (booking.check_out ?? '').trim();
  const fromNotes = parseStayCheckOutFromNotes(booking.special_requests);
  const checkOut =
    fromColumn && fromColumn > checkIn
      ? fromColumn
      : fromNotes && fromNotes > checkIn
        ? fromNotes
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
  const maxGuests = typeof stay.maxGuests === 'number' && stay.maxGuests >= 1 ? Math.floor(stay.maxGuests) : 99;
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
  return (
    !o.name.trim() &&
    o.priceUsd <= 0 &&
    !o.availabilityDateFrom.trim() &&
    !o.availabilityDateTo.trim()
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
    const maxP =
      typeof o.maxPersons === 'number' && o.maxPersons >= minP ? Math.floor(o.maxPersons) : Math.max(minP, 12);
    const opt: Option = {
      id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `opt-${i}`,
      name: typeof o.name === 'string' ? o.name : '',
      priceUsd: typeof o.priceUsd === 'number' && !Number.isNaN(o.priceUsd) ? Math.max(0, o.priceUsd) : 0,
      minPersons: minP,
      maxPersons: maxP,
      weekdays: normalizeWeekdays(o.weekdays),
      availabilityDateFrom: typeof o.availabilityDateFrom === 'string' ? o.availabilityDateFrom : '',
      availabilityDateTo: typeof o.availabilityDateTo === 'string' ? o.availabilityDateTo : '',
    };
    if (!isEmptyOption(opt)) opts.push(opt);
  }
  return opts;
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

function optionRunsOnDate(option: Option, isoDate: string): string | null {
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

function parseGroupSize(groupSize: string | null): { min: number; max: number } {
  const m = (groupSize ?? '').match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return { min: 1, max: 12 };
  const min = Number.parseInt(m[1], 10);
  const max = Number.parseInt(m[2], 10);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min) return { min: 1, max: 12 };
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
}): QuoteOk | QuoteErr {
  const today = input.todayIso ?? new Date().toISOString().slice(0, 10);
  const date = (input.bookingDate ?? '').trim();
  const guests = Number(input.guests);
  const status = (input.listing.status ?? '').trim();
  if (status && status !== 'published') {
    return { ok: false, error: 'This listing is not available to book.' };
  }
  const extrasObj =
    input.listing.listing_extras && typeof input.listing.listing_extras === 'object'
      ? (input.listing.listing_extras as { inventoryFamily?: unknown; stay?: Record<string, unknown> })
      : null;
  const family = extrasObj?.inventoryFamily;
  if (family === 'experience' || family === 'package') {
    return { ok: false, error: 'This listing is not available to book yet.' };
  }
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
  if (!Number.isFinite(guests) || guests < 1 || guests > 99) {
    return { ok: false, error: 'Guest count must be between 1 and 99.' };
  }

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
    const dayErr = optionRunsOnDate(option, date);
    if (dayErr) return { ok: false, error: dayErr };
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
    };
  }

  const bounds = parseGroupSize(input.listing.group_size);
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
  };
}
