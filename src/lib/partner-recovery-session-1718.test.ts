import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1718: partner-only recovery session survives traveler wipe', () => {
  it('AuthContext skips clearPartnerOnlyTravelerSession while recovery is active', () => {
    const src = readFileSync(resolve(__dirname, '../contexts/AuthContext.tsx'), 'utf8');
    expect(src).toContain('Phase 1718');
    expect(src).toContain('isPasswordRecoveryActive()');
    expect(src).toMatch(
      /if \(!allowed\) \{[\s\S]*isPasswordRecoveryActive\(\)[\s\S]*setUser\(null\)[\s\S]*return;[\s\S]*clearPartnerOnlyTravelerSession/
    );
  });
});
