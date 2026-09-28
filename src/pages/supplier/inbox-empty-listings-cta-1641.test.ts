import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1641: Inbox empty offers Your listings', () => {
  it('adds a listings CTA beside Open bookings', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierInbox.tsx'), 'utf8');
    expect(src).toContain('Phase 1641');
    expect(src).toContain('Your listings');
    expect(src).toMatch(/PARTNER_APP_BASE\}\/listings/);
  });
});
