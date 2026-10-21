import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Partner Inbox list message prefetch', () => {
  it('loads only the latest message per booking for the thread list', () => {
    const ops = readFileSync(resolve(__dirname, 'supabase-booking-ops.ts'), 'utf8');
    const inbox = readFileSync(resolve(__dirname, '../pages/supplier/SupplierInbox.tsx'), 'utf8');
    const dash = readFileSync(resolve(__dirname, '../pages/supplier/SupplierDashboard.tsx'), 'utf8');
    expect(ops).toContain('export async function fetchLatestBookingMessage');
    expect(ops).toContain('.limit(1)');
    expect(inbox).toContain('fetchLatestBookingMessage');
    expect(inbox).not.toContain('fetchBookingMessages(b.id)');
    expect(dash).toContain('fetchLatestBookingMessage');
    expect(dash).not.toContain('fetchBookingMessages(b.id)');
  });
});
