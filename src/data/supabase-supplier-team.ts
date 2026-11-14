import { createInflightCache } from '../lib/inflight-dedupe';
import { supabase } from '../lib/supabase';
import {
  canManageBookings,
  effectiveListingRole,
  loadSupplierTeam,
  sameSupplierUserId,
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

/** One team lookup per signed-in user. Parallel page loads were each paying this round trip. */
const resolvedSupplierIdCache = createInflightCache<string>({ ttlMs: 60_000 });

export function invalidateResolvedSupplierId(userId?: string): void {
  resolvedSupplierIdCache.invalidate(userId);
}

export async function resolveSupplierId(currentUserId: string): Promise<string> {
  const client = supabase;
  if (!client) return currentUserId;
  return resolvedSupplierIdCache.get(currentUserId, async () => {
    const { data, error } = await client
      .from('supplier_team_members')
      .select('supplier_id')
      .eq('user_id', currentUserId)
      .limit(1)
      .maybeSingle();
    // Phase 1473: team lookup failure must not fall back to the JWT user id — that
    // scopes every owner-keyed query to empty (Bookings/Today/Listings look “quiet”).
    if (error) throw new Error(error.message);
    return data?.supplier_id ?? currentUserId;
  });
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
    // Phase 1776: never fall back to forgeable localStorage roles when Supabase is configured.
    throw new Error(error.message);
  }
  return ((data ?? []) as TeamRow[]).map((r) => ({
    id: r.user_id,
    label: r.label ?? r.user_id,
    role: r.role,
    createdAt: r.created_at,
  }));
}

const SESSION_READY_ATTEMPTS = 5;

async function waitForPartnerAccessToken(client: NonNullable<typeof supabase>): Promise<void> {
  for (let attempt = 0; attempt < SESSION_READY_ATTEMPTS; attempt++) {
    const { data, error } = await client.auth.getSession();
    if (!error && data.session?.access_token) return;
    if (attempt === SESSION_READY_ATTEMPTS - 1) return;
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }
}

type CallerMembership = {
  supplier_id: string;
  user_id: string;
  label: string | null;
  role: string;
  created_at: string;
};

async function readCallerMembership(
  client: NonNullable<typeof supabase>,
  currentUserId: string
): Promise<CallerMembership | null> {
  const { data, error } = await client
    .from('supplier_team_members')
    .select('supplier_id, user_id, label, role, created_at')
    .eq('user_id', currentUserId)
    .limit(5);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as CallerMembership[];
  const mine = rows.filter((row) => sameSupplierUserId(row.user_id, currentUserId));
  return mine.find((row) => sameSupplierUserId(row.supplier_id, currentUserId)) ?? mine[0] ?? null;
}

async function readRoster(
  client: NonNullable<typeof supabase>,
  supplierId: string
): Promise<SupplierTeamMember[]> {
  const { data, error } = await client
    .from('supplier_team_members')
    .select('supplier_id, user_id, label, role, created_at')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CallerMembership[]).map((row) => ({
    id: row.user_id,
    label: row.label ?? row.user_id,
    role: effectiveListingRole({
      userId: row.user_id,
      supplierId: row.supplier_id,
      role: row.role,
    }),
    createdAt: row.created_at,
  }));
}

/**
 * Role used by listing create/edit/publish.
 * Reads the signed-in user's own membership, not a supplier id cached before
 * the session token exists. Finance and viewer stay read-only. A roster-list
 * failure does not demote an editor whose own row already loaded.
 */
export async function fetchSupplierListingAccess(currentUserId: string): Promise<{
  role: SupplierRole;
  members: SupplierTeamMember[];
}> {
  const client = supabase;
  if (!client) {
    const local = loadSupplierTeam(currentUserId);
    const mine = local.members.find((member) => sameSupplierUserId(member.id, currentUserId));
    return { role: mine?.role ?? 'viewer', members: local.members };
  }
  await waitForPartnerAccessToken(client);
  await ensureOwnerMembership(currentUserId);
  const own = await readCallerMembership(client, currentUserId);
  const role = effectiveListingRole({
    userId: currentUserId,
    supplierId: own?.supplier_id ?? null,
    role: own?.role ?? null,
  });
  if (!own?.supplier_id) return { role, members: [] };
  resolvedSupplierIdCache.seed(currentUserId, own.supplier_id);
  try {
    const members = await readRoster(client, own.supplier_id);
    const mine = members.find((member) => sameSupplierUserId(member.id, currentUserId));
    return {
      role: effectiveListingRole({
        userId: currentUserId,
        supplierId: own.supplier_id,
        role: mine?.role ?? own.role,
      }),
      members,
    };
  } catch (err) {
    if (!canManageBookings(role)) throw err;
    return {
      role,
      members: [
        {
          id: own.user_id,
          label: own.label ?? 'Primary account',
          role,
          createdAt: own.created_at,
        },
      ],
    };
  }
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
  invalidateResolvedSupplierId(member.id);
  invalidateResolvedSupplierId(currentUserId);
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
  invalidateResolvedSupplierId(memberId);
  invalidateResolvedSupplierId(currentUserId);
  dispatchRoleEvent();
  return true;
}

