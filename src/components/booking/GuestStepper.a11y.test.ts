import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer C: guest steppers must announce quantity changes and expose capacity hints to assistive tech.
 */
describe('GuestStepper accessible quantity + limits', () => {
  it('uses a polite live region and links hint text via aria-describedby', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'GuestStepper.tsx'),
      'utf8'
    );
    expect(src).toMatch(/aria-live="polite"/);
    expect(src).toMatch(/aria-atomic="true"/);
    expect(src).toMatch(/key=\{value\}/);
    expect(src).toMatch(/aria-describedby=\{groupDescribedBy\}/);
    expect(src).toMatch(/id=\{hintId\}/);
  });
});
