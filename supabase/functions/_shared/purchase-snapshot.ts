/** Mirrors src/lib/purchase-snapshot.ts for Deno edge checkout. */

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
};

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

/** Prefer option note, then listing pickup instructions. */
export function resolvePickupInstructionsForSnapshot(input: {
  optionInfo?: string | null;
  listingPickupInstructions?: string | null;
}): string | null {
  const fromOption = (input.optionInfo ?? '').trim();
  if (fromOption) return fromOption;
  const fromListing = (input.listingPickupInstructions ?? '').trim();
  return fromListing || null;
}

type RawOption = {
  id?: unknown;
  pickupPlace?: unknown;
  optionInfo?: unknown;
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
};

/** Extract bookable option fields for the purchase freeze. */
export function resolveOptionFieldsForSnapshot(input: {
  listingExtras: unknown;
  optionId?: string | null;
  bookingDate?: string | null;
  startTimeHm?: string | null;
}): {
  pickupPlace: string | null;
  optionInfo: string | null;
  duration: string | null;
  fulfillment: PurchaseFulfillment | null;
  scheduleId: string | null;
} {
  const empty = {
    pickupPlace: null as string | null,
    optionInfo: null as string | null,
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
      if (String(s.status ?? '').trim() === 'draft') continue;
      const from = typeof s.availabilityDateFrom === 'string' ? s.availabilityDateFrom.trim() : '';
      const to = typeof s.availabilityDateTo === 'string' ? s.availabilityDateTo.trim() : '';
      if (from && date < from) continue;
      if (to && date > to) continue;
      const st = typeof s.startTime === 'string' ? s.startTime.trim().slice(0, 5) : '';
      if (time && st && st !== time) continue;
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
    duration: duration || null,
    fulfillment,
    scheduleId,
  };
}
