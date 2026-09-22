/** Mirrors src/lib/purchase-snapshot.ts for Deno edge checkout. */

export type PurchaseSnapshot = {
  listingTitle: string;
  optionLabel: string | null;
  meetingPoint: string | null;
  pickupInstructions: string | null;
  startTimeHm: string | null;
  capturedAt: string;
};

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
