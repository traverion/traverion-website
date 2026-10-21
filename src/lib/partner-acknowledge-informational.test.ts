import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * acknowledgeBooking remains for data compatibility, but supplier Bookings UI
 * no longer requires or exposes acknowledgement for confirmed bookings.
 */
describe('partner Acknowledge API vs Bookings UI', () => {
  it('acknowledgeBooking updates only acknowledged_at', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const src = readFileSync(join(root, 'data/supabase-bookings.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export async function acknowledgeBooking'));
    const body = fn.slice(0, fn.indexOf('export async function', 1));
    expect(body).toMatch(/\.update\(\{\s*acknowledged_at:/);
    expect(body).not.toMatch(/status\s*:/);
    expect(body).not.toMatch(/payment_status\s*:/);
  });

  it('SupplierBookings no longer exposes Acknowledge actions', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const src = readFileSync(join(root, 'pages/supplier/SupplierBookings.tsx'), 'utf8');
    expect(src).not.toContain('handleAcknowledge');
    expect(src).not.toContain('acknowledgeBooking');
    expect(src).not.toContain('Acknowledge');
    expect(src).not.toContain('Mark as reviewed');
    expect(src).not.toContain('waiting for acknowledgement');
  });
});
