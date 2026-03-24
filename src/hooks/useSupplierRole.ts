import { useEffect, useMemo, useState } from 'react';
import { useSupplierAuth } from '../contexts/SupplierAuthContext';
import {
  type SupplierRole,
  type SupplierTeamMember,
} from '../lib/supplierTeamRoles';
import { fetchSupplierTeamMembers } from '../data/supabase-supplier-team';

export function useSupplierRole(): {
  role: SupplierRole;
  members: SupplierTeamMember[];
  refresh: () => Promise<void>;
} {
  const { user } = useSupplierAuth();
  const userId = user?.id ?? 'local-supplier';

  const [members, setMembers] = useState<SupplierTeamMember[]>([]);
  const refresh = async () => {
    const next = await fetchSupplierTeamMembers(userId);
    setMembers(next);
  };

  useEffect(() => {
    refresh();
  }, [userId]);

  useEffect(() => {
    const onChange = () => {
      refresh();
    };
    window.addEventListener('traverion-supplier-team-roles', onChange);
    return () => window.removeEventListener('traverion-supplier-team-roles', onChange);
  }, []);

  return useMemo(() => {
    const role = members.find((m) => m.id === userId)?.role ?? 'viewer';
    return {
      role,
      members,
      refresh,
    };
  }, [userId, members]);
}

