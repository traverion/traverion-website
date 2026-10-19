import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guests must open as a compact popover — not a permanently expanded adults/children/infants UI.
 */
describe('StayGuestPartySelector popover', () => {
  it('uses a Guests trigger with aria-expanded and role=dialog panel', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'StayGuestPartySelector.tsx'),
      'utf8'
    );
    expect(src).toMatch(/formatStayGuestPartySummary/);
    expect(src).toMatch(/aria-expanded=\{open\}/);
    expect(src).toMatch(/role="dialog"/);
    expect(src).toMatch(/tv-popover/);
    expect(src).not.toMatch(/<fieldset/);
  });
});
