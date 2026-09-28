/** Mirrors src/lib/purchase-snapshot.ts for Deno edge checkout. */

/** Mirror of TRAVERION_STANDARD_CANCELLATION_POLICY (src/types/listingExtras.ts). */
export const TRAVERION_STANDARD_CANCELLATION_POLICY =
  'You may cancel free of charge up to 24 hours before the scheduled start time. After that, guest-initiated cancellations are not available. If the operator cancels or needs to reschedule (for example due to weather or safety), that is handled from your booking details.';

/** Freeze what travelers saw at checkout when the listing column is blank. */
export function resolveCancellationPolicyForSnapshot(
  listingCancellationPolicy?: string | null
): string {
  const raw = (listingCancellationPolicy ?? '').trim();
  return raw || TRAVERION_STANDARD_CANCELLATION_POLICY;
}

export type PurchaseFulfillment = 'pickup' | 'meeting_point';

export type PurchaseSnapshot = {
  listingTitle: string;
  optionLabel: string | null;
  meetingPoint: string | null;
  pickupInstructions: string | null;
  startTimeHm: string | null;
  capturedAt: string;
  duration?: string | null;
  fulfillment?: PurchaseFulfillment | null;
  cancellationPolicy?: string | null;
  optionId?: string | null;
  scheduleId?: string | null;
  currency?: string | null;
  totalAmount?: number | null;
  checkIn?: string | null;
  checkOut?: string | null;
  nights?: number | null;
  propertyType?: string | null;
  checkInAddress?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  houseRules?: string | null;
  includes?: string[] | null;
  excludes?: string[] | null;
  departureTimezone?: string | null;
  termsAcceptedAt?: string | null;
};

const ISO_CHECKOUT = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Phase 1570 / mig 209 parity: shallow-merge incoming over existing, then
 * checkOut = max(valid existing, valid incoming). Never let Pay-now clobber a longer stay.
 */
export function mergePurchaseSnapshotMaxCheckOut(
  existing: unknown,
  incoming: PurchaseSnapshot
): PurchaseSnapshot {
  const base =
    existing && typeof existing === 'object' ? { ...(existing as Record<string, unknown>) } : {};
  const merged = { ...base, ...incoming } as PurchaseSnapshot;
  const existingOut =
    typeof (existing as { checkOut?: unknown } | null)?.checkOut === 'string'
      ? String((existing as { checkOut: string }).checkOut).trim()
      : '';
  const incomingOut = typeof incoming.checkOut === 'string' ? incoming.checkOut.trim() : '';
  const existingOk = ISO_CHECKOUT.test(existingOut) ? existingOut : null;
  const incomingOk = ISO_CHECKOUT.test(incomingOut) ? incomingOut : null;
  if (existingOk && incomingOk) {
    merged.checkOut = existingOk > incomingOk ? existingOk : incomingOk;
  } else if (existingOk) {
    merged.checkOut = existingOk;
  } else if (incomingOk) {
    merged.checkOut = incomingOk;
  }
  return merged;
}

/** Cap inclusion/exclusion lists frozen at purchase. */
export function normalizePurchaseStringList(
  raw: unknown,
  maxItems = 40,
  maxLen = 200
): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const t = item.trim().slice(0, maxLen);
    if (!t) continue;
    out.push(t);
    if (out.length >= maxItems) break;
  }
  return out.length ? out : null;
}

