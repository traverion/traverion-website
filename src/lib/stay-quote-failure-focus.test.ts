import { describe, expect, it } from 'vitest';
import { stayQuoteFailureFocusTarget } from './stay-quote-failure-focus';

describe('stayQuoteFailureFocusTarget', () => {
  it('Phase 1521: capacity errors scroll to capacity notice, not night picker', () => {
    expect(stayQuoteFailureFocusTarget('Guest capacity is unavailable for this stay.')).toEqual({
      scrollId: 'stay-guest-capacity-unavailable',
      focusNightPicker: false,
    });
  });

  it('keeps date/booked failures on the night picker', () => {
    expect(stayQuoteFailureFocusTarget('Those nights are already booked.')).toEqual({
      scrollId: 'stay-booking-panel',
      focusNightPicker: true,
    });
  });
});
