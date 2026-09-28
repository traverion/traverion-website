import { describe, expect, it } from 'vitest';
import { passwordRecoveryPortalFromAccess } from './recoveryPortal';

describe('passwordRecoveryPortalFromAccess', () => {
  it('routes supplier profile and team members to partner, not traveler', () => {
    expect(
      passwordRecoveryPortalFromAccess({ hasSupplierProfile: true, hasTeamMembership: false })
    ).toBe('partner');
    expect(
      passwordRecoveryPortalFromAccess({ hasSupplierProfile: false, hasTeamMembership: true })
    ).toBe('partner');
    expect(
      passwordRecoveryPortalFromAccess({ hasSupplierProfile: true, hasTeamMembership: true })
    ).toBe('partner');
  });

  it('routes accounts without supplier-side access to traveler', () => {
    expect(
      passwordRecoveryPortalFromAccess({ hasSupplierProfile: false, hasTeamMembership: false })
    ).toBe('traveler');
  });

  it('does not invent traveler when supplier-side lookups failed', () => {
    expect(
      passwordRecoveryPortalFromAccess({
        hasSupplierProfile: false,
        hasTeamMembership: false,
        supplierLookupFailed: true,
      })
    ).toBe('unavailable');
    expect(
      passwordRecoveryPortalFromAccess({
        hasSupplierProfile: false,
        hasTeamMembership: false,
        teamLookupFailed: true,
      })
    ).toBe('unavailable');
  });

  it('still prefers partner when a supplier signal succeeded despite another lookup failing', () => {
    expect(
      passwordRecoveryPortalFromAccess({
        hasSupplierProfile: false,
        hasTeamMembership: true,
        supplierLookupFailed: true,
      })
    ).toBe('partner');
  });
});
