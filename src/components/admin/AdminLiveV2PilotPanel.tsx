import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Loader2, RefreshCw } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';
import NoticeCallout from '../NoticeCallout';
import StatusChip from '../StatusChip';
import EmptyState from '../EmptyState';

type Candidate = {
  supplierId: string;
  eligible: boolean;
  problems: string[];
  reviewFlags: string[];
  display_name?: string | null;
  legalName: string | null;
  country: string | null;
  businessType: string | null;
  businessVerified: boolean;
  hasLiveConnectedAccount: boolean;
  incomplete?: boolean;
  pilot_approved_at?: string | null;
};

type ListPayload = {
  ok?: boolean;
  gate_enabled?: boolean;
  allowlist_count?: number;
  orphan_team_memberships?: Array<{ supplier_id: string; user_id: string; role: string }>;
  items?: Candidate[];
  note?: string;
};

export default function AdminLiveV2PilotPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payload, setPayload] = useState<ListPayload | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [ownerConfirmed, setOwnerConfirmed] = useState(false);
  const [stripeAck, setStripeAck] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const data = await invokeAdminEdgeFunction<ListPayload>({ action: 'list_live_v2_pilot_candidates' });
      setPayload(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pilot candidates');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured()) void load();
  }, [load]);

  const assess = async () => {
    if (!selectedId.trim()) {
      setError('Enter a supplier ID.');
      return;
    }
    setActing(true);
    setError(null);
    setNotice(null);
    try {
      const data = await invokeAdminEdgeFunction<{
        assessment?: Candidate & { problems: string[]; reviewFlags: string[] };
        note?: string;
      }>({
        action: 'assess_live_v2_pilot',
        supplierId: selectedId.trim(),
        ownerConfirmed,
        stripeVerificationAcknowledged: stripeAck,
      });
      setNotice(
        data.assessment?.eligible
          ? 'Eligible for pilot approval recording. The LIVE gate stays OFF and the allowlist stays empty.'
          : `Not eligible: ${(data.assessment?.problems ?? []).join(' ')}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assessment failed');
    } finally {
      setActing(false);
    }
  };

  const approve = async () => {
    if (!selectedId.trim()) {
      setError('Enter a supplier ID.');
      return;
    }
    if (!ownerConfirmed || !stripeAck || !confirmApprove) {
      setError('Confirm ownership, Stripe verification acknowledgement, and the explicit approval checkbox.');
      return;
    }
    setActing(true);
    setError(null);
    setNotice(null);
    try {
      const data = await invokeAdminEdgeFunction<{
        ok?: boolean;
        note?: string;
        gate_enabled?: boolean;
        allowlisted?: boolean;
      }>({
        action: 'approve_live_v2_pilot',
        supplierId: selectedId.trim(),
        ownerConfirmed: true,
        stripeVerificationAcknowledged: true,
        confirmLivePilot: true,
        livePilotNote: note.trim() || undefined,
      });
      setNotice(
        data.note ??
          'Pilot approval recorded. LIVE account creation remains blocked until a separate authorization.'
      );
      setConfirmApprove(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setActing(false);
    }
  };

  const items = payload?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">LIVE Accounts v2 pilot eligibility</h2>
          <p className="mt-1 text-[12px] text-ink-muted">
            Record who may later be considered for allowlisting. This never enables the creation gate.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-[12px] font-medium"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {error ? <NoticeCallout tone="bad">{error}</NoticeCallout> : null}
      {notice ? <NoticeCallout tone="good">{notice}</NoticeCallout> : null}

      <div className="grid gap-3 rounded-[12px] border border-line bg-white p-4 md:grid-cols-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Creation gate</p>
          <StatusChip tone={payload?.gate_enabled ? 'bad' : 'good'}>
            {payload?.gate_enabled ? 'ON' : 'OFF'}
          </StatusChip>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Allowlist rows</p>
          <p className="mt-1 text-[14px] font-semibold text-ink">{payload?.allowlist_count ?? '—'}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Orphan team rows</p>
          <p className="mt-1 text-[14px] font-semibold text-ink">
            {payload?.orphan_team_memberships?.length ?? '—'}
          </p>
        </div>
      </div>

      {(payload?.orphan_team_memberships?.length ?? 0) > 0 ? (
        <NoticeCallout tone="warn">
          Orphan team memberships exist for supplier ids with no profile. They were not reassigned.
          {payload?.orphan_team_memberships?.map((row) => (
            <div key={`${row.supplier_id}-${row.user_id}`} className="mt-1 font-mono text-[11px]">
              {row.supplier_id} · {row.role}
            </div>
          ))}
        </NoticeCallout>
      ) : null}

      <div className="rounded-[12px] border border-line bg-white p-4">
        <label className="block text-[12px] font-semibold text-ink">
          Supplier ID
          <input
            className="mt-1 h-10 w-full rounded-md border border-line px-3 font-mono text-[12px]"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            placeholder="uuid"
          />
        </label>
        <div className="mt-3 space-y-2 text-[12px] text-ink">
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={ownerConfirmed} onChange={(e) => setOwnerConfirmed(e.target.checked)} />
            <span>I confirm the signed-in owner is authorized for this business.</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={stripeAck} onChange={(e) => setStripeAck(e.target.checked)} />
            <span>The supplier acknowledges that real Stripe verification may be required.</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={confirmApprove} onChange={(e) => setConfirmApprove(e.target.checked)} />
            <span>Record pilot approval only. Do not allowlist and do not enable the LIVE creation gate.</span>
          </label>
        </div>
        <label className="mt-3 block text-[12px] font-semibold text-ink">
          Note
          <input
            className="mt-1 h-10 w-full rounded-md border border-line px-3 text-[12px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional review note"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-[12px] font-medium"
            onClick={() => void assess()}
            disabled={acting}
          >
            Assess eligibility
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-ink px-3 text-[12px] font-medium text-white"
            onClick={() => void approve()}
            disabled={acting}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            Record pilot approval
          </button>
        </div>
      </div>

      {loading && !payload ? (
        <div className="flex items-center gap-2 text-[12px] text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading suppliers…
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No supplier profiles" body="There are no supplier profiles to review." />
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-line">
          <table className="min-w-full text-left text-[12px]">
            <thead className="bg-[#fafafa] text-[11px] uppercase tracking-[0.08em] text-ink-muted">
              <tr>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Country</th>
                <th className="px-3 py-2">Legal name</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Flags</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.supplierId} className="border-t border-line align-top">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-left font-medium text-ink underline-offset-2 hover:underline"
                      onClick={() => setSelectedId(row.supplierId)}
                    >
                      {row.display_name || row.legalName || 'Unnamed'}
                    </button>
                    <div className="mt-0.5 font-mono text-[10px] text-ink-muted">{row.supplierId}</div>
                  </td>
                  <td className="px-3 py-2">{row.country || '—'}</td>
                  <td className="px-3 py-2">{row.legalName || '—'}</td>
                  <td className="px-3 py-2">
                    <StatusChip
                      tone={
                        row.pilot_approved_at ? 'good' : row.hasLiveConnectedAccount ? 'neutral' : row.eligible ? 'warn' : 'bad'
                      }
                    >
                      {row.pilot_approved_at
                        ? 'Pilot approved'
                        : row.hasLiveConnectedAccount
                          ? 'Connected account'
                          : row.incomplete
                            ? 'Incomplete'
                            : 'Not eligible'}
                    </StatusChip>
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {[...row.problems, ...row.reviewFlags].slice(0, 2).join(' ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
