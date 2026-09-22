import { describe, expect, it } from 'vitest';
import { comparePartnerBookingsOperational } from './partner-bookings-order';

describe('comparePartnerBookingsOperational', () => {
  it('clusters same-day bookings by departure time', () => {
    const rows = [
      { booking_date: '2026-10-01', start_time_hm: '20:00', created_at: 'c' },
      { booking_date: '2026-10-01', start_time_hm: '08:00', created_at: 'a' },
      { booking_date: '2026-10-02', start_time_hm: '09:00', created_at: 'b' },
    ];
    const sorted = [...rows].sort((a, b) => comparePartnerBookingsOperational(a, b));
    expect(sorted.map((r) => `${r.booking_date}|${r.start_time_hm}`)).toEqual([
      '2026-10-01|08:00',
      '2026-10-01|20:00',
      '2026-10-02|09:00',
    ]);
  });

  it('past view prefers later dates first', () => {
    const rows = [
      { booking_date: '2026-09-01', start_time_hm: '10:00', created_at: 'a' },
      { booking_date: '2026-10-01', start_time_hm: '10:00', created_at: 'b' },
    ];
    const sorted = [...rows].sort((a, b) => comparePartnerBookingsOperational(a, b, { pastFirst: true }));
    expect(sorted[0].booking_date).toBe('2026-10-01');
  });
});
