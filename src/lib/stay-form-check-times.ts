/**
 * Phase 1518: hydrating an existing stay must not invent 16:00 / 11:00 when
 * the host never published check-in/out times (silent save would invent truth).
 */
export function stayFormCheckInOutFromExtras(stay?: {
  checkInTime?: string | null;
  checkOutTime?: string | null;
} | null): { stayCheckIn: string; stayCheckOut: string } {
  return {
    stayCheckIn: (stay?.checkInTime ?? '').trim(),
    stayCheckOut: (stay?.checkOutTime ?? '').trim(),
  };
}
