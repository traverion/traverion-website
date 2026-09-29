import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1698: Bookings empty pairs New listing with Your listings', () => {
  it('uses dual create + listings escapes', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1698');
    expect(src).toMatch(/No bookings yet[\s\S]*New listing[\s\S]*Your listings/);
  });
});
