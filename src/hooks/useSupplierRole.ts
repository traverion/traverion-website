import { useSupplierRoleContext } from '../contexts/SupplierRoleContext';
import type { SupplierRole, SupplierTeamMember } from '../lib/supplierTeamRoles';
import type { SupplierRoleStatus } from '../contexts/SupplierRoleContext';

/**
 * Phase 1748: resolve the signed-in partner's real supplier_team_members role.
 * Phase 1857: shared SupplierRoleProvider — remounts no longer flash viewer / strip create.
 */
export function useSupplierRole(): {
  role: SupplierRole;
  members: SupplierTeamMember[];
  roleStatus: SupplierRoleStatus;
  refresh: () => Promise<void>;
} {
  return useSupplierRoleContext();
}
