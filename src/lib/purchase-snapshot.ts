/**
 * Commercial truth captured at checkout so later listing edits cannot silently
 * rewrite what the traveler purchased (title, option, meeting copy, terms).
 */
import { bookingPaymentWasCollected } from './payment-states';
import { freezeStayBookingPrice, type StayBookingPrice } from './stay-price';

export type PurchaseFulfillment = 'pickup' | 'meeting_point';

export type PurchaseSnapshot = {
  listingTitle: string;
  optionLabel: string | null;
  meetingPoint: string | null;
  pickupInstructions: string | null;
  startTimeHm: string | null;
  capturedAt: string;
  /** Option duration at purchase (e.g. "4 hours"). */
  duration?: string | null;
  /** How this option starts: pickup vs meeting point. */
  fulfillment?: PurchaseFulfillment | null;
  /** Cancellation terms shown at purchase. */
  cancellationPolicy?: string | null;
  /** Structured cancel preset frozen at purchase (free_24h | free_48h | free_7d | non_refundable). */
  cancellationPreset?: string | null;
  /**
   * Hours before local check-in/start for free cancel. null = non-refundable.
   * Cutoff: free self-cancel while start - now > freeCancelHours (exact boundary → closed).
   */
  freeCancelHours?: number | null;
  /**
   * Frozen tour cancel clock (HH:MM). Set on first confirmed pickup so later pickup
   * edits cannot move the free-cancel deadline. Prefer over live pickup_time.
   */
  selfCancelStartHm?: string | null;
  /** Booked option id when present. */
  optionId?: string | null;
  /** Resolved schedule id when seasonal schedules were used. */
  scheduleId?: string | null;
  currency?: string | null;
  totalAmount?: number | null;
  /** Stay charges frozen at checkout. Absent on older bookings. */
  stayPrice?: StayBookingPrice | null;
  /** Stay: check-in date YYYY-MM-DD. */
  checkIn?: string | null;
  /** Stay: check-out date YYYY-MM-DD. */
  checkOut?: string | null;
  nights?: number | null;
  propertyType?: string | null;
  /** Stay: exact check-in address frozen when payment is collected (not on pending holds). */
  checkInAddress?: string | null;
  /** Tour: experience provider booking contact E.164 frozen when payment is collected. */
  bookingContactPhoneE164?: string | null;
  /** Stay: house check-in wall clock HH:MM at purchase. */
  checkInTime?: string | null;
  /** Stay: house check-out wall clock HH:MM at purchase. */
  checkOutTime?: string | null;
  /** Stay: house rules text frozen at purchase. */
  houseRules?: string | null;
  /** Included items frozen at purchase. */
  includes?: string[] | null;
  /** Excluded items frozen at purchase. */
  excludes?: string[] | null;
  /** IANA zone for departure wall clock at purchase. */
  departureTimezone?: string | null;
  /** ISO timestamp when traveler accepted checkout terms (server-stamped). */
  termsAcceptedAt?: string | null;
  /** Traveler-selected pickup. Not the supplier pickup-area center. */
  travelerPickupAddress?: string | null;
  travelerPickupPlaceId?: string | null;
  travelerPickupLat?: number | null;
  travelerPickupLng?: number | null;
  pickupTiming?: 'at_start' | 'before_start' | null;
  pickupWindowMinutes?: number | null;
  pickupTimeConfirmation?: 'at_booking' | 'day_before' | null;
  dropoffMode?: 'same' | 'different' | 'none' | null;
  dropoffPlace?: string | null;
  transportMode?: 'car' | 'minivan' | 'van' | 'bus' | 'suv' | 'limousine' | 'motorcycle' | 'boat' | 'other' | 'none' | null;
  transportOther?: string | null;
};

