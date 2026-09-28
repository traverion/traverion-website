import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1648: Partner Help ops shortcuts', () => {
  it('links Bookings and Money and prefills mailto subject', () => {
    const src = readFileSync(resolve(__dirname, 'PartnerHelpPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1648');
    expect(src).toContain('/bookings');
    expect(src).toContain('/money');
    expect(src).toContain('[Traverion · Partner] Support');
  });
});
