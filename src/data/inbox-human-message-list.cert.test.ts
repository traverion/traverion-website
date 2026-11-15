import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Inbox lists human chat only (system notices stay in-thread)', () => {
  it('latest_booking_messages RPC excludes system senders', () => {
    const sql = readFileSync(
      resolve(
        __dirname,
        '../../supabase/migrations/20261115000500_latest_booking_messages_human_only.sql'
      ),
      'utf8'
    );
    expect(sql).toContain("m.sender_role in ('traveler', 'supplier')");
    expect(sql).toMatch(/system notices are excluded|System notices/i);
  });

  it('client fallback and inbox filter use human senders', () => {
    const ops = readFileSync(resolve(__dirname, 'supabase-booking-ops.ts'), 'utf8');
    const inbox = readFileSync(resolve(__dirname, '../pages/supplier/SupplierInbox.tsx'), 'utf8');
    const auth = readFileSync(resolve(__dirname, '../lib/messaging-authorization.ts'), 'utf8');
    expect(ops).toContain(".in('sender_role', ['traveler', 'supplier'])");
    expect(auth).toContain('isHumanBookingMessageSender');
    expect(inbox).toContain('isHumanBookingMessageSender(mergedLasts[b.id]?.sender_role)');
    expect(inbox).toContain('isHumanBookingMessageSender(lastByBooking[b.id]?.sender_role)');
  });
});
