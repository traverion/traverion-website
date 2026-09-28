import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1674: Booking confirmation offers Print', () => {
  it('places Print beside Copy for the booking reference', () => {
    const src = readFileSync(resolve(__dirname, 'BookingConfirmationPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1674');
    expect(src).toContain('window.print()');
    expect(src).toContain('Print booking confirmation');
    expect(src).toContain('Printer');
  });
});
