import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1764: expire-booking-checkout requires editor team roles', () => {
  it('edge selects role and uses supplierTeamRoleIsEditor', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/expire-booking-checkout/index.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1764');
    expect(src).toContain('supplierTeamRoleIsEditor');
    expect(src).toContain("select('user_id, role')");
  });
});
