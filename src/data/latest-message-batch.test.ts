import { describe, expect, it } from 'vitest';
import { latestMessageByBooking, type BookingMessageRow } from './supabase-booking-ops';

function row(bookingId: string, createdAt: string): BookingMessageRow {
  return {
    id: `${bookingId}-${createdAt}`,
    booking_id: bookingId,
    sender_role: 'traveler',
    sender_user_id: null,
    body: createdAt,
    created_at: createdAt,
    read_by_traveler_at: null,
    read_by_supplier_at: null,
  };
}

describe('latestMessageByBooking', () => {
  it('keeps the first row for each booking when rows are newest-first', () => {
    const latest = latestMessageByBooking([
      row('a', '2026-11-14T12:00:00Z'),
      row('b', '2026-11-14T11:00:00Z'),
      row('a', '2026-11-13T09:00:00Z'),
    ]);
    expect(latest.get('a')?.created_at).toBe('2026-11-14T12:00:00Z');
    expect(latest.get('b')?.created_at).toBe('2026-11-14T11:00:00Z');
    expect(latest.size).toBe(2);
  });
});
