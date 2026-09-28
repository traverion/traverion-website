/**
 * Phase 1529: when Tour quote fails, send the traveler to the control that can fix it —
 * not always Continue / guests (Stay 1521 parity).
 */
export function tourQuoteFailureFocusTarget(params: {
  quoteError?: string | null;
  quoteCode?: string | null;
}): { scrollId: string; focusSelector?: string } {
  const code = String(params.quoteCode ?? '').trim().toLowerCase();
  const err = String(params.quoteError ?? '');
  if (code === 'time' || /departure time|choose a departure/i.test(err)) {
    return { scrollId: 'tour-departure-times', focusSelector: '#tour-departure-times button:not([disabled])' };
  }
  if (code === 'option' || /booking option|choose a booking option/i.test(err)) {
    return { scrollId: 'tour-booking-options', focusSelector: '#tour-booking-options button' };
  }
  if (
    code === 'bad_date' ||
    /choose a (valid )?date|today or later|season|cutoff|no longer bookable/i.test(err)
  ) {
    return { scrollId: 'tour-booking-panel', focusSelector: '#tour-booking-date-input button:not([disabled])' };
  }
  if (code === 'party' || /guest count|guests|party|age mix|participant/i.test(err)) {
    return { scrollId: 'tour-booking-panel' };
  }
  return { scrollId: 'tour-booking-panel' };
}
