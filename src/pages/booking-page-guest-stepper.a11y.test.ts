import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer C: checkout guest stepper must expose validation errors (TourDetails / StayDetails parity).
 */
describe('BookingPage GuestStepper validation describedby', () => {
  it('links availability step errors into the guest stepper group description', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'BookingPage.tsx'),
      'utf8'
    );
    expect(src).toMatch(/id="booking-flow-guests"/);
    expect(src).toMatch(/id="booking-flow-guests-error"/);
    expect(src).toMatch(
      /ariaDescribedBy=\{\s*error \|\| quoteBlockReason \|\| dayCapacityError \? 'booking-flow-guests-error' : undefined\s*\}/
    );
  });
});
