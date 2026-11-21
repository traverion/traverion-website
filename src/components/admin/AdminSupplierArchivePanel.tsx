import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import NoticeCallout from '../NoticeCallout';
import ConfirmDialog from '../feedback/ConfirmDialog';
import { beginMilestone, failMilestone, succeedMilestone } from '../../lib/feedback';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';

type Lifecycle = 'active' | 'pending' | 'suspended' | 'archived';

type DirectoryRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  lifecycle: Lifecycle;
  verification_status: string | null;
  payout_verification_status: string | null;
  archived_at: string | null;
  archive_reason: string | null;
  suspended_at: string | null;
  listings_count: number;
  bookings_count: number;
  has_connect_account: boolean;
  connect_account_livemode: boolean | null;
};

type Detail = {
  profile: {
    id: string;
    display_name: string | null;
    company_legal_name: string | null;
    lifecycle: Lifecycle;
    verification_status: string | null;
    payout_verification_status: string | null;
    archived_at: string | null;
    archive_reason: string | null;
    archived_by: string | null;
    released_email: string | null;
    phone_released: boolean;
    suspended_at: string | null;
    has_connect_account: boolean;
    connect_account_livemode: boolean | null;
    connect_payouts_enabled: boolean | null;
  };
  agreement: {
    plan_code: string | null;
    commission_bps: number | null;
    payout_cadence: string | null;
    status: string | null;
  } | null;
  counts: {
    review_events: number;
    financial_audit: number;
    documents: number;
  };
};

const VIEWS: { id: Lifecycle; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'pending', label: 'Pending' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'archived', label: 'Archived' },
];

