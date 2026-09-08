/** Listing-level pickup copy is incomplete when meeting + pickup notes are too thin to operate. */
export function listingPickupCopyIncomplete(meetingPoint: string | null | undefined, pickupInstructions: string | null | undefined): boolean {
  const m = (meetingPoint ?? '').trim();
  const p = (pickupInstructions ?? '').trim();
  return m.length + p.length < 20;
}
