import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1792: Dashboard recent amounts match Money Collected', () => {
  it('recent booking money uses isCollectedBooking not wasCollected', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierDashboard.tsx'), 'utf8');
    expect(src).toContain('Phase 1792');
    expect(src).toMatch(/recentBookings\.map[\s\S]*isCollectedBooking\(b\)/);
    expect(src).not.toMatch(
      /recentBookings\.map[\s\S]*bookingPaymentWasCollected\(b\.payment_status\)/
    );
  });
});
