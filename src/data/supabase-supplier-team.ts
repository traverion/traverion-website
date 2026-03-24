import { supabase } from '../lib/supabase';
import {
  loadSupplierTeam,
  saveSupplierTeam,
  type SupplierRole,
  type SupplierTeamMember,
} from '../lib/supplierTeamRoles';

type TeamRow = {
  supplier_id: string;
  user_id: string;
  label: string | null;
  role: SupplierRole;
  created_at: string;
};

function dispatchRoleEvent() {
  window.dispatchEvent(new CustomEvent('traverion-supplier-team-roles'));
}

async function resolveSupplierId(currentUserId: string): Promise<string> {
  if (!supabase) return currentUserId;
  const { data } = await supabase
    .from('supplier_team_members')
    .select('supplier_id')
    .eq('user_id', currentUserId)
    .limit(1)
    .maybeSingle();
  return data?.supplier_id ?? currentUserId;
}

async function ensureOwnerMembership(currentUserId: string): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase
    .from('supplier_team_members')
    .select('supplier_id, user_id')
    .eq('user_id', currentUserId)
    .limit(1)
    .maybeSingle();
  if (data) return;
  await supabase.from('supplier_team_members').insert({
    supplier_id: currentUserId,
    user_id: currentUserId,
    label: 'Primary account',
    role: 'owner',
  });
}

export async function fetchSupplierTeamMembers(currentUserId: string): Promise<SupplierTeamMember[]> {
  if (!supabase) return loadSupplierTeam(currentUserId).members;
  await ensureOwnerMembership(currentUserId);
  const supplierId = await resolveSupplierId(currentUserId);
  const { data, error } = await supabase
    .from('supplier_team_members')
    .select('supplier_id, user_id, label, role, created_at')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: true });
  if (error) {
    return loadSupplierTeam(currentUserId).members;
  }
  return ((data ?? []) as TeamRow[]).map((r) => ({
    id: r.user_id,
    label: r.label ?? r.user_id,
    role: r.role,
    createdAt: r.created_at,
  }));
}

export async function upsertSupplierTeamMember(
  currentUserId: string,
  member: { id: string; label: string; role: SupplierRole }
): Promise<boolean> {
  if (!supabase) {
    const current = loadSupplierTeam(currentUserId).members;
    const next = [
      ...current.filter((m) => m.id !== member.id),
      { id: member.id, label: member.label || member.id, role: member.role, createdAt: new Date().toISOString() },
    ];
    saveSupplierTeam({ members: next });
    dispatchRoleEvent();
    return true;
  }
  await ensureOwnerMembership(currentUserId);
  const supplierId = await resolveSupplierId(currentUserId);
  const { error } = await supabase.from('supplier_team_members').upsert(
    {
      supplier_id: supplierId,
      user_id: member.id,
      label: member.label || member.id,
      role: member.role,
    },
    { onConflict: 'supplier_id,user_id' }
  );
  if (error) return false;
  dispatchRoleEvent();
  return true;
}

export async function removeSupplierTeamMember(currentUserId: string, memberId: string): Promise<boolean> {
  if (!supabase) {
    const current = loadSupplierTeam(currentUserId).members;
    const next = current.filter((m) => m.id !== memberId);
    saveSupplierTeam({ members: next });
    dispatchRoleEvent();
    return true;
  }
  await ensureOwnerMembership(currentUserId);
  const supplierId = await resolveSupplierId(currentUserId);
  const { error } = await supabase
    .from('supplier_team_members')
    .delete()
    .eq('supplier_id', supplierId)
    .eq('user_id', memberId);
  if (error) return false;
  dispatchRoleEvent();
  return true;
}

