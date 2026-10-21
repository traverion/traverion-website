import { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { fetchSupplierTeamMembers } from '../../data/supabase-supplier-team';
import { type SupplierTeamMember } from '../../lib/supplierTeamRoles';
import { userFacingError } from '../../lib/userFacingError';
import NoticeCallout from '../NoticeCallout';
import { SkeletonListItem } from '../ui/Skeleton';
import { ProfileCard } from './businessProfileUi';

function roleLabel(role: string): string {
  if (role === 'owner') return 'Owner';
  if (role === 'manager') return 'Manager';
  if (role === 'ops') return 'Ops';
  if (role === 'finance') return 'Finance';
  if (role === 'viewer') return 'Viewer';
  return role;
}

type Props = {
  brandName: string;
  accountEmail?: string | null;
};

/**
 * Team tab: show primary account identity and existing members.
 * Invitation UI is intentionally Coming Soon (backend memberships preserved).
 */
export default function SupplierTeamPanel({ brandName, accountEmail }: Props) {
  const { user } = useSupplierAuth();
  const { roleStatus } = useSupplierRole();
  const roleReady = roleStatus === 'ready' || roleStatus === 'error';
  const [members, setMembers] = useState<SupplierTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user?.id) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchSupplierTeamMembers(user.id);
      setMembers(rows);
    } catch (e) {
      setError(userFacingError(e, 'Could not load your team. Check your connection and try again.'));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const displayName = brandName.trim() || 'Your business';
  const teammates = members.filter((m) => m.role !== 'owner' && m.id !== user?.id);

  return (
    <div className="space-y-4">
      <ProfileCard title="Primary account">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-finland/10 text-finland">
            <Users className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold tracking-tight text-ink">{displayName}</p>
            <p className="mt-0.5 text-[13px] text-ink-muted">Primary account · Owner</p>
            {accountEmail ? (
              <p className="mt-1 break-all text-[13px] text-ink-faint">{accountEmail}</p>
            ) : null}
          </div>
        </div>
      </ProfileCard>

      {error ? (
        <NoticeCallout tone="warn" title="Could not load team">
          <p>{error}</p>
          <button type="button" className="tv-btn-secondary mt-2 h-9 px-3 text-[13px]" onClick={() => void reload()}>
            Retry
          </button>
        </NoticeCallout>
      ) : null}

      {loading || !roleReady ? (
        <div className="space-y-2">
          <SkeletonListItem />
          <SkeletonListItem />
        </div>
      ) : teammates.length > 0 ? (
        <ProfileCard title="Current teammates" description="Existing access remains active.">
          <ul className="divide-y divide-black/[0.05]">
            {teammates.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-ink">{m.label?.trim() || 'Teammate'}</p>
                  <p className="text-[12px] text-ink-muted">{roleLabel(m.role)}</p>
                </div>
              </li>
            ))}
          </ul>
        </ProfileCard>
      ) : null}

      <ProfileCard title="Team management">
        <div className="flex items-start gap-3 rounded-lg bg-finland/[0.03] px-3.5 py-3 ring-1 ring-finland/10">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-finland ring-1 ring-finland/15">
            <Users className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] leading-snug text-ink">
              Invite teammates and manage access from one place.
            </p>
            <p className="mt-1.5 text-[12px] font-semibold text-finland">Coming soon</p>
            <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">
              Invitations and permission controls will be available here later.
            </p>
          </div>
        </div>
      </ProfileCard>
    </div>
  );
}
