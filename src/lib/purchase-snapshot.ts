/**
 * Commercial truth captured at checkout so later listing edits cannot silently
 * rewrite what the traveler purchased (title, option, meeting copy).
 */

export type PurchaseSnapshot = {
  listingTitle: string;
  optionLabel: string | null;
  meetingPoint: string | null;
  pickupInstructions: string | null;
  startTimeHm: string | null;
  capturedAt: string;
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
  capturedAt?: string;
}): PurchaseSnapshot {
  const title = input.listingTitle.trim() || 'Experience';
  const option = (input.optionLabel ?? '').trim() || null;
  const meeting = (input.meetingPoint ?? '').trim() || null;
  const pickup = (input.pickupInstructions ?? '').trim() || null;
  const start = (input.startTimeHm ?? '').trim() || null;
  return {
    listingTitle: title,
    optionLabel: option,
    meetingPoint: meeting,
    pickupInstructions: pickup,
    startTimeHm: start,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  };
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
  if (isPurchaseSnapshot(snapshot) && snapshot.meetingPoint?.trim()) {
    return snapshot.meetingPoint.trim();
  }
  return (liveMeeting ?? '').trim();
}

export function displayPickupInstructionsFromPurchase(
  snapshot: unknown,
  livePickup: string | null | undefined
): string {
  if (isPurchaseSnapshot(snapshot) && snapshot.pickupInstructions?.trim()) {
    return snapshot.pickupInstructions.trim();
  }
  return (livePickup ?? '').trim();
}
