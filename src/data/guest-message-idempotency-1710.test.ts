import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1710: guest_message / details idempotency suffixes', () => {
  it('Trips note update uses :notes: and :your_details_updated: suffixes', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-bookings.ts'), 'utf8');
    expect(src).toContain('Phase 1710');
    expect(src).toContain('supplier:guest_message:${row.id}:notes:');
    expect(src).toContain('customer:your_details_updated:${row.id}:');
  });

  it('Inbox notifyNewBookingMessage uses :inbox: and new_booking_message suffixes', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-booking-ops.ts'), 'utf8');
    expect(src).toContain('Phase 1710');
    expect(src).toContain('supplier:guest_message:${params.bookingId}:inbox:');
    expect(src).toContain('customer:new_booking_message:${params.bookingId}:');
  });
});