export default function AdminSupplierArchivePanel({ initialView = 'active' }: { initialView?: Lifecycle }) {
  const [view, setView] = useState<Lifecycle>(initialView);
  const [items, setItems] = useState<DirectoryRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invokeAdminEdgeFunction<{ items: DirectoryRow[] }>({ action: 'suppliers_directory' });
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load suppliers');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDetail = useCallback(async (supplierId: string) => {
    setSelectedId(supplierId);
    setDetail(null);
    setError(null);
    try {
      const data = await invokeAdminEdgeFunction<Detail>({ action: 'supplier_archive_detail', supplierId });
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load supplier');
    }
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((row) => {
      if (row.lifecycle !== view) return false;
      if (!needle) return true;
      return (
        (row.display_name ?? '').toLowerCase().includes(needle) ||
        (row.email ?? '').toLowerCase().includes(needle) ||
        (row.archive_reason ?? '').toLowerCase().includes(needle) ||
        row.id.toLowerCase().includes(needle)
      );
    });
  }, [items, query, view]);

  const [pendingAction, setPendingAction] = useState<
    'archive_supplier' | 'restore_supplier' | 'suspend_supplier' | 'unsuspend_supplier' | null
  >(null);

  const actionCopy = {
    archive_supplier: {
      title: 'Archive this supplier?',
      description: 'Sign-in stops and the email and phone can be registered again. The Stripe account, agreement, and audit history stay.',
      confirm: 'Archive supplier',
      pending: 'Archiving supplier...',
      success: 'Supplier archived',
      successMessage: 'The record, agreement, and payout account stay in place.',
      destructive: true,
    },
    restore_supplier: {
      title: 'Restore supplier access?',
      description: 'The supplier can sign in again. Verification and payout status stay as they are.',
      confirm: 'Restore access',
      pending: 'Restoring access...',
      success: 'Access restored',
      successMessage: 'The supplier can sign in. Verification was not changed.',
      destructive: false,
    },
    suspend_supplier: {
      title: 'Suspend supplier access?',
      description: 'The supplier cannot sign in until the suspension ends. Records and the payout account stay.',
      confirm: 'Suspend access',
      pending: 'Suspending access...',
      success: 'Access suspended',
      successMessage: 'Sign-in is paused. The record and payout account stay in place.',
      destructive: true,
    },
    unsuspend_supplier: {
      title: 'End this suspension?',
      description: 'The supplier can sign in again. Verification and payout status stay as they are.',
      confirm: 'End suspension',
      pending: 'Ending suspension...',
      success: 'Suspension ended',
      successMessage: 'The supplier can sign in. Verification was not changed.',
      destructive: false,
    },
  } as const;

  const run = async (action: 'archive_supplier' | 'restore_supplier' | 'suspend_supplier' | 'unsuspend_supplier') => {
    if (!selectedId) return;
    const copy = actionCopy[action];
    setPendingAction(null);
    const milestoneId = beginMilestone(copy.pending, 'Waiting for the server.');
    setBusy(true);
    setError(null);
    try {
      await invokeAdminEdgeFunction({ action, supplierId: selectedId, archiveReason: reason });
      setReason('');
      await load();
      await loadDetail(selectedId);
      succeedMilestone(milestoneId, true, {
        title: copy.success,
        message: copy.successMessage,
        page: 'admin',
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Action failed';
      setError(message);
      failMilestone(milestoneId, message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-ink tracking-tight">Supplier records</h2>
          <p className="text-sm text-ink-muted mt-1">
            Archived suppliers keep their review history, agreement, and payout-account link. They cannot sign in, and the email and phone can be registered again.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="tv-btn-secondary text-sm" disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Supplier lifecycle">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={view === item.id}
            onClick={() => setView(item.id)}
            className={view === item.id ? 'tv-btn-primary text-sm' : 'tv-btn-secondary text-sm'}
          >
            {item.label}
            <span className="ml-1.5 tabular-nums text-[11px] opacity-80">
              {items.filter((row) => row.lifecycle === item.id).length}
            </span>
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search name, email, or reason"
        className="w-full max-w-md rounded-lg border border-black/10 px-3 py-2 text-sm"
        aria-label="Search suppliers"
      />

      {error ? (
        <NoticeCallout title="Supplier archive" tone="danger">
          <span>{error}</span>
          <button type="button" className="mt-2 tv-btn-secondary text-sm" onClick={() => void load()}>
            Try again
          </button>
        </NoticeCallout>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="tv-table-wrap">
          <table className="tv-table min-w-[640px]">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Verification</th>
                <th>Payout account</th>
                <th className="tabular-nums">Bookings</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => void loadDetail(row.id)}
                  className={`cursor-pointer hover:bg-finland/[0.03] ${selectedId === row.id ? 'bg-finland/[0.06]' : ''}`}
                >
                  <td>
                    <p className="font-medium text-ink">{row.display_name || '—'}</p>
                    <p className="text-xs text-ink-muted">{row.email || 'Email released'}</p>
                    {row.lifecycle === 'archived' && row.archived_at ? (
                      <p className="text-[11px] text-ink-faint mt-0.5">
                        Archived {new Date(row.archived_at).toLocaleString()}
                      </p>
                    ) : null}
                  </td>
                  <td className="text-ink-muted">{row.verification_status || '—'}</td>
                  <td className="text-ink-muted">
                    {row.has_connect_account
                      ? row.connect_account_livemode
                        ? 'Live account retained'
                        : 'Test account retained'
                      : 'None'}
                  </td>
                  <td className="tabular-nums">{row.bookings_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && visible.length === 0 ? (
            <p className="px-4 py-8 text-sm text-ink-muted text-center">No suppliers in {view}.</p>
          ) : null}
        </div>

        <aside className="tv-card p-4 space-y-3">
          {!detail ? (
            <p className="text-sm text-ink-muted">Select a supplier to see the preserved record.</p>
          ) : (
            <>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-faint">{detail.profile.lifecycle}</p>
                <h3 className="font-medium text-ink">{detail.profile.display_name || detail.profile.company_legal_name || 'Supplier'}</h3>
                <p className="text-xs font-mono text-ink-faint break-all">{detail.profile.id}</p>
              </div>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Business</dt>
                  <dd>{detail.profile.verification_status || '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Payout verification</dt>
                  <dd>{detail.profile.payout_verification_status || '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Agreement</dt>
                  <dd>
                    {detail.agreement
                      ? `${detail.agreement.plan_code || '—'} · ${detail.agreement.commission_bps ?? '—'} bps · ${detail.agreement.payout_cadence || '—'}`
                      : 'None'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Review events</dt>
                  <dd className="tabular-nums">{detail.counts.review_events}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Financial audit</dt>
                  <dd className="tabular-nums">{detail.counts.financial_audit}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Documents</dt>
                  <dd className="tabular-nums">{detail.counts.documents}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Stripe</dt>
                  <dd>
                    {detail.profile.has_connect_account
                      ? detail.profile.connect_account_livemode
                        ? 'Live account kept'
                        : 'Test account kept'
                      : 'None'}
                  </dd>
                </div>
              </dl>
              {detail.profile.lifecycle === 'archived' ? (
                <div className="rounded-lg bg-black/[0.03] px-3 py-2 text-sm">
                  <p className="font-medium text-ink">Inactive</p>
                  <p className="text-ink-muted mt-1">{detail.profile.archive_reason}</p>
                  <p className="text-xs text-ink-faint mt-1">
                    {detail.profile.archived_at ? new Date(detail.profile.archived_at).toLocaleString() : ''}
                    {detail.profile.archived_by ? ` · ${detail.profile.archived_by.slice(0, 8)}` : ''}
                  </p>
                  <p className="text-xs text-ink-muted mt-1">
                    Released email: {detail.profile.released_email || '—'}
                    {detail.profile.phone_released ? ' · Phone released' : ''}
                  </p>
                </div>
              ) : null}
              <label className="block text-sm">
                <span className="text-ink-muted">Reason</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {detail.profile.lifecycle !== 'archived' ? (
                  <button
                    type="button"
                    className="tv-btn-primary text-sm"
                    disabled={busy || reason.trim().length < 8}
                    onClick={() => setPendingAction('archive_supplier')}
                  >
                    Archive supplier
                  </button>
                ) : (
                  <button type="button" className="tv-btn-primary text-sm" disabled={busy} onClick={() => setPendingAction('restore_supplier')}>
                    Restore access
                  </button>
                )}
                {detail.profile.lifecycle === 'active' || detail.profile.lifecycle === 'pending' ? (
                  <button
                    type="button"
                    className="tv-btn-secondary text-sm"
                    disabled={busy || reason.trim().length < 8}
                    onClick={() => setPendingAction('suspend_supplier')}
                  >
                    Suspend access
                  </button>
                ) : null}
                {detail.profile.lifecycle === 'suspended' ? (
                  <button type="button" className="tv-btn-secondary text-sm" disabled={busy} onClick={() => setPendingAction('unsuspend_supplier')}>
                    End suspension
                  </button>
                ) : null}
              </div>
              <p className="text-[12px] leading-snug text-ink-faint">
                Archive revokes login and frees the email and phone. It does not delete the Stripe account, the agreement, or the audit history. A new registration gets a new user id.
              </p>
            </>
          )}
        </aside>
      </div>
      <ConfirmDialog
        open={pendingAction != null}
        title={pendingAction ? actionCopy[pendingAction].title : ''}
        description={pendingAction ? actionCopy[pendingAction].description : ''}
        confirmLabel={pendingAction ? actionCopy[pendingAction].confirm : 'Continue'}
        destructive={pendingAction ? actionCopy[pendingAction].destructive : false}
        onConfirm={() => {
          if (pendingAction) void run(pendingAction);
        }}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
