import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1766: guest note updates post Inbox thread message', () => {
  it('updateGuestBookingSpecialRequests posts postBookingMessage after note diffs', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-bookings.ts'), 'utf8');
    expect(src).toContain('Phase 1766');
    expect(src).toContain("from './supabase-booking-ops'");
    expect(src).toContain('postBookingMessage');
    expect(src).toContain('Updated booking details:');
    const fn = src.slice(
      src.indexOf('export async function updateGuestBookingSpecialRequests'),
      src.indexOf('export async function fetchBookingsForSupplier')
    );
    expect(fn).toContain('postBookingMessage');
    expect(fn).toContain('fieldDiffs.length > 0');
  });
});
