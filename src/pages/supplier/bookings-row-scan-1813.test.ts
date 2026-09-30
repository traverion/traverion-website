import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1813: supplier bookings row scanability', () => {
  it('defines tv-ops-booking-row', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('Phase 1813');
    expect(css).toContain('.tv-ops-booking-row');
  });

  it('separates amount from meta line with display hierarchy', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toContain('tv-ops-booking-row');
    expect(src).toContain('tv-ops-booking-row__btn');
    expect(src).toContain('font-display text-[1.02rem]');
    expect(src).toContain('font-display text-[0.95rem] font-semibold tabular-nums');
    expect(src).not.toContain('{paidLabel ? ` · ${paidLabel}` : \'\'}');
  });
});
