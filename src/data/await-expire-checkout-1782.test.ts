import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1782: await expire unpaid checkout after cancel', () => {
  it('expireUnpaidCancelledCheckout is awaited on cancel paths', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-bookings.ts'), 'utf8');
    expect(src).toContain('Phase 1782');
    expect(src).toContain('async function expireUnpaidCancelledCheckout');
    expect(src).toContain('await expireUnpaidCancelledCheckout(bookingId)');
    expect(src).not.toMatch(/^\s*expireUnpaidCancelledCheckout\(bookingId\);/m);
  });
});
