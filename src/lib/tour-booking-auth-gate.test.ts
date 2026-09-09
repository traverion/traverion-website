import { describe, expect, it } from 'vitest';
import { tourBookingRequiresAuthBeforeStep } from './tour-booking-auth-gate';

describe('tourBookingRequiresAuthBeforeStep', () => {
  it('defers auth until confirm/pay, not option pick or contact', () => {
    expect(tourBookingRequiresAuthBeforeStep('pick_option')).toBe(false);
    expect(tourBookingRequiresAuthBeforeStep('contact')).toBe(false);
    expect(tourBookingRequiresAuthBeforeStep('confirm_pay')).toBe(true);
  });
});
