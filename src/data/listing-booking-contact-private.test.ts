import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('listing_booking_contact migration', () => {
  it('creates private table with editor RLS (no public select)', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/242_listing_booking_contact.sql'),
      'utf8'
    );
    expect(sql).toContain('create table if not exists public.listing_booking_contact');
    expect(sql).toContain('is_supplier_account_editor');
    expect(sql).toContain('enable row level security');
    expect(sql).not.toContain('to anon');
  });
});
