/**
 * Mobile sticky CTA labels for stay listing — name the missing step, don't imply checkout is ready.
 */
export function stayStickyBookCtaLabel(params: {
  selectionOccupied: boolean;
  paying?: boolean;
  quoteOk: boolean;
  leadGuestReady?: boolean;
  checkIn: string;
  checkOut: string;
  quoteError?: string | null;
  minNights: number;
}): string {
  if (params.selectionOccupied) return 'Dates unavailable';
  if (params.paying) return 'Opening checkout…';
  if (params.quoteOk && params.leadGuestReady === false) return 'Add guest name';
  if (params.quoteOk) return 'Continue · TEST';
  if (params.checkIn && params.checkOut && params.quoteError) {
    if (/Minimum stay/i.test(params.quoteError)) return `Need ${params.minNights}+ nights`;
    return 'Fix dates';
  }
  if (params.checkIn && !params.checkOut) return 'Pick check-out';
  return 'Select dates';
}
