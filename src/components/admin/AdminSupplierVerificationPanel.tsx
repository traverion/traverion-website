import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';
import {
  AdminSupplierDetailSection,
  type AdminSupplierDetailPayload,
} from './AdminSupplierDetailSection';
import NoticeCallout from '../NoticeCallout';
import StatusChip from '../StatusChip';
import EmptyState from '../EmptyState';

type QueueRow = {
  id: string;
  display_name: string | null;
  company_legal_name: string | null;
  verification_status: string | null;
  verification_submitted_at: string | null;
  business_verification_feedback: string | null;
  payout_verification_status: string | null;
  payout_verification_submitted_at: string | null;
  payout_verification_feedback: string | null;
  updated_at: string | null;
};

type FeedbackDrafts = Record<string, { business: string; payout: string }>;

function statusTone(status: string | null | undefined): 'good' | 'warn' | 'bad' | 'neutral' {
  const s = (status ?? '').toLowerCase();
  if (s === 'approved' || s === 'verified') return 'good';
  if (s === 'pending') return 'warn';
  if (s === 'rejected') return 'bad';
  return 'neutral';
}

function humanStatus(status: string | null | undefined): string {
  const s = (status ?? '').trim();
  if (!s) return 'Not submitted';
  if (s === 'pending') return 'Pending';
  if (s === 'approved' || s === 'verified') return 'Approved';
  if (s === 'rejected') return 'Rejected';
  return s;
}

