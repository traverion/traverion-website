import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { authoritativeRentalWindow, isReservedRentalPreviewId } from './rental-server-window';

const WEEK = [
  { day: 'sun', open: false, earliestPickupHm: '09:00', latestPickupHm: '17:00', earliestReturnHm: '09:00', latestReturnHm: '18:00' },
  { day: 'mon', open: true, earliestPickupHm: '09:00', latestPickupHm: '17:00', earliestReturnHm: '09:00', latestReturnHm: '18:00' },
];

describe('authoritativeRentalWindow', () => {
  it('bills elapsed hours across the Helsinki spring-forward, not the missing wall-clock hour', () => {
    const window = authoritativeRentalWindow({
      timeZone: 'Europe/Helsinki',
      durationMode: 'hourly',
      minDurationHours: 1,
      maxDurationHours: 8,
      pickupAt: '2026-03-29T01:30:00+02:00',
      returnAt: '2026-03-29T04:30:00+03:00',
      durationUnit: 'hour',
      nowMs: Date.parse('2026-03-28T12:00:00Z'),
    });
    expect(window.ok).toBe(true);
    if (window.ok) expect(window.durationCount).toBe(2);
  });

  it('counts calendar days in the listing timezone when the UTC date differs', () => {
    const window = authoritativeRentalWindow({
      timeZone: 'Europe/Helsinki',
      durationMode: 'daily',
      pickupAt: '2026-11-02T00:30:00+02:00',
      returnAt: '2026-11-02T18:00:00+02:00',
      durationUnit: 'day',
      nowMs: Date.parse('2026-11-01T08:00:00Z'),
    });
    expect(window.ok).toBe(true);
    if (window.ok) {
      expect(window.pickupYmd).toBe('2026-11-02');
      expect(window.durationCount).toBe(1);
    }
  });

  it('rejects a closed pickup day, an early pickup, short notice, and a missing timezone', () => {
    const closed = authoritativeRentalWindow({
      timeZone: 'Europe/Helsinki',
      durationMode: 'daily',
      operatingDays: WEEK,
      pickupAt: '2026-11-01T10:00:00+02:00',
      returnAt: '2026-11-02T12:00:00+02:00',
      durationUnit: 'day',
      nowMs: Date.parse('2026-10-30T08:00:00Z'),
    });
    expect(closed.ok).toBe(false);

    const early = authoritativeRentalWindow({
      timeZone: 'Europe/Helsinki',
      durationMode: 'daily',
      operatingDays: WEEK,
      pickupAt: '2026-11-02T08:00:00+02:00',
      returnAt: '2026-11-02T12:00:00+02:00',
      durationUnit: 'day',
      nowMs: Date.parse('2026-11-01T08:00:00Z'),
    });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error).toMatch(/between 09:00 and 17:00/);

    const notice = authoritativeRentalWindow({
      timeZone: 'Europe/Helsinki',
      durationMode: 'hourly',
      bookingNoticeHours: 2,
      pickupAt: '2026-11-02T12:00:00+02:00',
      returnAt: '2026-11-02T14:00:00+02:00',
      durationUnit: 'hour',
      nowMs: Date.parse('2026-11-02T09:30:00Z'),
    });
    expect(notice.ok).toBe(false);
    if (!notice.ok) expect(notice.error).toMatch(/2 hours/);

    const zone = authoritativeRentalWindow({
      timeZone: '',
      durationMode: 'daily',
      pickupAt: '2026-11-02T10:00:00Z',
      returnAt: '2026-11-02T18:00:00Z',
      durationUnit: 'day',
    });
    expect(zone.ok).toBe(false);
  });

  it('rejects an hourly selection on a daily listing and a bogus timezone', () => {
    const hourly = authoritativeRentalWindow({
      timeZone: 'Europe/Helsinki',
      durationMode: 'daily',
      pickupAt: '2026-11-02T10:00:00+02:00',
      returnAt: '2026-11-02T12:00:00+02:00',
      durationUnit: 'hour',
    });
    expect(hourly.ok).toBe(false);
    const zone = authoritativeRentalWindow({
      timeZone: 'Not/AZone',
      durationMode: 'daily',
      pickupAt: '2026-11-02T10:00:00Z',
      returnAt: '2026-11-02T18:00:00Z',
      durationUnit: 'day',
    });
    expect(zone.ok).toBe(false);
  });

  it('keeps the edge copy aligned and does not price rentals at a fixed 15 percent', () => {
    expect(isReservedRentalPreviewId('00000000-0000-4000-8000-000000000003')).toBe(true);
    expect(isReservedRentalPreviewId('11111111-1111-4111-8111-111111111111')).toBe(false);
    expect(readFileSync('supabase/functions/_shared/rental-server-window.ts', 'utf8')).toBe(
      readFileSync('src/lib/rental-server-window.ts', 'utf8')
    );
    const checkout = readFileSync('supabase/functions/create-booking-checkout-session/index.ts', 'utf8');
    expect(checkout).not.toContain('const commissionBps = 1500');
    expect(checkout).toContain('supplier_active_commercial_terms');
    expect(checkout).toContain('isReservedRentalPreviewId(listingId)');
    const season = readFileSync('supabase/functions/_shared/booking-quote.ts', 'utf8');
    expect(season).toContain("extras.inventoryFamily === 'stay' || extras.inventoryFamily === 'rental'");
  });
});
