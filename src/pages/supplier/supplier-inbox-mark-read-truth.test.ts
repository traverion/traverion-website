import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: Partner Inbox must not clear Unread before mark_booking_messages_read succeeds.
 */
describe('SupplierInbox mark-read truth (Phase 1500)', () => {
  it('clears unread via onMarkedRead, not on row click', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'SupplierInbox.tsx'),
      'utf8'
    );
    expect(src).toMatch(/Phase 1500/);
    expect(src).toMatch(/onMarkedRead=\{\(\) => markInboxThreadRead\(b\.id\)\}/);
    expect(src).not.toMatch(/markReadLocal/);
  });

  it('markBookingMessagesRead parses RPC ok (Phase 1500)', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../data/supabase-booking-ops.ts'),
      'utf8'
    );
    const fn = src.slice(src.indexOf('export async function markBookingMessagesRead'));
    expect(fn).toMatch(/parseRpc\(data, error\?\.message/);
  });

  it('BookingMessageThread separates load from mark read (Phase 1500)', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../components/BookingMessageThread.tsx'),
      'utf8'
    );
    expect(src).toMatch(/Phase 1500/);
    expect(src).toMatch(/onMarkedRead\?\.\(\)/);
    expect(src).toMatch(/markReadError/);
  });
});
