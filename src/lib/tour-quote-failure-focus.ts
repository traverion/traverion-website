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

/**
 * Phase 1545: BookingPage deep-link checkout uses booking-flow-* ids (not tour-*).
 */
export function bookingPageQuoteFailureFocusTarget(params: {
  quoteError?: string | null;
  quoteCode?: string | null;
}): { scrollId: string; focusSelector?: string } {
  const code = String(params.quoteCode ?? '').trim().toLowerCase();
  const err = String(params.quoteError ?? '');
  if (code === 'party' || /guest count|guests|party|age mix|participant/i.test(err)) {
    return { scrollId: 'booking-flow-guests', focusSelector: '#booking-flow-guests button:not([disabled])' };
  }
  if (
    code === 'bad_date' ||
    code === 'weekday' ||
    code === 'season' ||
    /choose a (valid )?date|today or later|season|cutoff|no longer bookable|not offered/i.test(err)
  ) {
    return {
      scrollId: 'booking-flow-date-input',
      focusSelector: '#booking-flow-date-input button:not([disabled])',
    };
  }
  // Option / time / other — land on trip panel date control (BookingPage has no option dock ids).
  return {
    scrollId: 'booking-flow-date-input',
    focusSelector: '#booking-flow-date-input button:not([disabled])',
  };
}