export function isPurchaseSnapshot(value: unknown): value is PurchaseSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.listingTitle === 'string' && typeof v.capturedAt === 'string';
}

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
  // Phase 1571: nights must match exclusive checkOut (not stale shorter quote nights).
  const checkIn =
    typeof merged.checkIn === 'string' && ISO_CHECKOUT.test(merged.checkIn.trim())
      ? merged.checkIn.trim()
      : typeof (existing as { checkIn?: unknown } | null)?.checkIn === 'string' &&
          ISO_CHECKOUT.test(String((existing as { checkIn: string }).checkIn).trim())
        ? String((existing as { checkIn: string }).checkIn).trim()
        : null;
  const checkOut =
    typeof merged.checkOut === 'string' && ISO_CHECKOUT.test(merged.checkOut.trim())
      ? merged.checkOut.trim()
      : null;
  if (checkIn && checkOut && checkOut > checkIn) {
    const nights = Math.round(
      (Date.parse(`${checkOut}T12:00:00Z`) - Date.parse(`${checkIn}T12:00:00Z`)) / 86400000
    );
    if (Number.isFinite(nights) && nights >= 1) merged.nights = nights;
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
  cancellationPreset?: string | null;
  freeCancelHours?: number | null;
  optionId?: string | null;
  scheduleId?: string | null;
  currency?: string | null;
  totalAmount?: number | null;
  stayPrice?: StayBookingPrice | null;
  checkIn?: string | null;
  checkOut?: string | null;
  nights?: number | null;
  propertyType?: string | null;
  checkInAddress?: string | null;
  bookingContactPhoneE164?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  houseRules?: string | null;
  includes?: string[] | null;
  excludes?: string[] | null;
  departureTimezone?: string | null;
  termsAcceptedAt?: string | null;
  travelerPickupAddress?: string | null;
  travelerPickupPlaceId?: string | null;
  travelerPickupLat?: number | null;
  travelerPickupLng?: number | null;
  pickupTiming?: 'at_start' | 'before_start' | null;
  pickupWindowMinutes?: number | null;
  pickupTimeConfirmation?: 'at_booking' | 'day_before' | null;
  dropoffMode?: 'same' | 'different' | 'none' | null;
  dropoffPlace?: string | null;
  transportMode?: 'car' | 'minivan' | 'van' | 'bus' | 'suv' | 'limousine' | 'motorcycle' | 'boat' | 'other' | 'none' | null;
  transportOther?: string | null;
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
  const cancellationPreset =
    typeof input.cancellationPreset === 'string' && input.cancellationPreset.trim()
      ? input.cancellationPreset.trim()
      : null;
  const freeCancelHours =
    input.freeCancelHours === null
      ? null
      : typeof input.freeCancelHours === 'number' && Number.isFinite(input.freeCancelHours)
        ? Math.floor(input.freeCancelHours)
        : undefined;
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
  const bookingContactPhoneE164 = (input.bookingContactPhoneE164 ?? '').trim().slice(0, 24) || null;
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
  if (cancellationPreset) snap.cancellationPreset = cancellationPreset;
  if (freeCancelHours === null) snap.freeCancelHours = null;
  else if (typeof freeCancelHours === 'number') snap.freeCancelHours = freeCancelHours;
  if (optionId) snap.optionId = optionId;
  if (scheduleId) snap.scheduleId = scheduleId;
  if (currency) snap.currency = currency;
  if (total != null) snap.totalAmount = total;
  const stayPrice = input.stayPrice ? freezeStayBookingPrice(input.stayPrice) : null;
  if (stayPrice) snap.stayPrice = stayPrice;
  if (checkIn) snap.checkIn = checkIn;
  if (checkOut) snap.checkOut = checkOut;
  if (nights != null) snap.nights = nights;
  if (propertyType) snap.propertyType = propertyType;
  if (checkInAddress) snap.checkInAddress = checkInAddress;
  if (bookingContactPhoneE164) snap.bookingContactPhoneE164 = bookingContactPhoneE164;
  if (checkInTime) snap.checkInTime = checkInTime;
  if (checkOutTime) snap.checkOutTime = checkOutTime;
  if (houseRules) snap.houseRules = houseRules;
  if (includes) snap.includes = includes;
  if (excludes) snap.excludes = excludes;
  if (departureTimezone) snap.departureTimezone = departureTimezone;
  if (termsAcceptedAt) snap.termsAcceptedAt = termsAcceptedAt;
  const travelerPickupAddress = (input.travelerPickupAddress ?? '').trim() || null;
  const travelerPickupPlaceId = (input.travelerPickupPlaceId ?? '').trim() || null;
  if (travelerPickupAddress) snap.travelerPickupAddress = travelerPickupAddress;
  if (travelerPickupPlaceId) snap.travelerPickupPlaceId = travelerPickupPlaceId;
  if (typeof input.travelerPickupLat === 'number' && Number.isFinite(input.travelerPickupLat)) {
    snap.travelerPickupLat = input.travelerPickupLat;
  }
  if (typeof input.travelerPickupLng === 'number' && Number.isFinite(input.travelerPickupLng)) {
    snap.travelerPickupLng = input.travelerPickupLng;
  }
  if (input.pickupTiming === 'at_start' || input.pickupTiming === 'before_start') snap.pickupTiming = input.pickupTiming;
  if (
    typeof input.pickupWindowMinutes === 'number' &&
    input.pickupWindowMinutes >= 5 &&
    input.pickupWindowMinutes <= 180
  ) {
    snap.pickupWindowMinutes = Math.round(input.pickupWindowMinutes);
  }
  if (input.pickupTimeConfirmation === 'at_booking' || input.pickupTimeConfirmation === 'day_before') {
    snap.pickupTimeConfirmation = input.pickupTimeConfirmation;
  }
  if (input.dropoffMode === 'same' || input.dropoffMode === 'different' || input.dropoffMode === 'none') {
    snap.dropoffMode = input.dropoffMode;
  }
  const dropoffPlace = (input.dropoffPlace ?? '').trim();
  if (dropoffPlace) snap.dropoffPlace = dropoffPlace.slice(0, 300);
  if (
    input.transportMode === 'car' ||
    input.transportMode === 'minivan' ||
    input.transportMode === 'van' ||
    input.transportMode === 'bus' ||
    input.transportMode === 'suv' ||
    input.transportMode === 'limousine' ||
    input.transportMode === 'motorcycle' ||
    input.transportMode === 'boat' ||
    input.transportMode === 'other' ||
    input.transportMode === 'none'
  ) {
    snap.transportMode = input.transportMode;
  }
  const transportOther = (input.transportOther ?? '').trim();
  if (snap.transportMode === 'other' && transportOther) snap.transportOther = transportOther.slice(0, 80);
  return snap;
}

