import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1616: confirmation Open My bookings CTA', () => {
  it('uses Open My bookings instead of Manage booking on confirmation CTAs', () => {
    const src = readFileSync(resolve(__dirname, 'BookingConfirmationPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1616');
    expect(src).not.toContain('Manage booking');
    expect(src).toContain('View in My bookings');
    expect(src).toContain("label: 'Open My bookings'");
  });
});