export function buildPurchaseSnapshot(input: {
  listingTitle: string;
  optionLabel?: string | null;
  meetingPoint?: string | null;
  pickupInstructions?: string | null;
  startTimeHm?: string | null;
  duration?: string | null;
  fulfillment?: PurchaseFulfillment | null;
  cancellationPolicy?: string | null;
  optionId?: string | null;
  scheduleId?: string | null;
  currency?: string | null;
  totalAmount?: number | null;
  checkIn?: string | null;
  checkOut?: string | null;
  nights?: number | null;
  propertyType?: string | null;
  checkInAddress?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  houseRules?: string | null;
  includes?: string[] | null;
  excludes?: string[] | null;
  departureTimezone?: string | null;
  termsAcceptedAt?: string | null;
  capturedAt?: string;
}): PurchaseSnapshot {
  const title = input.listingTitle.trim() || 'Experience';
  const option = (input.optionLabel ?? '').trim() || null;
  const meeting = (input.meetingPoint ?? '').trim() || null;
  const pickup = (input.pickupInstructions ?? '').trim() || null;
  const start = (input.startTimeHm ?? '').trim() || null;
  const duration = (input.duration ?? '').trim() || null;
  const fulfillment =
    input.fulfillment === 'pickup' || input.fulfillment === 'meeting_point' ? input.fulfillment : null;
  const cancellation = (input.cancellationPolicy ?? '').trim() || null;
  const optionId = (input.optionId ?? '').trim() || null;
  const scheduleId = (input.scheduleId ?? '').trim() || null;
  const currency = (input.currency ?? '').trim().toUpperCase() || null;
  const total =
    typeof input.totalAmount === 'number' && Number.isFinite(input.totalAmount) && input.totalAmount >= 0
      ? Math.round(input.totalAmount * 100) / 100
      : null;
  const checkIn = (input.checkIn ?? '').trim() || null;
  const checkOut = (input.checkOut ?? '').trim() || null;
  const nights =
    typeof input.nights === 'number' && Number.isFinite(input.nights) && input.nights >= 1
      ? Math.floor(input.nights)
      : null;
  const propertyType = (input.propertyType ?? '').trim() || null;
  const checkInAddress = (input.checkInAddress ?? '').trim() || null;
  const checkInTime = (input.checkInTime ?? '').trim().slice(0, 5) || null;
  const checkOutTime = (input.checkOutTime ?? '').trim().slice(0, 5) || null;
  const houseRules = (input.houseRules ?? '').trim().slice(0, 2000) || null;
  const includes = normalizePurchaseStringList(input.includes);
  const excludes = normalizePurchaseStringList(input.excludes);
  const departureTimezone = (input.departureTimezone ?? '').trim() || null;
  const termsAcceptedAt = (input.termsAcceptedAt ?? '').trim() || null;
  const snap: PurchaseSnapshot = {
    listingTitle: title,
    optionLabel: option,
    meetingPoint: meeting,
    pickupInstructions: pickup,
    startTimeHm: start,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  };
  if (duration) snap.duration = duration;
  if (fulfillment) snap.fulfillment = fulfillment;
  if (cancellation) snap.cancellationPolicy = cancellation;
  if (optionId) snap.optionId = optionId;
  if (scheduleId) snap.scheduleId = scheduleId;
  if (currency) snap.currency = currency;
  if (total != null) snap.totalAmount = total;
  if (checkIn) snap.checkIn = checkIn;
  if (checkOut) snap.checkOut = checkOut;
  if (nights != null) snap.nights = nights;
  if (propertyType) snap.propertyType = propertyType;
  if (checkInAddress) snap.checkInAddress = checkInAddress;
  if (checkInTime) snap.checkInTime = checkInTime;
  if (checkOutTime) snap.checkOutTime = checkOutTime;
  if (houseRules) snap.houseRules = houseRules;
  if (includes) snap.includes = includes;
  if (excludes) snap.excludes = excludes;
  if (departureTimezone) snap.departureTimezone = departureTimezone;
  if (termsAcceptedAt) snap.termsAcceptedAt = termsAcceptedAt;
  return snap;
}

/** Prefer option pickup place, then listing meeting point. */
export function resolveMeetingPointForSnapshot(input: {
  optionPickupPlace?: string | null;
  listingMeetingPoint?: string | null;
}): string | null {
  const fromOption = (input.optionPickupPlace ?? '').trim();
  if (fromOption) return fromOption;
  const fromListing = (input.listingMeetingPoint ?? '').trim();
  return fromListing || null;
}

/**
 * Prefer option traveler start instructions, then legacy optionInfo,
 * then listing pickup_instructions denormalization.
 */
export function resolvePickupInstructionsForSnapshot(input: {
  travelerStartInstructions?: string | null;
  optionInfo?: string | null;
  listingPickupInstructions?: string | null;
}): string | null {
  const dedicated = (input.travelerStartInstructions ?? '').trim();
  if (dedicated) return dedicated;
  const fromOption = (input.optionInfo ?? '').trim();
  if (fromOption) return fromOption;
  const fromListing = (input.listingPickupInstructions ?? '').trim();
  return fromListing || null;
}

type RawOption = {
  id?: unknown;
  pickupPlace?: unknown;
  optionInfo?: unknown;
  travelerStartInstructions?: unknown;
  duration?: unknown;
  fulfillment?: unknown;
  schedules?: unknown;
};

type RawSchedule = {
  id?: unknown;
  startTime?: unknown;
  status?: unknown;
  availabilityDateFrom?: unknown;
  availabilityDateTo?: unknown;
  weekdays?: unknown;
};

/** Monday-first weekday index for YYYY-MM-DD (assert / quote parity). */
function weekdayIndexMondayFirst(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  return (dt.getUTCDay() + 6) % 7;
}

