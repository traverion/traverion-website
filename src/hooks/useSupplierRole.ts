import { useCallback, useMemo } from 'react';
import type { SupplierRole, SupplierTeamMember } from '../lib/supplierTeamRoles';

/**
 * Team/roles are disabled for now: the signed-in user is always treated as the account owner.
 * (Previously, missing `supplier_team_members` rows defaulted to `viewer` and blocked finance UI.)
 */
export function useSupplierRole(): {
  role: SupplierRole;
  members: SupplierTeamMember[];
  refresh: () => Promise<void>;
} {
  const refresh = useCallback(async () => {}, []);

  return useMemo(
    () => ({
      role: 'owner',
      members: [],
      refresh,
    }),
    [refresh]
  );
}
