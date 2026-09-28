/**
 * Phase 1517: open host cancel requests must not surface once the trip is cancelled.
 * UI maps only status === 'requested'; self-cancel RPC closes as 'resolved'.
 */
export function openHostCancelRequestVisible(params: {
  bookingStatus: string | null | undefined;
  requestStatus: string | null | undefined;
}): boolean {
  const bookingCancelled = (params.bookingStatus ?? '').trim().toLowerCase() === 'cancelled';
  const requested = (params.requestStatus ?? '').trim().toLowerCase() === 'requested';
  if (bookingCancelled) return false;
  return requested;
}
