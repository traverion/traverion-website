import { describe, expect, it } from 'vitest';
import type { RentalDetails, RentalVariant } from '../types/rental';
import {
  filterValidPickupTimes,
  humanizeRentalAvailabilityError,
  rentalPickupDayUnavailable,
} from './rental-pdp-slot-guide';

const variant: RentalVariant = {
  id: 'cam-std',
  name: 'Standard',
  quantity: 1,
  pricePerHourMinor: 2000,
  pricePerDayMinor: 10000,
  minDurationHours: 1,
  maxDurationHours: 72,
  minDurationDays: 1,
  maxDurationDays: 14,
  durationMode: 'both',
};

const rental: RentalDetails = {
  category: 'cameras_electronics',
  itemType: 'Camera',
  durationMode: 'both',
  bookingNoticeHours: 0,
  bufferMinutes: 60,
  minDurationHours: 1,
  maxDurationHours: 72,
  minDurationDays: 1,
  maxDurationDays: 14,
  operatingDays: [
    {
      day: 'fri',
      open: true,
      earliestPickupHm: '09:00',
      latestPickupHm: '17:00',
      earliestReturnHm: '09:00',
      latestReturnHm: '17:00',
    },
    {
      day: 'sat',
      open: true,
      earliestPickupHm: '09:00',
      latestPickupHm: '17:00',
      earliestReturnHm: '09:00',
      latestReturnHm: '17:00',
    },
  ],
  variants: [variant],
};

describe('rental PDP slot guide (Sony-style turnaround)', () => {
  // 2026-10-31 is Saturday after EU DST end → Europe/Helsinki is EET (UTC+2).
  // Customer return 11:00 + 60m prep → hold ends_at 12:00 local = 10:00Z.

  it('humanizes insufficient_stock without raw underscores', () => {
    expect(humanizeRentalAvailabilityError('insufficient_stock')).toMatch(/No units available/i);
    expect(humanizeRentalAvailabilityError('insufficient_stock')).not.toContain('_');
  });

  it('auto-skips pickup times until previous return + buffer', () => {
    const snapshot = {
      bufferMinutes: 60,
      occupancies: [
        {
          variantId: 'cam-std',
          quantity: 1,
          startsAt: '2026-10-30T06:00:00.000Z',
          endsAt: '2026-10-31T10:00:00.000Z', // 12:00 Helsinki (return 11:00 + 60m)
        },
      ],
      blocks: [],
    };

    const candidates = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
    const valid = filterValidPickupTimes({
      rental,
      variant,
      quantity: 1,
      startDate: '2026-10-31',
      durationUnit: 'hour',
      timeZone: 'Europe/Helsinki',
      nowMs: Date.parse('2026-10-20T10:00:00.000Z'),
      snapshot,
      candidatePickupHms: candidates,
    });

    expect(valid[0]).toBe('12:00');
    expect(valid).not.toContain('09:00');
    expect(valid).not.toContain('11:00');
    expect(valid).toContain('12:00');
  });

  it('disables a day only when no feasible pickup remains', () => {
    const snapshot = {
      bufferMinutes: 0,
      occupancies: [
        {
          variantId: 'cam-std',
          quantity: 1,
          startsAt: '2026-10-31T06:00:00.000Z',
          endsAt: '2026-10-31T15:00:00.000Z', // through 17:00 Helsinki (EET)
        },
      ],
      blocks: [],
    };
    expect(
      rentalPickupDayUnavailable({
        rental,
        variant,
        quantity: 1,
        ymd: '2026-10-31',
        durationUnit: 'hour',
        timeZone: 'Europe/Helsinki',
        nowMs: Date.parse('2026-10-20T10:00:00.000Z'),
        snapshot,
      })
    ).toBe(true);

    expect(
      rentalPickupDayUnavailable({
        rental,
        variant,
        quantity: 1,
        ymd: '2026-10-31',
        durationUnit: 'hour',
        timeZone: 'Europe/Helsinki',
        nowMs: Date.parse('2026-10-20T10:00:00.000Z'),
        snapshot: {
          bufferMinutes: 60,
          occupancies: [
            {
              variantId: 'cam-std',
              quantity: 1,
              startsAt: '2026-10-30T06:00:00.000Z',
              endsAt: '2026-10-31T10:00:00.000Z',
            },
          ],
          blocks: [],
        },
      })
    ).toBe(false);
  });

  it('allows quantity 1 of 3 when two units are reserved', () => {
    const multi: RentalVariant = { ...variant, quantity: 3 };
    const snapshot = {
      bufferMinutes: 0,
      occupancies: [
        {
          variantId: 'cam-std',
          quantity: 2,
          startsAt: '2026-10-31T06:00:00.000Z',
          endsAt: '2026-10-31T14:00:00.000Z',
        },
      ],
      blocks: [],
    };
    const valid = filterValidPickupTimes({
      rental: { ...rental, variants: [multi] },
      variant: multi,
      quantity: 1,
      startDate: '2026-10-31',
      durationUnit: 'hour',
      timeZone: 'Europe/Helsinki',
      nowMs: Date.parse('2026-10-20T10:00:00.000Z'),
      snapshot,
      candidatePickupHms: ['10:00', '12:00'],
    });
    expect(valid.length).toBeGreaterThan(0);

    const blocked = filterValidPickupTimes({
      rental: { ...rental, variants: [multi] },
      variant: multi,
      quantity: 2,
      startDate: '2026-10-31',
      durationUnit: 'hour',
      timeZone: 'Europe/Helsinki',
      nowMs: Date.parse('2026-10-20T10:00:00.000Z'),
      snapshot,
      candidatePickupHms: ['10:00', '12:00'],
    });
    expect(blocked).toEqual([]);
  });
});