/** Extract bookable option fields for the purchase freeze. */
export function resolveOptionFieldsForSnapshot(input: {
  listingExtras: unknown;
  optionId?: string | null;
  bookingDate?: string | null;
  startTimeHm?: string | null;
}): {
  pickupPlace: string | null;
  optionInfo: string | null;
  travelerStartInstructions: string | null;
  duration: string | null;
  fulfillment: PurchaseFulfillment | null;
  scheduleId: string | null;
} {
  const empty = {
    pickupPlace: null as string | null,
    optionInfo: null as string | null,
    travelerStartInstructions: null as string | null,
    duration: null as string | null,
    fulfillment: null as PurchaseFulfillment | null,
    scheduleId: null as string | null,
  };
  const extras = input.listingExtras;
  if (!extras || typeof extras !== 'object') return empty;
  const opts = (extras as { bookingOptions?: unknown }).bookingOptions;
  if (!Array.isArray(opts) || opts.length === 0) return empty;
  const want = (input.optionId ?? '').trim();
  let matched: RawOption | null = null;
  for (const raw of opts) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as RawOption;
    const id = String(o.id ?? '').trim();
    if (want) {
      if (id === want) {
        matched = o;
        break;
      }
      continue;
    }
    if (opts.length === 1) {
      matched = o;
      break;
    }
  }
  if (!matched) return empty;
  const place = typeof matched.pickupPlace === 'string' ? matched.pickupPlace.trim() : '';
  const info = typeof matched.optionInfo === 'string' ? matched.optionInfo.trim() : '';
  const startIx =
    typeof matched.travelerStartInstructions === 'string'
      ? matched.travelerStartInstructions.trim()
      : '';
  const duration = typeof matched.duration === 'string' ? matched.duration.trim() : '';
  const fulfillment =
    matched.fulfillment === 'pickup' || matched.fulfillment === 'meeting_point'
      ? matched.fulfillment
      : null;
  let scheduleId: string | null = null;
  const date = (input.bookingDate ?? '').trim();
  const time = (input.startTimeHm ?? '').trim().slice(0, 5);
  if (date && Array.isArray(matched.schedules)) {
    for (const raw of matched.schedules) {
      if (!raw || typeof raw !== 'object') continue;
      const s = raw as RawSchedule;
      // Phase 1287/1294: ready + from + startTime (scheduleIsBookable / assert parity).
      if (String(s.status ?? '').trim() !== 'ready') continue;
      const from = typeof s.availabilityDateFrom === 'string' ? s.availabilityDateFrom.trim() : '';
      const to = typeof s.availabilityDateTo === 'string' ? s.availabilityDateTo.trim() : '';
      if (!from || date < from) continue;
      if (to && date > to) continue;
      // Phase 1298: weekday must match (assert 1286 / scheduleAppliesOnDate).
      const wd = weekdayIndexMondayFirst(date);
      const weekdays = Array.isArray(s.weekdays) ? s.weekdays : [];
      if (wd == null || weekdays.length < 7 || weekdays[wd] !== true) continue;
      const st = typeof s.startTime === 'string' ? s.startTime.trim().slice(0, 5) : '';
      if (!st) continue;
      if (time && st !== time) continue;
      const sid = typeof s.id === 'string' ? s.id.trim() : '';
      if (sid) {
        scheduleId = sid;
        break;
      }
    }
  }
  return {
    pickupPlace: place || null,
    optionInfo: info || null,
    travelerStartInstructions: startIx || null,
    duration: duration || null,
    fulfillment,
    scheduleId,
  };
}

export function resolveStayFieldsForSnapshot(input: {
  listingExtras: unknown;
  checkIn?: string | null;
  checkOut?: string | null;
  nights?: number | null;
  /** Prefer over listing_extras (private table / explicit). */
  checkInAddressOverride?: string | null;
}): {
  checkIn: string | null;
  checkOut: string | null;
  nights: number | null;
  propertyType: string | null;
  checkInAddress: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  houseRules: string | null;
} {
  const checkIn = (input.checkIn ?? '').trim() || null;
  const checkOut = (input.checkOut ?? '').trim() || null;
  const nights =
    typeof input.nights === 'number' && Number.isFinite(input.nights) && input.nights >= 1
      ? Math.floor(input.nights)
      : null;
  let propertyType: string | null = null;
  let checkInAddress: string | null =
    (input.checkInAddressOverride ?? '').trim().slice(0, 400) || null;
  let checkInTime: string | null = null;
  let checkOutTime: string | null = null;
  let houseRules: string | null = null;
  const extras = input.listingExtras;
  if (extras && typeof extras === 'object') {
    const stay = (
      extras as {
        stay?: {
          propertyType?: unknown;
          checkInAddress?: unknown;
          checkInTime?: unknown;
          checkOutTime?: unknown;
          houseRules?: unknown;
        };
      }
    ).stay;
    if (stay && typeof stay.propertyType === 'string' && stay.propertyType.trim()) {
      propertyType = stay.propertyType.trim();
    }
    // Legacy extras may still carry address until migration 128; prefer override.
    if (!checkInAddress && stay && typeof stay.checkInAddress === 'string' && stay.checkInAddress.trim()) {
      checkInAddress = stay.checkInAddress.trim().slice(0, 400);
    }
    if (stay && typeof stay.checkInTime === 'string' && /^\d{2}:\d{2}/.test(stay.checkInTime.trim())) {
      checkInTime = stay.checkInTime.trim().slice(0, 5);
    }
    if (stay && typeof stay.checkOutTime === 'string' && /^\d{2}:\d{2}/.test(stay.checkOutTime.trim())) {
      checkOutTime = stay.checkOutTime.trim().slice(0, 5);
    }
    if (stay && typeof stay.houseRules === 'string' && stay.houseRules.trim()) {
      houseRules = stay.houseRules.trim().slice(0, 2000);
    }
  }
  return {
    checkIn,
    checkOut,
    nights,
    propertyType,
    checkInAddress,
    checkInTime,
    checkOutTime,
    houseRules,
  };
}
