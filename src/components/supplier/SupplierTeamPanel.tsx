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
 * Invitation / UUID add-teammate UI is intentionally Coming Soon (backend memberships preserved).
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
    <div className="space-y-5">
      <ProfileCard title="Primary account">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-finland/10 text-finland shrink-0">
            <Users className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold tracking-tight text-ink">{displayName}</p>
            <p className="mt-0.5 text-[13px] text-ink-muted">Primary account · Owner</p>
            {accountEmail ? (
              <p className="mt-1 text-[13px] text-ink-faint break-all">{accountEmail}</p>
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
                  <p className="text-[14px] font-medium text-ink truncate">{m.label?.trim() || 'Teammate'}</p>
                  <p className="text-[12px] text-ink-muted">{roleLabel(m.role)}</p>
                </div>
              </li>
            ))}
          </ul>
        </ProfileCard>
      ) : null}

      <ProfileCard title="Team management">
        <div className="rounded-xl bg-finland/[0.04] ring-1 ring-finland/10 px-4 py-5 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-finland ring-1 ring-finland/15">
            <Users className="h-5 w-5" aria-hidden />
          </span>
          <p className="mt-3 text-[14px] font-medium text-ink">Invite teammates and manage access to your business from one place.</p>
          <p className="mt-2 inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-finland ring-1 ring-finland/20">
            Coming soon
          </p>
        </div>
      </ProfileCard>
    </div>
  );
}
