import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('review anonymity public vs supplier', () => {
  it('public listing fetch uses reviews_public (no user_id / booking_id)', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-reviews.ts'), 'utf8');
    const start = src.indexOf('export async function fetchReviewsByListingId');
    const end = src.indexOf('export function aggregateReviewRatings', start);
    const fn = src.slice(start, end > start ? end : start + 800);
    expect(fn).toContain("from('reviews_public')");
    expect(fn).not.toMatch(/from\('reviews'\)/);
    expect(fn).toContain('verified');
  });

  it('supplier fetch joins booking party fields for authorized identity', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-reviews.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export async function fetchReviewsForSupplierListings'));
    expect(fn).toContain('bookings:booking_id');
    expect(fn).toContain('booking_guest_name');
    expect(fn).toContain('booking_reference');
  });

  it('Supplier Reviews uses supplier customer name, not public anonymous label alone', () => {
    const page = readFileSync(resolve(__dirname, '../pages/supplier/SupplierReviews.tsx'), 'utf8');
    expect(page).toContain('supplierReviewCustomerName');
    expect(page).toContain('SUPPLIER_ANONYMOUS_PUBLIC_NOTE');
    expect(page).toContain('booking_reference');
    expect(page).not.toMatch(/displayReviewGuestName\(r\)/);
  });

  it('migration enforces anonymous guest_name and exposes reviews_public', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/281_reviews_anonymity_supplier_party.sql'),
      'utf8'
    );
    expect(sql).toContain('reviews_enforce_anonymous_guest_name');
    expect(sql).toContain('create or replace view public.reviews_public');
    expect(sql).toContain('Anonymous traveler');
  });
});
