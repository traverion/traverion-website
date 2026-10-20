import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1813 / Bookings V2: supplier bookings row scanability', () => {
  it('keeps legacy tv-ops-booking-row tokens for stay/compat surfaces', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('Phase 1813');
    expect(css).toContain('.tv-ops-booking-row');
  });

  it('leads tour cards with the experience via TourOpsBookingCard', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    const card = readFileSync(
      resolve(__dirname, '../../components/supplier/TourOpsBookingCard.tsx'),
      'utf8'
    );
    expect(src).toContain('TourOpsBookingCard');
    expect(card).toContain('tour-ops-card__title');
    expect(card).toContain('Copy booking reference');
    expect(card).not.toContain('font-display text-[1.02rem]');
    expect(src).not.toContain('{paidLabel ? ` · ${paidLabel}` : \'\'}');
  });
});
