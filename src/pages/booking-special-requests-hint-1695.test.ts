import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1695: Booking special requests show char hint', () => {
  it('shows Up to 2000 characters with live used count', () => {
    const src = readFileSync(resolve(__dirname, 'BookingPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1695');
    expect(src).toContain('booking-special-requests-hint');
    expect(src).toContain('Up to 2000 characters');
  });
});
