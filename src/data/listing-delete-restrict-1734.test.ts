import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1734: listing delete must not wipe bookings', () => {
  it('migration switches bookings.listing_id to ON DELETE RESTRICT', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/213_bookings_listing_delete_restrict.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1734');
    expect(sql).toContain('on delete restrict');
    expect(sql).toContain('bookings_listing_id_fkey');
  });

  it('deleteListing surfaces FK 23503 and UI blocks when bookings exist', () => {
    const data = readFileSync(resolve(__dirname, 'supabase-listings.ts'), 'utf8');
    expect(data).toContain('Phase 1734');
    expect(data).toContain("code === '23503'");
    const ui = readFileSync(resolve(__dirname, '../pages/supplier/SupplierListings.tsx'), 'utf8');
    expect(ui).toContain('Phase 1734');
    expect(ui).toContain('deleteBlockedByBookings');
    expect(ui).toContain('countBookingsForListing');
    expect(ui).not.toContain('Confirmed bookings stay in Bookings.');
  });
});
