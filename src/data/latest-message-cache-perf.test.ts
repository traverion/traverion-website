import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('latest booking message cache', () => {
  it('coalesces Dashboard/Inbox latest-row fetches and invalidates on write', () => {
    const ops = readFileSync(resolve(__dirname, 'supabase-booking-ops.ts'), 'utf8');
    expect(ops).toContain('latestMessageCache');
    expect(ops).toContain('invalidateLatestBookingMessageCache');
    expect(ops).toMatch(/if \(result\.ok\) invalidateLatestBookingMessageCache/);
  });

  it('Inbox soft-refreshes and reuses desk prefetch', () => {
    const inbox = readFileSync(resolve(__dirname, '../pages/supplier/SupplierInbox.tsx'), 'utf8');
    expect(inbox).toContain('takePartnerBookingsDeskPrefetch');
    expect(inbox).toContain('softRefresh');
    expect(inbox).toContain('bookingsLenRef');
  });
});
