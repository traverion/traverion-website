import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer C: participant mix steppers must announce quantity changes (GuestStepper / TravelerGuestPicker parity).
 */
describe('ParticipantCategoryStepper accessible quantity', () => {
  it('exposes a polite live region on the quantity value', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'ParticipantCategoryStepper.tsx'),
      'utf8'
    );
    expect(src).toMatch(/aria-live="polite"/);
    expect(src).toMatch(/aria-atomic="true"/);
    expect(src).toMatch(/key=\{quantity\}/);
  });
});
