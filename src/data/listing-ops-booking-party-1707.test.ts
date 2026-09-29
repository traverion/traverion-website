import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1707: listing ops for unpublished booking-party listings', () => {
  it('migration defines listing_ops_for_booking_party RPC', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/211_listing_ops_for_booking_party.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1707');
    expect(sql).toContain('listing_ops_for_booking_party');
    expect(sql).toContain('security definer');
    expect(sql).toContain('booking_traveler_owns');
  });

  it('fetchListingOpsByIds fills missing ids via party RPC', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-listings.ts'), 'utf8');
    expect(src).toContain('Phase 1707');
    expect(src).toContain("rpc('listing_ops_for_booking_party'");
    expect(src).toContain('fetchListingSupplierMetaForParty');
  });

  it('cancel Accept/Decline does not require both guest_email and supplier_id', () => {
    const bookings = readFileSync(resolve(__dirname, '../pages/MyBookings.tsx'), 'utf8');
    expect(bookings).toContain('Phase 1707');
    expect(bookings).toContain('b.guest_email || ops?.supplier_id');
    expect(bookings).not.toContain('ops?.supplier_id && b.guest_email');

    const ops = readFileSync(resolve(__dirname, 'supabase-booking-ops.ts'), 'utf8');
    expect(ops).toContain('Phase 1707');
    expect(ops).toMatch(/supplierId\?:/);
  });

  it('guest cancel and note update resolve supplier via party helper', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-bookings.ts'), 'utf8');
    expect(src).toContain('fetchListingSupplierMetaForParty');
    expect(src).toContain('Phase 1707');
  });
});