/** Prefer snapshotted title; fall back to live listing title. */
export function displayListingTitleFromPurchase(
  snapshot: unknown,
  liveTitle: string | null | undefined,
  fallback = 'Booking'
): string {
  if (isPurchaseSnapshot(snapshot) && snapshot.listingTitle.trim()) {
    return snapshot.listingTitle.trim();
  }
  const live = (liveTitle ?? '').trim();
  return live || fallback;
}

/**
 * Phase 1483: Pickup/Bookings listing filters must label like booking rows — prefer
 * purchased title from the latest booking on that listing, not a later live rename.
 */
export function partnerListingFilterLabelFromBookings(
  listingId: string,
  liveTitle: string | null | undefined,
  bookings: ReadonlyArray<{ listing_id: string; created_at: string; purchase_snapshot?: unknown }>,
  fallback = 'Listing'
): string {
  const live = (liveTitle ?? '').trim() || fallback;
  let latestCreatedAt = '';
  let latestSnapshot: unknown = null;
  for (const b of bookings) {
    if (b.listing_id !== listingId) continue;
    const created = b.created_at ?? '';
    if (!latestCreatedAt || created.localeCompare(latestCreatedAt) > 0) {
      latestCreatedAt = created;
      latestSnapshot = b.purchase_snapshot;
    }
  }
  if (!latestCreatedAt) return live;
  return displayListingTitleFromPurchase(latestSnapshot, live, live);
}

export function displayOptionLabelFromPurchase(
  snapshot: unknown,
  liveOptionLabel: string | null | undefined
): string {
  if (isPurchaseSnapshot(snapshot)) {
    return (snapshot.optionLabel ?? '').trim();
  }
  return (liveOptionLabel ?? '').trim();
}

export function displayMeetingPointFromPurchase(
  snapshot: unknown,
  liveMeeting: string | null | undefined
): string {
  // When a purchase snapshot exists, never resurrect live listing place
  // (empty snap field = incomplete purchase logistics, not current catalog copy).
  if (isPurchaseSnapshot(snapshot)) {
    return (snapshot.meetingPoint ?? '').trim();
  }
  return (liveMeeting ?? '').trim();
}

