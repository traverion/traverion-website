export type SupplierRole = 'owner' | 'manager' | 'ops' | 'finance' | 'viewer';

export type SupplierTeamMember = {
  id: string;
  label: string;
  role: SupplierRole;
  createdAt: string;
};

type TeamState = {
  members: SupplierTeamMember[];
};

const TEAM_KEY = 'traverion_supplier_team_roles_v1';

function defaultMember(currentUserId: string): SupplierTeamMember {
  return {
    id: currentUserId,
    label: 'Primary account',
    role: 'owner',
    createdAt: new Date().toISOString(),
  };
}

export function loadSupplierTeam(currentUserId: string): TeamState {
  try {
    const raw = localStorage.getItem(TEAM_KEY);
    const parsed = raw ? (JSON.parse(raw) as TeamState) : null;
    const members = Array.isArray(parsed?.members) ? parsed.members : [];
    if (!members.some((m) => m.id === currentUserId)) {
      members.unshift(defaultMember(currentUserId));
    }
    return { members };
  } catch {
    return { members: [defaultMember(currentUserId)] };
  }
}

export function saveSupplierTeam(state: TeamState): void {
  localStorage.setItem(TEAM_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('traverion-supplier-team-roles'));
}

export function getCurrentSupplierRole(currentUserId: string): SupplierRole {
  const team = loadSupplierTeam(currentUserId);
  return team.members.find((m) => m.id === currentUserId)?.role ?? 'viewer';
}

export function canManageBookings(role: SupplierRole): boolean {
  return role === 'owner' || role === 'manager' || role === 'ops';
}

export function canManageFinance(role: SupplierRole): boolean {
  return role === 'owner' || role === 'finance';
}

export function canManageTeam(role: SupplierRole): boolean {
  return role === 'owner';
}

export function sameSupplierUserId(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function normalizeSupplierRole(role: string | null | undefined): SupplierRole | null {
  const value = String(role ?? '').trim().toLowerCase();
  if (value === 'owner' || value === 'manager' || value === 'ops' || value === 'finance' || value === 'viewer') {
    return value;
  }
  return null;
}

/**
 * Listing create/edit/publish role.
 * Editor roles stay editors. Explicit finance and viewer stay read-only.
 * The supplier account itself (user id = supplier id) stays an editor when the
 * stored role is missing, matching is_supplier_account_editor. A teammate with
 * no readable role stays a viewer.
 */
export function effectiveListingRole(input: {
  userId: string;
  supplierId: string | null | undefined;
  role: string | null | undefined;
}): SupplierRole {
  const stored = normalizeSupplierRole(input.role);
  if (stored) return stored;
  const userId = input.userId.trim().toLowerCase();
  const supplierId = String(input.supplierId ?? '').trim().toLowerCase();
  if (userId && supplierId && userId === supplierId) return 'owner';
  return 'viewer';
}

