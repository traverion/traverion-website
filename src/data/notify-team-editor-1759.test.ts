import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { supplierTeamRoleIsEditor } from '../lib/notify-customer-booking-auth';

describe('Phase 1759: notify team auth requires editor roles', () => {
  it('supplierTeamRoleIsEditor matches canManageBookings', () => {
    expect(supplierTeamRoleIsEditor('owner')).toBe(true);
    expect(supplierTeamRoleIsEditor('manager')).toBe(true);
    expect(supplierTeamRoleIsEditor('ops')).toBe(true);
    expect(supplierTeamRoleIsEditor('finance')).toBe(false);
    expect(supplierTeamRoleIsEditor('viewer')).toBe(false);
    expect(supplierTeamRoleIsEditor(null)).toBe(false);
  });

  it('customer and supplier notify edges select role and gate team membership', () => {
    const customer = readFileSync(
      resolve(__dirname, '../../supabase/functions/notify-customer-booking/index.ts'),
      'utf8'
    );
    expect(customer).toContain('Phase 1759');
    expect(customer).toContain('supplierTeamRoleIsEditor');
    expect(customer).toContain("select('user_id, role')");

    const supplier = readFileSync(
      resolve(__dirname, '../../supabase/functions/notify-supplier-event/index.ts'),
      'utf8'
    );
    expect(supplier).toContain('Phase 1759');
    expect(supplier).toContain('supplierTeamRoleIsEditor');
    expect(supplier).toContain("select('user_id, role')");
  });
});
