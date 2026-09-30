import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1752: host booking chat requires editor roles', () => {
  it('migration gates supplier posts with is_listing_supplier_bookings_editor', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../supabase/migrations/223_post_booking_message_editor_roles.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1752');
    expect(sql).toContain('is_listing_supplier_bookings_editor');
    expect(sql).toContain('cannot send them');
  });

  it('Inbox and Bookings gate compose with canManageBookings', () => {
    const inbox = readFileSync(resolve(__dirname, 'SupplierInbox.tsx'), 'utf8');
    expect(inbox).toContain('Phase 1752');
    expect(inbox).toContain('canManageBookings');
    expect(inbox).toContain("composeBlock={");
    expect(inbox).toContain("'role'");

    const bookings = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(bookings).toContain('Phase 1752');
    expect(bookings).toContain('canEditBookings &&');
    expect(bookings).toContain("'role'");

    const thread = readFileSync(resolve(__dirname, '../../components/BookingMessageThread.tsx'), 'utf8');
    expect(thread).toContain("composeBlock === 'role'");
    expect(thread).toContain('Read-only for your role');
  });
});
