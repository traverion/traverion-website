import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer C: tour booking guest stepper must expose validation errors (StayDetails GuestStepper parity).
 */
describe('TourDetails GuestStepper validation describedby', () => {
  it('links booking card errors into the guest stepper group description', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'TourDetails.tsx'),
      'utf8'
    );
    expect(src).toMatch(/id="tour-booking-guests"/);
    expect(src).toMatch(/id="tour-booking-card-error"/);
    expect(src).toMatch(
      /ariaDescribedBy=\{bookingCardError \? 'tour-booking-card-error' : undefined\}/
    );
  });
});
