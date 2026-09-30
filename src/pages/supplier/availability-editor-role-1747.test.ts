import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1747: Availability role gate + listing-image storage editors', () => {
  it('SupplierAvailability gates writes with canManageBookings', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierAvailability.tsx'), 'utf8');
    expect(src).toContain('Phase 1747');
    expect(src).toContain('canEditCalendar');
    expect(src).toContain('canManageBookings');
    expect(src).toContain('cannot change capacity or blocks');
  });

  it('migration requires is_supplier_account_editor for listing-images writes', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../supabase/migrations/219_listing_images_storage_editor_roles.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1747');
    expect(sql).toContain('is_supplier_account_editor');
    expect(sql).toContain("bucket_id = 'listing-images'");
  });
});