export function displayPickupInstructionsFromPurchase(
  snapshot: unknown,
  livePickup: string | null | undefined
): string {
  if (isPurchaseSnapshot(snapshot)) {
    return (snapshot.pickupInstructions ?? '').trim();
  }
  return (livePickup ?? '').trim();
}

/**
 * Traveler-facing departure time: prefer what was purchased.
 * Partners may still edit bookings.start_time for ops; Trips should not silently rewrite.
 */
export function displayStartTimeFromPurchase(
  snapshot: unknown,
  liveStartTimeHm: string | null | undefined
): string {
  // When a purchase snapshot exists, never resurrect live/ops start_time
  // (empty snap field = incomplete purchase clock, not current ops edit).
  if (isPurchaseSnapshot(snapshot)) {
    return (snapshot.startTimeHm ?? '').trim();
  }
  return (liveStartTimeHm ?? '').trim();
}

/** IANA zone frozen at purchase — null when absent (pre-TZ snapshots). */
export function displayDepartureTimezoneFromPurchase(snapshot: unknown): string | null {
  if (!isPurchaseSnapshot(snapshot)) return null;
  const tz = (snapshot.departureTimezone ?? '').trim();
  return tz || null;
}

/**
 * Trip list/detail clock: wall time plus snapshotted IANA zone when present so
 * "20:00" stays experience-local (e.g. Rovaniemi) rather than the traveler's device TZ.
 */
export function formatTripDepartureWithTimezone(
  startTimeHm: string | null | undefined,
  timezone: string | null | undefined
): string {
  const hm = (startTimeHm ?? '').trim();
  if (!hm) return '';
  const tz = (timezone ?? '').trim();
  if (!tz) return hm;
  return `${hm} · ${tz}`;
}

/** Traveler-facing clock. Keeps the IANA zone for calculations; shows the city name. */
export function formatTravelerDepartureClock(
  startTimeHm: string | null | undefined,
  timezone: string | null | undefined
): string {
  const hm = (startTimeHm ?? '').trim();
  if (!hm) return '';
  const tz = (timezone ?? '').trim();
  if (!tz) return hm;
  const city = (tz.split('/').pop() ?? tz).replace(/_/g, ' ');
  return `${hm} · ${city} time`;
}

export function displayDurationFromPurchase(
  snapshot: unknown,
  liveDuration: string | null | undefined
): string {
  if (isPurchaseSnapshot(snapshot)) {
    return (snapshot.duration ?? '').trim();
  }
  return (liveDuration ?? '').trim();
}

export function displayCancellationPolicyFromPurchase(
  snapshot: unknown,
  livePolicy: string | null | undefined
): string {
  if (isPurchaseSnapshot(snapshot)) {
    return (snapshot.cancellationPolicy ?? '').trim();
  }
  return (livePolicy ?? '').trim();
}

export function displayFulfillmentFromPurchase(snapshot: unknown): PurchaseFulfillment | null {
  if (!isPurchaseSnapshot(snapshot)) return null;
  if (snapshot.fulfillment === 'pickup' || snapshot.fulfillment === 'meeting_point') {
    return snapshot.fulfillment;
  }
  return null;
}

export function displayStayCheckInFromPurchase(
  snapshot: unknown,
  liveCheckIn: string | null | undefined
): string {
  if (isPurchaseSnapshot(snapshot) && snapshot.checkIn?.trim()) return snapshot.checkIn.trim();
  return (liveCheckIn ?? '').trim();
}

export function displayStayCheckOutFromPurchase(
  snapshot: unknown,
  liveCheckOut: string | null | undefined
): string {
  if (isPurchaseSnapshot(snapshot) && snapshot.checkOut?.trim()) return snapshot.checkOut.trim();
  return (liveCheckOut ?? '').trim();
}

export function displayStayNightsFromPurchase(
  snapshot: unknown,
  liveNights: number | null | undefined
): number | null {
  if (isPurchaseSnapshot(snapshot) && typeof snapshot.nights === 'number' && snapshot.nights >= 1) {
    return snapshot.nights;
  }
  if (typeof liveNights === 'number' && liveNights >= 1) return Math.floor(liveNights);
  return null;
}