export default function AdminSupplierVerificationPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<QueueRow[]>([]);
  const [feedbackDraft, setFeedbackDraft] = useState<FeedbackDrafts>({});
  const [actingId, setActingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<Record<string, AdminSupplierDetailPayload>>({});

  const loadQueue = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await invokeAdminEdgeFunction<{ items: QueueRow[] }>({ action: 'list' });
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load queue');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured()) void loadQueue();
  }, [loadQueue]);

  const loadDetail = async (supplierId: string) => {
    if (detailById[supplierId]) return;
    setDetailLoadingId(supplierId);
    setError(null);
    try {
      const data = await invokeAdminEdgeFunction<AdminSupplierDetailPayload>({ action: 'detail', supplierId });
      setDetailById((prev) => ({ ...prev, [supplierId]: data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load details');
    } finally {
      setDetailLoadingId(null);
    }
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    void loadDetail(id);
  };

  const runAction = async (
    supplierId: string,
    action: 'approve_business' | 'reject_business' | 'approve_payout' | 'reject_payout'
  ) => {
    setError(null);
    setActingId(supplierId);
    try {
      const drafts = feedbackDraft[supplierId];
      const feedback =
        action === 'reject_business'
          ? (drafts?.business ?? '').trim() || null
          : action === 'reject_payout'
            ? (drafts?.payout ?? '').trim() || null
            : undefined;
      await invokeAdminEdgeFunction({ action, supplierId, feedback });
      setDetailById((prev) => {
        const next = { ...prev };
        delete next[supplierId];
        return next;
      });
      await loadQueue();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActingId(null);
    }
  };

  const baseConfigured = isSupabaseConfigured();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-finland/10 flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-5 h-5 text-finland" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl text-ink tracking-tight">Supplier verification queue</h2>
            <p className="text-sm text-ink-muted mt-1 leading-relaxed">
              Review submitted business and payout data. Open verification files in a new tab. Approve or reject
              separately. Use the <strong className="text-ink font-semibold">business</strong> note when rejecting
              company verification, and the <strong className="text-ink font-semibold">banking / payout</strong> note
              when rejecting IBAN/BIC — suppliers see the matching message in Settings.
            </p>
          </div>
        </div>

        {!baseConfigured ? (
          <NoticeCallout title="Supabase not configured" tone="warn">
            Set <code className="text-xs font-mono">VITE_SUPABASE_URL</code> and{' '}
            <code className="text-xs font-mono">VITE_SUPABASE_ANON_KEY</code> in your env.
          </NoticeCallout>
        ) : null}

        <div className="mt-4">
          <button
            type="button"
            onClick={() => void loadQueue()}
            disabled={loading || !baseConfigured}
            className="tv-btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
            Refresh queue
          </button>
        </div>
      </div>

      {error ? (
        <NoticeCallout title="Could not load queue" tone="danger">
          {error}
        </NoticeCallout>
      ) : null}

      {items.length === 0 && !loading ? (
        <div className="rounded-2xl bg-paper-raised px-4 py-2 shadow-soft ring-1 ring-black/[0.06]">
          <EmptyState
            icon={ClipboardCheck}
            title="Queue is clear"
            body="No suppliers are waiting with business or payout verification submitted for review."
          />
        </div>
      ) : null}

      <div className="space-y-3">
        {items.map((row) => {
          const name = row.company_legal_name?.trim() || row.display_name?.trim() || row.id;
          const bizPending =
            row.verification_status === 'pending' && (row.verification_submitted_at ?? '').trim() !== '';
          const payPending =
            row.payout_verification_status === 'pending' &&
            (row.payout_verification_submitted_at ?? '').trim() !== '';
          const expanded = expandedId === row.id;
          const detail = detailById[row.id];
          const detailLoading = detailLoadingId === row.id;

          return (
            <div
              key={row.id}
              className="rounded-2xl bg-paper-raised p-4 sm:p-5 shadow-soft ring-1 ring-black/[0.06] space-y-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink">{name}</p>
                  <p className="text-xs text-ink-faint font-mono mt-0.5">{row.id}</p>
                </div>
                <p className="text-xs text-ink-faint">
                  Updated {row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-black/[0.02] ring-1 ring-black/[0.06] p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Business verification
                    </p>
                    <StatusChip tone={statusTone(row.verification_status)}>
                      {humanStatus(row.verification_status)}
                    </StatusChip>
                    {bizPending ? <StatusChip tone="warn">In queue</StatusChip> : null}
                  </div>
                  {row.verification_status === 'rejected' &&
                    (row.business_verification_feedback ?? '').trim() !== '' && (
                      <p className="text-xs text-ink-muted bg-paper-raised ring-1 ring-black/[0.06] rounded-lg px-2.5 py-1.5">
                        <span className="font-medium text-ink">Saved note: </span>
                        {row.business_verification_feedback}
                      </p>
                    )}
                  {bizPending && (
                    <>
                      <label className="block text-xs font-medium text-ink-muted pt-1">
                        Note if rejecting (company / documents — shown under business verification)
                      </label>
                      <textarea
                        value={feedbackDraft[row.id]?.business ?? ''}
                        onChange={(e) =>
                          setFeedbackDraft((d) => ({
                            ...d,
                            [row.id]: { business: e.target.value, payout: d[row.id]?.payout ?? '' },
                          }))
                        }
                        rows={2}
                        placeholder="e.g. Registration document is unreadable — please upload a clearer PDF."
                        className="tv-input w-full text-sm"
                      />
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          disabled={actingId === row.id}
                          onClick={() => void runAction(row.id, 'approve_business')}
                          className="tv-btn-primary text-xs h-8 px-3 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={actingId === row.id}
                          onClick={() => void runAction(row.id, 'reject_business')}
                          className="tv-btn-secondary text-xs h-8 px-3 text-rose-800 ring-rose-200 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div className="rounded-xl bg-black/[0.02] ring-1 ring-black/[0.06] p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      Banking / payout
                    </p>
                    <StatusChip tone={statusTone(row.payout_verification_status)}>
                      {humanStatus(row.payout_verification_status)}
                    </StatusChip>
                    {payPending ? <StatusChip tone="warn">In queue</StatusChip> : null}
                  </div>
                  {(row.payout_verification_status ?? '').toLowerCase() === 'rejected' &&
                    (row.payout_verification_feedback ?? '').trim() !== '' && (
                      <p className="text-xs text-ink-muted bg-paper-raised ring-1 ring-black/[0.06] rounded-lg px-2.5 py-1.5">
                        <span className="font-medium text-ink">Saved note: </span>
                        {row.payout_verification_feedback}
                      </p>
                    )}
                  {payPending && (
                    <>
                      <label className="block text-xs font-medium text-ink-muted pt-1">
                        Note if rejecting (IBAN/BIC / bank details — shown under payout section)
                      </label>
                      <textarea
                        value={feedbackDraft[row.id]?.payout ?? ''}
                        onChange={(e) =>
                          setFeedbackDraft((d) => ({
                            ...d,
                            [row.id]: { business: d[row.id]?.business ?? '', payout: e.target.value },
                          }))
                        }
                        rows={2}
                        placeholder="e.g. IBAN format invalid — please check country code and length."
                        className="tv-input w-full text-sm"
                      />
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          disabled={actingId === row.id}
                          onClick={() => void runAction(row.id, 'approve_payout')}
                          className="tv-btn-primary text-xs h-8 px-3 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={actingId === row.id}
                          onClick={() => void runAction(row.id, 'reject_payout')}
                          className="tv-btn-secondary text-xs h-8 px-3 text-rose-800 ring-rose-200 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void toggleExpand(row.id)}
                className="lux-flat inline-flex items-center gap-2 text-sm font-semibold text-finland"
              >
                {expanded ? <ChevronUp className="w-4 h-4" aria-hidden /> : <ChevronDown className="w-4 h-4" aria-hidden />}
                {expanded ? 'Hide submission details' : 'View submission details & files'}
              </button>

              {expanded && (
                <div className="border-t border-black/[0.06] pt-4 space-y-4">
                  <AdminSupplierDetailSection loading={detailLoading} detail={detail ?? null} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
