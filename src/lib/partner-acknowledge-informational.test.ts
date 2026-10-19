import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Acknowledge on Instant Book / confirmed stays is informational only:
 * it stamps acknowledged_at and must not change status or payment_status.
 */
describe('partner Acknowledge is informational', () => {
  it('acknowledgeBooking updates only acknowledged_at', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const src = readFileSync(join(root, 'data/supabase-bookings.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export async function acknowledgeBooking'));
    const body = fn.slice(0, fn.indexOf('export async function', 1));
    expect(body).toMatch(/\.update\(\{\s*acknowledged_at:/);
    expect(body).not.toMatch(/status\s*:/);
    expect(body).not.toMatch(/payment_status\s*:/);
  });

  it('SupplierBookings Acknowledge handler only patches acknowledged_at locally', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const src = readFileSync(join(root, 'pages/supplier/SupplierBookings.tsx'), 'utf8');
    const fn = src.slice(src.indexOf('const handleAcknowledge'));
    const body = fn.slice(0, fn.indexOf('const listingOptions'));
    expect(body).toContain('acknowledgeBooking(booking.id)');
    expect(body).toMatch(/acknowledged_at:\s*new Date\(\)\.toISOString\(\)/);
    expect(body).not.toMatch(/status:\s*['"]confirmed['"]/);
    expect(body).not.toMatch(/payment_status:/);
  });
});
