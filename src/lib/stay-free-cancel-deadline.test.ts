import { describe, expect, it } from 'vitest';
import { TRAVERION_STANDARD_CANCELLATION_POLICY } from '../types/listingExtras';
import { stayCheckInHmForDate, stayFreeCancelDeadlineCopy } from './stay-free-cancel-deadline';

describe('stayFreeCancelDeadlineCopy', () => {
  it('returns null when the listing does not show free cancellation', () => {
    expect(
      stayFreeCancelDeadlineCopy({
        stay: { tags: [], cancellationPolicy: 'Custom strict policy' },
        checkIn: '2026-10-26',
        checkInHm: '15:00',
        departureTimezone: 'Europe/Helsinki',
      })
    ).toBeNull();
  });

  it('does not invent a clock deadline without a known check-in time', () => {
    expect(
      stayFreeCancelDeadlineCopy({
        stay: { tags: ['free-cancellation'], cancellationPolicy: TRAVERION_STANDARD_CANCELLATION_POLICY },
        checkIn: '2026-10-26',
        checkInHm: null,
        departureTimezone: 'Europe/Helsinki',
      })
    ).toBe('Free cancellation up to 24 hours before check-in (property local time).');
  });

  it('formats an exact deadline 24h before known check-in', () => {
    const copy = stayFreeCancelDeadlineCopy({
      stay: { tags: ['free-cancellation'], cancellationPolicy: TRAVERION_STANDARD_CANCELLATION_POLICY },
      checkIn: '2026-10-26',
      checkInHm: '15:00',
      departureTimezone: 'Europe/Helsinki',
    });
    expect(copy).toMatch(/Free cancellation until/i);
    expect(copy).toMatch(/15:00/);
    expect(copy).toMatch(/25/);
  });

  it('resolves season check-in HH:MM for the stay night', () => {
    expect(
      stayCheckInHmForDate(
        {
          checkInTime: '14:00',
          seasons: [
            {
              id: 's1',
              name: 'Peak',
              start: '2026-10-01',
              end: '2026-10-31',
              enabled: true,
              checkIn: '16:30',
              checkOut: '11:00',
              nightlyPrice: 88,
              minNights: 1,
            },
          ],
        },
        '2026-10-26'
      )
    ).toBe('16:30');
  });
});
