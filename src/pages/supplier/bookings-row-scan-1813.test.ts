import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1813: supplier bookings row scanability', () => {
  it('defines tv-ops-booking-row', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('Phase 1813');
    expect(css).toContain('.tv-ops-booking-row');
  });

  it('leads the card with the experience, not the guest or the total', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toContain('tv-ops-booking-row');
    expect(src).toContain('tv-ops-booking-row__btn');
    expect(src).toContain('line-clamp-2 min-w-0 flex-1 text-[14px] font-semibold leading-5 tracking-tight text-ink');
    expect(src).toContain('Copy booking reference');
    expect(src).not.toContain('font-display text-[1.02rem]');
    expect(src).not.toContain('{paidLabel ? ` · ${paidLabel}` : \'\'}');
  });
});
