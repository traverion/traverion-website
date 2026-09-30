import { useCallback, useEffect, useState } from 'react';
import { useSupplierAuth } from '../contexts/SupplierAuthContext';
import { fetchSupplierTeamMembers } from '../data/supabase-supplier-team';
import type { SupplierRole, SupplierTeamMember } from '../lib/supplierTeamRoles';

/**
 * Phase 1748: resolve the signed-in partner's real supplier_team_members role.
 * Previously always returned `owner`, so canManageBookings UI gates were inert
 * while RLS (1743–1747) already enforced editor roles.
 */
export function useSupplierRole(): {
  role: SupplierRole;
  members: SupplierTeamMember[];
  refresh: () => Promise<void>;
} {
  const { user, isSupabase } = useSupplierAuth();
  const [members, setMembers] = useState<SupplierTeamMember[]>([]);
  // Phase 1775: fail closed — never start as owner before roster loads (export/editor gates).
  const [role, setRole] = useState<SupplierRole>('viewer');

  const refresh = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setMembers([]);
      setRole('viewer');
      return;
    }
    try {
      const roster = await fetchSupplierTeamMembers(uid);
      setMembers(roster);
      const mine = roster.find((m) => m.id === uid);
      setRole(mine?.role ?? 'viewer');
    } catch {
      // Phase 1775: transient failure → viewer (do not keep a forged owner window).
      setRole('viewer');
    }
  }, [isSupabase, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onRoles = () => {
      void refresh();
    };
    window.addEventListener('traverion-supplier-team-roles', onRoles);
    return () => window.removeEventListener('traverion-supplier-team-roles', onRoles);
  }, [refresh]);

  return { role, members, refresh };
}
