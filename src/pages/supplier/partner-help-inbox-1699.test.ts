import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1699: Partner Help includes Inbox shortcut', () => {
  it('offers Inbox after Bookings', () => {
    const src = readFileSync(resolve(__dirname, 'PartnerHelpPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1699');
    expect(src).toContain('/inbox');
    expect(src).toMatch(/Bookings[\s\S]*Inbox[\s\S]*Money/);
  });
});
