import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guests must open as a portaled popover — not an expanding panel trapped in the booking card.
 */
describe('StayGuestPartySelector popover', () => {
  it('portals the dialog and keeps occupancy validation', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'StayGuestPartySelector.tsx'),
      'utf8'
    );
    expect(src).toMatch(/createPortal/);
    expect(src).toMatch(/computeAnchoredPopoverBox/);
    expect(src).toMatch(/formatStayGuestPartySummary/);
    expect(src).toMatch(/validateStayGuestParty/);
    expect(src).toMatch(/role="dialog"/);
    expect(src).not.toMatch(/<fieldset/);
  });
});
