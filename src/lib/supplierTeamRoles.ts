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

