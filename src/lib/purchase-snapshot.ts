/**
 * Commercial truth captured at checkout so later listing edits cannot silently
 * rewrite what the traveler purchased (title, option, meeting copy, terms).
 */

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
  /** Booked option id when present. */
  optionId?: string | null;
  /** Resolved schedule id when seasonal schedules were used. */
  scheduleId?: string | null;
  currency?: string | null;
  totalAmount?: number | null;
  /** Stay: check-in date YYYY-MM-DD. */
  checkIn?: string | null;
  /** Stay: check-out date YYYY-MM-DD. */
  checkOut?: string | null;
  nights?: number | null;
  propertyType?: string | null;
  /** Stay: exact check-in address frozen at purchase for Trips. */
  checkInAddress?: string | null;
  /** Stay: house check-in wall clock HH:MM at purchase. */
  checkInTime?: string | null;
  /** Stay: house check-out wall clock HH:MM at purchase. */
  checkOutTime?: string | null;
  /** Stay: house rules text frozen at purchase. */
  houseRules?: string | null;
  /** IANA zone for departure wall clock at purchase. */
  departureTimezone?: string | null;
  /** ISO timestamp when traveler accepted checkout terms (server-stamped). */
  termsAcceptedAt?: string | null;
};

export function isPurchaseSnapshot(value: unknown): value is PurchaseSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.listingTitle === 'string' && typeof v.capturedAt === 'string';
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
  if (departureTimezone) snap.departureTimezone = departureTimezone;
  if (termsAcceptedAt) snap.termsAcceptedAt = termsAcceptedAt;
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

export function displayOptionLabelFromPurchase(
  snapshot: unknown,
  liveOptionLabel: string | null | undefined
): string {
  if (isPurchaseSnapshot(snapshot) && snapshot.optionLabel?.trim()) {
    return snapshot.optionLabel.trim();
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
  if (isPurchaseSnapshot(snapshot) && snapshot.startTimeHm?.trim()) {
    return snapshot.startTimeHm.trim();
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
  return `${hm} · ${tz} local`;
}

export function displayDurationFromPurchase(
  snapshot: unknown,
  liveDuration: string | null | undefined
): string {
  if (isPurchaseSnapshot(snapshot) && snapshot.duration?.trim()) {
    return snapshot.duration.trim();
  }
  return (liveDuration ?? '').trim();
}

export function displayCancellationPolicyFromPurchase(
  snapshot: unknown,
  livePolicy: string | null | undefined
): string {
  if (isPurchaseSnapshot(snapshot) && snapshot.cancellationPolicy?.trim()) {
    return snapshot.cancellationPolicy.trim();
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

/** Prefer snapshotted stay check-in address; empty when absent. */
export function displayCheckInAddressFromPurchase(snapshot: unknown): string | null {
  if (!isPurchaseSnapshot(snapshot)) return null;
  const addr = (snapshot.checkInAddress ?? '').trim();
  return addr || null;
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
