import { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { fetchSupplierTeamMembers, removeSupplierTeamMember } from '../../data/supabase-supplier-team';
import { canManageTeam, type SupplierTeamMember } from '../../lib/supplierTeamRoles';
import { userFacingError } from '../../lib/userFacingError';
import NoticeCallout from '../NoticeCallout';
import { SkeletonListItem } from '../ui/Skeleton';
import { ProfileCard } from './businessProfileUi';
import PartnerConfirmModal from './PartnerConfirmModal';

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
 * Team tab: primary account and existing members.
 * New invitations are not offered here. Owners can remove an existing teammate.
 */
export default function SupplierTeamPanel({ brandName, accountEmail }: Props) {
  const { user } = useSupplierAuth();
  const { role, roleStatus, refresh } = useSupplierRole();
  const roleReady = roleStatus === 'ready' || roleStatus === 'error';
  const [members, setMembers] = useState<SupplierTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<SupplierTeamMember | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

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
  const manageTeam = canManageTeam(role);

  const confirmRemove = async () => {
    if (!user?.id || !removing || removeBusy) return;
    setRemoveBusy(true);
    setRemoveError(null);
    const ok = await removeSupplierTeamMember(user.id, removing.id);
    setRemoveBusy(false);
    if (!ok) {
      setRemoveError('Could not remove this teammate. Try again.');
      return;
    }
    setRemoving(null);
    await reload();
    await refresh();
  };

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
                {manageTeam ? (
                  <button
                    type="button"
                    className="tv-btn-secondary h-8 shrink-0 px-2.5 text-[12px]"
                    onClick={() => {
                      setRemoveError(null);
                      setRemoving(m);
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </ProfileCard>
      ) : (
        <ProfileCard title="Teammates">
          <p className="text-[13px] leading-snug text-ink-muted">Only the primary account has access.</p>
        </ProfileCard>
      )}

      <PartnerConfirmModal
        open={removing != null}
        title="Remove teammate"
        description={
          removing
            ? `${removing.label?.trim() || 'This teammate'} will lose access to this supplier account.`
            : ''
        }
        confirmLabel="Remove access"
        destructive
        busy={removeBusy}
        error={removeError}
        onConfirm={() => void confirmRemove()}
        onCancel={() => {
          if (!removeBusy) setRemoving(null);
        }}
      />
    </div>
  );
}
