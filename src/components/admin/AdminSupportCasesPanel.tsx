import { useCallback, useEffect, useState } from 'react';
import { Flag, Loader2, RefreshCw } from 'lucide-react';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';
import { isSupabaseConfigured } from '../../lib/supabase';
import NoticeCallout from '../NoticeCallout';
import EmptyState from '../EmptyState';
import {
  supportCaseReasonLabel,
  supportCaseStatusLabel,
} from '../../data/supabase-support-cases';

type AdminCaseRow = {
  id: string;
  public_reference: string;
  booking_id: string;
  listing_id: string;
  supplier_id: string;
  reason_code: string;
  description: string;
  status: string;
  priority: string;
  reported_at: string;
  response_due_at: string | null;
  escalated_at: string | null;
  supplier_response: string | null;
  resolution_code: string | null;
  financial_hold_id: string | null;
  currency: string | null;
  amount_paid: number | null;
  customer_email: string | null;
};

export default function AdminSupportCasesPanel() {
  const [items, setItems] = useState<AdminCaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [noteById, setNoteById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await invokeAdminEdgeFunction<{ items: AdminCaseRow[] }>({
        action: 'support_cases_list',
      });
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load support cases');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured()) void load();
  }, [load]);

  const resolve = async (
    caseId: string,
    resolutionCode: 'resolved_no_refund' | 'full_refund' | 'escalated_further'
  ) => {
    const note = (noteById[caseId] ?? '').trim();
    if (note.length < 3) {
      setActionMsg('Enter a resolution note (at least 3 characters).');
      return;
    }
    setBusyId(caseId);
    setActionMsg(null);
    try {
      await invokeAdminEdgeFunction({
        action: 'support_case_resolve',
        supportCaseId: caseId,
        supportResolutionCode: resolutionCode,
        supportResolutionNote: note,
        supportReleaseHold: resolutionCode !== 'escalated_further',
      });
      setActionMsg(
        resolutionCode === 'full_refund'
          ? 'Full refund prepared via existing refund instructions. Execute Stripe separately if not already queued.'
          : resolutionCode === 'escalated_further'
            ? 'Case escalated.'
            : 'Case resolved without refund.'
      );
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Could not resolve case');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-ink">Booking support cases</h2>
          <p className="text-sm text-ink-muted">
            Customer protection queue. Internal payout holds block Traverion eligibility prep — they do
            not escrow Stripe funds.
          </p>
        </div>
        <button type="button" className="tv-btn-secondary inline-flex items-center gap-2" onClick={() => void load()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {error ? <NoticeCallout title="Could not load" tone="bad">{error}</NoticeCallout> : null}
      {actionMsg ? <NoticeCallout title="Update" tone="info">{actionMsg}</NoticeCallout> : null}

      {loading && items.length === 0 ? (
        <div className="min-h-[8rem] animate-pulse rounded-xl bg-black/[0.03]" aria-busy />
      ) : items.length === 0 ? (
        <EmptyState icon={Flag} title="No open support cases" body="New traveler reports appear here." />
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="rounded-xl border border-black/[0.06] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-semibold text-finland">{c.public_reference}</p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {supportCaseReasonLabel(c.reason_code)} · {supportCaseStatusLabel(c.status)}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-ink-faint">
                    Priority {c.priority}
                    {c.response_due_at ? ` · Due ${new Date(c.response_due_at).toLocaleString()}` : ''}
                    {c.financial_hold_id ? ' · Internal hold active' : ''}
                  </p>
                </div>
                <div className="text-right text-sm text-ink-muted">
                  <div>{c.customer_email || 'Guest'}</div>
                  <div className="font-mono text-xs">{c.booking_id.slice(0, 8)}…</div>
                  {c.amount_paid != null ? (
                    <div>
                      {c.currency} {Number(c.amount_paid).toFixed(2)}
                    </div>
                  ) : null}
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{c.description}</p>
              {c.supplier_response ? (
                <p className="mt-2 rounded-md bg-black/[0.03] p-2 text-sm text-ink">
                  <span className="font-semibold">Supplier: </span>
                  {c.supplier_response}
                </p>
              ) : (
                <p className="mt-2 text-sm text-amber-800">No supplier response yet.</p>
              )}
              <label className="mt-3 block text-sm font-semibold text-ink">
                Resolution note
                <textarea
                  className="tv-input mt-1 min-h-[4rem]"
                  value={noteById[c.id] ?? ''}
                  onChange={(e) => setNoteById((m) => ({ ...m, [c.id]: e.target.value }))}
                  placeholder="What was decided and why…"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="tv-btn-secondary"
                  disabled={busyId === c.id || c.status === 'resolved' || c.status === 'closed'}
                  onClick={() => void resolve(c.id, 'resolved_no_refund')}
                >
                  Resolve — no refund
                </button>
                <button
                  type="button"
                  className="tv-btn-primary"
                  disabled={busyId === c.id || c.status === 'resolved' || c.status === 'closed'}
                  onClick={() => void resolve(c.id, 'full_refund')}
                >
                  Approve full refund
                </button>
                <button
                  type="button"
                  className="tv-btn-ghost"
                  disabled={busyId === c.id}
                  onClick={() => void resolve(c.id, 'escalated_further')}
                >
                  Escalate
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
