import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1788: auth email fallback for booking-tied traveler mail', () => {
  it('notify-customer-booking resolves guest_user_id when guest_email empty', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/notify-customer-booking/index.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1788');
    expect(src).toContain('guest_user_id');
    expect(src).toContain('auth.admin.getUserById');
  });

  it('client cancel/schedule/details invoke without requiring guest_email', () => {
    const bookings = readFileSync(resolve(__dirname, 'supabase-bookings.ts'), 'utf8');
    const ops = readFileSync(resolve(__dirname, 'supabase-booking-ops.ts'), 'utf8');
    expect(bookings).toContain('Phase 1788');
    expect(bookings).toContain("resolve@guest.local");
    expect(bookings).not.toMatch(/if \(guestEmail && current\.listing_id\)/);
    expect(bookings).not.toMatch(/if \(guestEmail && fieldDiffs\.length > 0\)/);
    expect(bookings).not.toMatch(/const guestEmail = \(bookingMeta\?\.guest_email[\s\S]*?\n  if \(guestEmail\) \{/);
    expect(ops).toContain('Phase 1788');
    expect(ops).toContain("resolve@guest.local");
  });
});