/**
 * Prefer snapshotted stay check-in address after payment is collected.
 * Pending/failed/expired holds must not reveal listing_stay_private (Phase 1325).
 */
export function displayCheckInAddressFromPurchase(
  snapshot: unknown,
  paymentStatus: string | null | undefined
): string | null {
  if (!bookingPaymentWasCollected(paymentStatus)) return null;
  if (!isPurchaseSnapshot(snapshot)) return null;
  const addr = (snapshot.checkInAddress ?? '').trim();
  return addr || null;
}

/**
 * Experience provider booking contact after payment is collected (never on unpaid holds).
 */
export function displayBookingContactPhoneFromPurchase(
  snapshot: unknown,
  paymentStatus: string | null | undefined
): string | null {
  if (!bookingPaymentWasCollected(paymentStatus)) return null;
  if (!isPurchaseSnapshot(snapshot)) return null;
  const phone = (snapshot.bookingContactPhoneE164 ?? '').trim();
  return phone || null;
}

/**
 * Phase 1358: traveler client loads must not surface checkInAddress on unpaid rows
 * (defense in depth alongside DB trigger 195).
 * Also redacts bookingContactPhoneE164 until payment is collected.
 */
export function redactUnpaidStayCheckInAddress<T extends {
  payment_status?: string | null;
  purchase_snapshot?: unknown;
}>(row: T): T {
  if (bookingPaymentWasCollected(row.payment_status)) return row;
  const snap = row.purchase_snapshot;
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return row;
  if (!('checkInAddress' in snap) && !('bookingContactPhoneE164' in snap)) return row;
  const next = { ...(snap as Record<string, unknown>) };
  delete next.checkInAddress;
  delete next.bookingContactPhoneE164;
  return { ...row, purchase_snapshot: next };
}

/** House check-in wall clock from purchase; live only for pre-snapshot rows. */
export function displayStayCheckInTimeFromPurchase(
  snapshot: unknown,
  liveTime: string | null | undefined
): string {
  if (isPurchaseSnapshot(snapshot)) {
    return (snapshot.checkInTime ?? '').trim().slice(0, 5);
  }
  return (liveTime ?? '').trim().slice(0, 5);
}

/** House check-out wall clock from purchase; live only for pre-snapshot rows. */
export function displayStayCheckOutTimeFromPurchase(
  snapshot: unknown,
  liveTime: string | null | undefined
): string {
  if (isPurchaseSnapshot(snapshot)) {
    return (snapshot.checkOutTime ?? '').trim().slice(0, 5);
  }
  return (liveTime ?? '').trim().slice(0, 5);
}

/** House rules from purchase; null when snap exists without rules or no snap. */
export function displayStayHouseRulesFromPurchase(snapshot: unknown): string | null {
  if (!isPurchaseSnapshot(snapshot)) return null;
  const rules = (snapshot.houseRules ?? '').trim();
  return rules || null;
}

/** Included items from purchase; null when no snap (caller may use live). Empty array when snap has none. */
export function displayIncludesFromPurchase(snapshot: unknown): string[] | null {
  if (!isPurchaseSnapshot(snapshot)) return null;
  return normalizePurchaseStringList(snapshot.includes) ?? [];
}

/** Excluded items from purchase; null when no snap. Empty array when snap has none. */
export function displayExcludesFromPurchase(snapshot: unknown): string[] | null {
  if (!isPurchaseSnapshot(snapshot)) return null;
  return normalizePurchaseStringList(snapshot.excludes) ?? [];
}

/**
 * Partner ops display: prefer live start_time (may be edited for the day),
 * fall back to purchased departure. When they differ, surface purchased truth.
 */
export function partnerOpsDepartureDisplay(
  snapshot: unknown,
  opsStartTimeHm: string | null | undefined
): { displayHm: string; purchasedNote: string | null } {
  const purchased = displayStartTimeFromPurchase(snapshot, null);
  const ops = (opsStartTimeHm ?? '').trim();
  const displayHm = ops || purchased;
  const purchasedNote =
    purchased && ops && purchased !== ops ? `Purchased ${purchased}` : null;
  return { displayHm, purchasedNote };
}
