import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1681: Partner Help includes Listings shortcut', () => {
  it('offers Listings before Bookings', () => {
    const src = readFileSync(resolve(__dirname, 'PartnerHelpPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1681');
    expect(src).toContain('/listings');
    expect(src).toMatch(/Listings[\s\S]*Bookings/);
  });
});
