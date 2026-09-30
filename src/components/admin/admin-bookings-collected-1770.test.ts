import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1770: Admin Bookings Collected matches Money', () => {
  it('uses isCollectedBooking for amount column', () => {
    const src = readFileSync(resolve(__dirname, 'AdminBookingsPanel.tsx'), 'utf8');
    expect(src).toContain('Phase 1770');
    expect(src).toContain('isCollectedBooking');
    expect(src).not.toContain('bookingPaymentWasCollected');
  });
});
