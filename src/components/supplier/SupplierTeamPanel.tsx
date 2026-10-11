import { useCallback, useEffect, useState } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import {
  fetchSupplierTeamMembers,
  removeSupplierTeamMember,
  upsertSupplierTeamMember,
} from '../../data/supabase-supplier-team';
import {
  canManageTeam,
  type SupplierRole,
  type SupplierTeamMember,
} from '../../lib/supplierTeamRoles';
import { userFacingError } from '../../lib/userFacingError';
import PartnerSelect from './PartnerSelect';
import NoticeCallout from '../NoticeCallout';
import { SkeletonListItem } from '../ui/Skeleton';

const ROLE_OPTIONS: { value: SupplierRole; label: string; hint: string }[] = [
  { value: 'manager', label: 'Manager', hint: 'Full ops except ownership transfer' },
  { value: 'ops', label: 'Ops', hint: 'Bookings, pickup, and listings' },
  { value: 'finance', label: 'Finance', hint: 'Income and payouts view' },
  { value: 'viewer', label: 'Viewer', hint: 'Read-only access' },
];

function roleLabel(role: SupplierRole): string {
  if (role === 'owner') return 'Owner';
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

export default function SupplierTeamPanel() {
  const { user } = useSupplierAuth();
  const { role, roleStatus, refresh } = useSupplierRole();
  const roleReady = roleStatus === 'ready' || roleStatus === 'error';
  const canEdit = roleReady && canManageTeam(role);
  const [members, setMembers] = useState<SupplierTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [addUserId, setAddUserId] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [addRole, setAddRole] = useState<SupplierRole>('ops');
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

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

  const onRoleChange = async (member: SupplierTeamMember, nextRole: SupplierRole) => {
    if (!user?.id || !canEdit || member.role === 'owner') return;
    setBusyId(member.id);
    setError(null);
    try {
      const ok = await upsertSupplierTeamMember(user.id, {
        id: member.id,
        label: member.label,
        role: nextRole,
      });
      if (!ok) {
        setError('Could not update that role. Try again.');
        return;
      }
      await reload();
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const onRemove = async (memberId: string) => {
    if (!user?.id || !canEdit) return;
    setBusyId(memberId);
    setError(null);
    try {
      const ok = await removeSupplierTeamMember(user.id, memberId);
      if (!ok) {
        setError('Could not remove that teammate. Try again.');
        return;
      }
      setPendingRemoveId(null);
      await reload();
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const onAdd = async () => {
    if (!user?.id || !canEdit) return;
    const id = addUserId.trim();
    if (!id || id.length < 8) {
      setAddError('Enter the teammate’s Traverion user ID (from their account).');
      return;
    }
    if (id === user.id) {
      setAddError('You are already on this team as owner.');
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      const ok = await upsertSupplierTeamMember(user.id, {
        id,
        label: addLabel.trim() || id,
        role: addRole === 'owner' ? 'ops' : addRole,
      });
      if (!ok) {
        setAddError('Could not add that teammate. Check the user ID and try again.');
        return;
      }
      setAddUserId('');
      setAddLabel('');
      setAddRole('ops');
      await reload();
      await refresh();
    } finally {
      setAddBusy(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="font-display text-xl font-bold text-ink">Team</h2>
        <p className="mt-1 text-sm text-ink-muted leading-relaxed">
          People who can help run bookings, listings, and income for this supplier account.
        </p>
      </div>

      {!canEdit && roleReady ? (
        <NoticeCallout tone="info" title="View only">
          Only the account owner can add or remove teammates. Ask the owner if you need a role change.
        </NoticeCallout>
      ) : null}

      {error ? (
        <NoticeCallout tone="warn" title="Could not update team">
          <p>{error}</p>
          <button type="button" className="tv-btn-secondary mt-2" onClick={() => void reload()}>
            Retry
          </button>
        </NoticeCallout>
      ) : null}

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading team">
          <SkeletonListItem />
          <SkeletonListItem />
        </div>
      ) : members.length === 0 ? (
        <NoticeCallout tone="info" title="No teammates yet">
          Add someone by their Traverion user ID when they already have a partner login.
        </NoticeCallout>
      ) : (
        <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.06] bg-paper overflow-hidden">
          {members.map((m) => {
            const isSelf = m.id === user?.id;
            const isOwner = m.role === 'owner';
            const pendingRemove = pendingRemoveId === m.id;
            return (
              <li key={m.id} className="px-4 py-3.5 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{m.label || 'Teammate'}</p>
                    <p className="mt-0.5 text-xs text-ink-faint font-mono break-all">{m.id}</p>
                  </div>
                  {isOwner || !canEdit ? (
                    <p className="text-sm font-medium text-ink shrink-0">{roleLabel(m.role)}</p>
                  ) : (
                    <div className="w-full max-w-[12rem]">
                      <PartnerSelect
                        aria-label={`Role for ${m.label || 'teammate'}`}
                        value={m.role}
                        disabled={busyId === m.id}
                        onChange={(v) => void onRoleChange(m, v as SupplierRole)}
                        options={ROLE_OPTIONS.map((r) => ({
                          value: r.value,
                          label: r.label,
                          hint: r.hint,
                        }))}
                      />
                    </div>
                  )}
                </div>
                {canEdit && !isOwner && !isSelf ? (
                  pendingRemove ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="tv-btn-primary !min-h-10 text-sm"
                        disabled={busyId === m.id}
                        onClick={() => void onRemove(m.id)}
                      >
                        {busyId === m.id ? 'Removing…' : 'Confirm remove'}
                      </button>
                      <button
                        type="button"
                        className="tv-btn-ghost !min-h-10 text-sm"
                        disabled={busyId === m.id}
                        onClick={() => setPendingRemoveId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-700 hover:underline disabled:opacity-50"
                      disabled={busyId === m.id}
                      onClick={() => setPendingRemoveId(m.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Remove
                    </button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        <div className="rounded-xl border border-black/[0.06] bg-paper px-4 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-finland" aria-hidden />
            <h3 className="text-sm font-semibold text-ink">Add teammate</h3>
          </div>
          <p className="text-xs text-ink-muted leading-relaxed">
            They must already have a Traverion partner login. Paste their user ID from account settings.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="team-add-user-id" className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              User ID *
            </label>
            <input
              id="team-add-user-id"
              type="text"
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
              className="tv-input"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="team-add-label" className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              Display name
            </label>
            <input
              id="team-add-label"
              type="text"
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
              className="tv-input"
              placeholder="e.g. Winter guide"
            />
          </div>
          <div className="space-y-1.5 max-w-xs">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-faint" id="team-add-role-label">
              Role
            </span>
            <PartnerSelect
              aria-labelledby="team-add-role-label"
              value={addRole}
              onChange={(v) => setAddRole(v as SupplierRole)}
              options={ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label, hint: r.hint }))}
            />
          </div>
          {addError ? (
            <p className="text-sm text-red-800" role="alert">
              {addError}
            </p>
          ) : null}
          <button
            type="button"
            className="tv-btn-primary"
            disabled={addBusy}
            onClick={() => void onAdd()}
          >
            {addBusy ? 'Adding…' : 'Add to team'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
