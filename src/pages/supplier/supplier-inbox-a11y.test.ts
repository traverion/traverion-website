import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer C: Partner Inbox filter tabs (All/Unread) wire to a tabpanel
 * (SupplierBookings schedule tabpanel parity).
 */
describe('SupplierInbox filter tabpanel', () => {
  it('connects inbox filter tabs to the conversation list tabpanel', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'SupplierInbox.tsx'),
      'utf8'
    );
    expect(src).toMatch(/aria-controls=\{PARTNER_INBOX_TABPANEL_ID\}/);
    expect(src).toMatch(/id=\{PARTNER_INBOX_TABPANEL_ID\}/);
    expect(src).toMatch(/role="tabpanel"/);
    expect(src).toMatch(/aria-labelledby=\{partnerInboxTabId\(unreadOnly\)\}/);
  });
});
