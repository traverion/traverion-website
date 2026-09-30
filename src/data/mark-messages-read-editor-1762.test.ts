import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1762: mark_booking_messages_read editor roles', () => {
  it('migration stamps supplier read only for bookings editors', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/226_mark_messages_read_editor_roles.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1762');
    expect(sql).toContain('is_listing_supplier_bookings_editor');
    expect(sql).toContain('is_listing_supplier_side');
    expect(sql).toContain('finance/viewer can read without clearing host Unread');
  });
});
