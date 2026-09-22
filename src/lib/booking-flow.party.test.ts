import { describe, expect, it } from 'vitest';
import {
  formatPartySizeHint,
  guestCountBoundaryMessage,
  guestCountValidationError,
} from './booking-flow';

describe('party size copy when departure is sold out', () => {
  it('does not invent a 0–N guest range when max is 0', () => {
    expect(formatPartySizeHint({ min: 1, max: 0 })).toBe('No seats left on this departure.');
    expect(guestCountBoundaryMessage('max', { min: 1, max: 0 })).toBe(
      'No seats left on this departure.'
    );
    expect(guestCountValidationError(1, { min: 1, max: 0 })).toBe(
      'No seats left on this departure.'
    );
  });

  it('keeps normal bounds copy when seats remain', () => {
    expect(formatPartySizeHint({ min: 1, max: 4 })).toBe('1–4 guests per booking.');
    expect(guestCountValidationError(2, { min: 1, max: 4 })).toBeNull();
  });
});
