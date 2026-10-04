import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchSupplierTeamMembers } from '../data/supabase-supplier-team';
import type { SupplierRole, SupplierTeamMember } from '../lib/supplierTeamRoles';
import { useSupplierAuth } from './SupplierAuthContext';

export type SupplierRoleStatus = 'loading' | 'ready' | 'error';

type SupplierRoleContextValue = {
  role: SupplierRole;
  members: SupplierTeamMember[];
  /** Phase 1857: roster resolve state — do not treat loading as viewer for create/edit gates. */
  roleStatus: SupplierRoleStatus;
  refresh: () => Promise<void>;
};

const SupplierRoleContext = createContext<SupplierRoleContextValue | null>(null);

/**
 * Phase 1857: one shared roster for the partner shell.
 * Per-page useSupplierRole state remounted as viewer and stripped ?create= before owner loaded.
 */
export function SupplierRoleProvider({ children }: { children: React.ReactNode }) {
  const { user, isSupabase, loading: authLoading } = useSupplierAuth();
  const [members, setMembers] = useState<SupplierTeamMember[]>([]);
  // Phase 1775: fail closed — never start as owner before roster loads.
  const [role, setRole] = useState<SupplierRole>('viewer');
  const [roleStatus, setRoleStatus] = useState<SupplierRoleStatus>('loading');
  const loadedForUserRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (authLoading) {
      setRoleStatus('loading');
      return;
    }
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setMembers([]);
      setRole('viewer');
      loadedForUserRef.current = null;
      setRoleStatus('ready');
      return;
    }
    const switchingUser = loadedForUserRef.current !== uid;
    if (switchingUser) {
      setRole('viewer');
      setRoleStatus('loading');
    }
    try {
      const roster = await fetchSupplierTeamMembers(uid);
      setMembers(roster);
      const mine = roster.find((m) => m.id === uid);
      setRole(mine?.role ?? 'viewer');
      loadedForUserRef.current = uid;
      setRoleStatus('ready');
    } catch {
      // Phase 1775: transient failure → viewer (do not keep a forged owner window).
      setRole('viewer');
      loadedForUserRef.current = uid;
      setRoleStatus('error');
    }
  }, [authLoading, isSupabase, user?.id]);

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

  const value = useMemo(
    () => ({ role, members, roleStatus, refresh }),
    [role, members, roleStatus, refresh]
  );

  return <SupplierRoleContext.Provider value={value}>{children}</SupplierRoleContext.Provider>;
}

export function useSupplierRoleContext(): SupplierRoleContextValue {
  const ctx = useContext(SupplierRoleContext);
  if (!ctx) throw new Error('useSupplierRole must be used within SupplierRoleProvider');
  return ctx;
}
