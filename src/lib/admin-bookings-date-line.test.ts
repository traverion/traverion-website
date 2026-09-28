import { describe, expect, it } from 'vitest';
import { adminBookingDateLine } from './admin-bookings-date-line';

describe('adminBookingDateLine', () => {
  it('Phase 1544: nights-only stay shows exclusive check-out', () => {
    expect(
      adminBookingDateLine({
        booking_date: '2026-12-01',
        check_out: null,
        nights: 3,
      })
    ).toBe('2026-12-01 → 2026-12-04');
  });

  it('Phase 1544: snapshot-only stay shows purchased check-out', () => {
    expect(
      adminBookingDateLine({
        booking_date: '2026-12-01',
        check_out: null,
        nights: null,
        purchase_snapshot: { checkOut: '2026-12-05' },
      })
    ).toBe('2026-12-01 → 2026-12-05');
  });

  it('Phase 1578: stale short check_out yields to longer purchase_snapshot (1564)', () => {
    expect(
      adminBookingDateLine({
        booking_date: '2026-12-01',
        check_out: '2026-12-03',
        nights: 2,
        purchase_snapshot: { checkOut: '2026-12-06' },
      })
    ).toBe('2026-12-01 → 2026-12-06');
  });

  it('Phase 1544: column stay and tour unchanged', () => {
    expect(
      adminBookingDateLine({
        booking_date: '2026-12-01',
        check_out: '2026-12-03',
        nights: 2,
      })
    ).toBe('2026-12-01 → 2026-12-03');
    expect(
      adminBookingDateLine({
        booking_date: '2026-11-04',
        check_out: null,
        nights: null,
      })
    ).toBe('2026-11-04');
  });
});
