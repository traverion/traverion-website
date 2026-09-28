import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1633: Partner portal footer Manage trips link', () => {
  it('links Manage trips to traveler bookings', () => {
    const src = readFileSync(resolve(__dirname, 'PartnerPortalFooter.tsx'), 'utf8');
    expect(src).toContain('Phase 1633');
    expect(src).toContain('Manage trips');
    expect(src).toContain('${traveler}/bookings');
  });
});
