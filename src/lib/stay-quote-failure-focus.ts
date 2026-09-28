/**
 * Phase 1521: when Stay quote fails, send the traveler to the control that can fix it —
 * not always the night picker.
 */
export function stayQuoteFailureFocusTarget(quoteError: string | null | undefined): {
  scrollId: string;
  focusNightPicker: boolean;
} {
  const err = String(quoteError ?? '');
  if (/Guest capacity is unavailable|capacity is unavailable/i.test(err)) {
    return { scrollId: 'stay-guest-capacity-unavailable', focusNightPicker: false };
  }
  if (/allows up to|how many guests|guest count/i.test(err)) {
    return { scrollId: 'stay-booking-panel', focusNightPicker: false };
  }
  if (/nightly price|does not have a nightly price/i.test(err)) {
    return { scrollId: 'stay-booking-panel', focusNightPicker: false };
  }
  return { scrollId: 'stay-booking-panel', focusNightPicker: true };
}
