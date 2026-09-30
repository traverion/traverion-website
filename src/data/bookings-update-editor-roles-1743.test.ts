import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canManageBookings } from '../lib/supplierTeamRoles';

describe('Phase 1743: bookings UPDATE requires editor team roles', () => {
  it('canManageBookings excludes finance and viewer', () => {
    expect(canManageBookings('owner')).toBe(true);
    expect(canManageBookings('manager')).toBe(true);
    expect(canManageBookings('ops')).toBe(true);
    expect(canManageBookings('finance')).toBe(false);
    expect(canManageBookings('viewer')).toBe(false);
  });

  it('migration defines is_listing_supplier_bookings_editor and UPDATE policy', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/215_bookings_update_editor_roles.sql'),
      'utf8'
    );
    expect(sql).toContain('is_listing_supplier_bookings_editor');
    expect(sql).toContain("'owner', 'manager', 'ops'");
    expect(sql).toContain('is_listing_supplier_bookings_editor(bookings.listing_id)');
  });

  it('client booking writers detect zero-row RLS updates', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-bookings.ts'), 'utf8');
    expect(src).toContain('Phase 1743');
    expect(src).toContain("select('id')");
    expect(src).toContain('You do not have permission to update this booking.');
    expect(src).toMatch(/acknowledgeBooking[\s\S]*!!data\?\.id/);
  });
});
