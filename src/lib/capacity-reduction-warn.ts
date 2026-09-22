/**
 * Partner capacity edits must not silently pretend sold guests disappear.
 * Lowering a cap below already-sold (or held) occupancy is allowed for future
 * sales but must surface a clear warning — paid bookings keep their seats.
 */

export function capacityBelowSoldWarning(params: {
  newCapacity: number;
  occupyingGuests: number;
  scopeLabel?: string;
}): string | null {
  const cap = Math.max(0, Math.floor(params.newCapacity));
  const sold = Math.max(0, Math.floor(params.occupyingGuests));
  if (sold < 1 || cap >= sold) return null;
  const scope = (params.scopeLabel ?? 'this date').trim() || 'this date';
  return `You already have ${sold} guest${sold === 1 ? '' : 's'} on ${scope}. Lowering the cap to ${cap} will not cancel those trips — it only limits new bookings. Existing paid bookings keep their seats.`;
}

/** Schedule max spots reduced below paid/held occupancy for that departure. */
export function scheduleSpotsBelowSoldWarning(params: {
  newMaxSpots: number;
  occupyingGuests: number;
  startTimeHm?: string | null;
}): string | null {
  const scope = params.startTimeHm?.trim()
    ? `the ${params.startTimeHm.trim()} departure`
    : 'this departure';
  return capacityBelowSoldWarning({
    newCapacity: params.newMaxSpots,
    occupyingGuests: params.occupyingGuests,
    scopeLabel: scope,
  });
}
