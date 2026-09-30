import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1794: await booking-note thread post', () => {
  it('awaits postBookingMessage and surfaces soft warning on failure', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-bookings.ts'), 'utf8');
    expect(src).toContain('Phase 1794');
    expect(src).toMatch(/const thread = await postBookingMessage/);
    expect(src).not.toMatch(/void postBookingMessage\(row\.id/);
    expect(src).toContain('Inbox thread update failed');
  });
});
