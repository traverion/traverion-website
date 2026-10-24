import { describe, expect, it } from 'vitest';
import {
  evaluateRentalAvailability,
  intervalsOverlap,
  occupiedWindowWithBuffer,
} from './rental-availability';

describe('rental availability intervals', () => {
  it('uses half-open overlap semantics', () => {
    expect(intervalsOverlap({ startMs: 0, endMs: 10 }, { startMs: 10, endMs: 20 })).toBe(false);
    expect(intervalsOverlap({ startMs: 0, endMs: 11 }, { startMs: 10, endMs: 20 })).toBe(true);
  });

  it('places buffer after return', () => {
    const w = occupiedWindowWithBuffer({ startMs: 0, endMs: 60_000 }, 30);
    expect(w.endMs).toBe(60_000 + 30 * 60_000);
  });

  it('allows booking when stock remains after overlapping reservation', () => {
    const pickup = Date.parse('2026-12-01T09:00:00Z');
    const ret = Date.parse('2026-12-03T18:00:00Z');
    const result = evaluateRentalAvailability({
      variantId: 'm',
      stock: 5,
      requestedQty: 2,
      pickupReturn: { startMs: pickup, endMs: ret },
      bufferMinutes: 60,
      bookingNoticeHours: 0,
      nowMs: Date.parse('2026-11-01T00:00:00Z'),
      blocks: [],
      occupancies: [
        {
          variantId: 'm',
          quantity: 3,
          interval: { startMs: pickup, endMs: ret + 60 * 60_000 },
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.available).toBe(2);
  });

  it('rejects last-unit double booking when stock is exhausted', () => {
    const pickup = Date.parse('2026-12-01T09:00:00Z');
    const ret = Date.parse('2026-12-02T18:00:00Z');
    const result = evaluateRentalAvailability({
      variantId: 'm',
      stock: 1,
      requestedQty: 1,
      pickupReturn: { startMs: pickup, endMs: ret },
      bufferMinutes: 0,
      bookingNoticeHours: 0,
      nowMs: Date.parse('2026-11-01T00:00:00Z'),
      blocks: [],
      occupancies: [{ variantId: 'm', quantity: 1, interval: { startMs: pickup, endMs: ret } }],
    });
    expect(result.ok).toBe(false);
    expect(result.available).toBe(0);
  });

  it('rejects supplier-blocked intervals', () => {
    const pickup = Date.parse('2026-12-24T09:00:00Z');
    const ret = Date.parse('2026-12-26T18:00:00Z');
    const result = evaluateRentalAvailability({
      variantId: 'm',
      stock: 5,
      requestedQty: 1,
      pickupReturn: { startMs: pickup, endMs: ret },
      bufferMinutes: 0,
      bookingNoticeHours: 0,
      nowMs: Date.parse('2026-11-01T00:00:00Z'),
      blocks: [{ startMs: Date.parse('2026-12-24T00:00:00Z'), endMs: Date.parse('2026-12-27T00:00:00Z') }],
      occupancies: [],
    });
    expect(result.ok).toBe(false);
  });

  it('enforces booking notice', () => {
    const now = Date.parse('2026-12-01T08:00:00Z');
    const result = evaluateRentalAvailability({
      variantId: 'm',
      stock: 5,
      requestedQty: 1,
      pickupReturn: { startMs: now + 30 * 60_000, endMs: now + 4 * 3_600_000 },
      bufferMinutes: 0,
      bookingNoticeHours: 2,
      nowMs: now,
      blocks: [],
      occupancies: [],
    });
    expect(result.ok).toBe(false);
  });
});
