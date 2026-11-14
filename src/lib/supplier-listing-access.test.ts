import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canManageBookings, effectiveListingRole } from './supplierTeamRoles';

const account = '9e42bd3a-e72c-4472-bb7e-e8c3a59e2c18';
const teammate = '11111111-1111-4111-8111-111111111111';

describe('listing access matches the supplier editor model', () => {
  it('lets owner, manager, and ops create and manage listings', () => {
    for (const role of ['owner', ' manager ', 'OPS'] as const) {
      const resolved = effectiveListingRole({ userId: teammate, supplierId: account, role });
      expect(canManageBookings(resolved)).toBe(true);
    }
  });

  it('keeps finance and viewer read-only, including on the account row', () => {
    for (const role of ['finance', 'viewer'] as const) {
      expect(canManageBookings(effectiveListingRole({ userId: account, supplierId: account, role }))).toBe(false);
      expect(canManageBookings(effectiveListingRole({ userId: teammate, supplierId: account, role }))).toBe(false);
    }
  });

  it('keeps the supplier account as an editor when its role is missing', () => {
    expect(effectiveListingRole({ userId: account, supplierId: account.toUpperCase(), role: null })).toBe('owner');
    expect(effectiveListingRole({ userId: account, supplierId: ` ${account} `, role: '' })).toBe('owner');
  });

  it('does not promote a teammate whose role cannot be read', () => {
    expect(effectiveListingRole({ userId: teammate, supplierId: account, role: null })).toBe('viewer');
    expect(effectiveListingRole({ userId: teammate, supplierId: null, role: undefined })).toBe('viewer');
  });

  it('waits for the partner session and does not demote a loaded editor when the roster list fails', () => {
    const src = readFileSync(resolve(__dirname, '../data/supabase-supplier-team.ts'), 'utf8');
    const waitAt = src.indexOf('await waitForPartnerAccessToken(client)');
    const readAt = src.indexOf('await readCallerMembership(client, currentUserId)');
    expect(waitAt).toBeGreaterThan(-1);
    expect(readAt).toBeGreaterThan(waitAt);
    expect(src).toContain('if (!canManageBookings(role)) throw err');
    expect(src).toContain('data.session?.access_token');
    expect(src).toMatch(/if \(error\) throw new Error\(error\.message\)/);
  });
});
