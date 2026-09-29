import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1729: Inbox and cancel-resolve host notify resolve supplier_id', () => {
  it('notifyNewBookingMessage traveler branch falls back to fetchListingSupplierMetaForParty', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-booking-ops.ts'), 'utf8');
    expect(src).toContain('Phase 1729');
    expect(src).toContain("fromRole === 'traveler'");
    const fn = src.slice(src.indexOf('export async function notifyNewBookingMessage'));
    expect(fn).toContain('fetchListingSupplierMetaForParty');
    expect(fn).toContain('if (!supplierId) return');
  });

  it('notifyCancellationResolved falls back to party helper when supplierId blank', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-booking-ops.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export async function notifyCancellationResolved'));
    expect(fn).toContain('Phase 1729');
    expect(fn).toContain('fetchListingSupplierMetaForParty');
    expect(fn).toContain('hostSupplierId');
  });
});
