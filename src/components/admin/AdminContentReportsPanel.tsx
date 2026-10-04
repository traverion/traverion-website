import { useCallback, useEffect, useState } from 'react';
import { Flag, Loader2, RefreshCw } from 'lucide-react';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';
import { isSupabaseConfigured } from '../../lib/supabase';
import NoticeCallout from '../NoticeCallout';
import EmptyState from '../EmptyState';

type ReportRow = {
  id: string;
  reporter_user_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  review: {
    listing_id: string | null;
    guest_name: string | null;
    rating: number | null;
    comment: string | null;
    hidden_at: string | null;
  } | null;
};

export default function AdminContentReportsPanel() {
  const [items, setItems] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [hideReasonByReview, setHideReasonByReview] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await invokeAdminEdgeFunction<{ items: ReportRow[] }>({
        action: 'content_reports_list',
      });
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load reports');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured()) void load();
  }, [load]);

  const setStatus = async (reportId: string, status: 'resolved' | 'dismissed') => {
    setBusyId(reportId);
    setActionMsg(null);
    try {
      await invokeAdminEdgeFunction({
        action: 'resolve_content_report',
        reportId,
        reportStatus: status,
        reportResolutionNote: status === 'resolved' ? 'Actioned in admin' : 'Dismissed — no public action',
      });
      setActionMsg(status === 'resolved' ? 'Report marked resolved.' : 'Report dismissed.');
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Could not update report');
    } finally {
      setBusyId(null);
    }
  };

  const hideReview = async (reviewId: string, reportId: string) => {
    const reason = (hideReasonByReview[reviewId] ?? '').trim();
    if (reason.length < 3) {
      setActionMsg('Enter a hide reason (at least 3 characters) before hiding the review.');
      return;
    }
    setBusyId(reportId);
    setActionMsg(null);
    try {
      const res = await invokeAdminEdgeFunction<{ ok: boolean; skipped?: boolean }>({
        action: 'hide_review',
        reviewId,
        hideReviewReason: reason,
      });
      await invokeAdminEdgeFunction({
        action: 'resolve_content_report',
        reportId,
        reportStatus: 'resolved',
        reportResolutionNote: res.skipped ? 'Review already hidden' : `Hidden: ${reason.slice(0, 200)}`,
      });
      setActionMsg(res.skipped ? 'Review was already hidden. Report resolved.' : 'Review hidden from public listing. Report resolved.');
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Could not hide review');
    } finally {
      setBusyId(null);
    }
  };

  const open = items.filter((i) => i.status === 'open');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland">Safety</p>
          <h2 className="font-display text-xl text-ink tracking-tight mt-1">Content reports</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Traveler reports of reviews (and other targets). Hide removes a review from public discovery; history stays.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="tv-btn-secondary text-sm inline-flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
          Refresh
        </button>
      </div>

      {error ? (
        <NoticeCallout title="Could not load reports" tone="danger">
          {error}
        </NoticeCallout>
      ) : null}
      {actionMsg ? (
        <NoticeCallout title="Update" tone="info">
          {actionMsg}
        </NoticeCallout>
      ) : null}

      {loading && items.length === 0 ? (
        <p className="text-sm text-ink-muted inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading reports…
        </p>
      ) : null}

      {!loading && open.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="No open reports"
          body="When travelers report a review, it appears here for Traverion staff."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="tv-card p-4 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-ink">
                  {r.target_type} · {r.reason}
                  <span className="ml-2 text-xs uppercase tracking-wide text-ink-faint">{r.status}</span>
                </p>
                <p className="text-xs text-ink-muted tabular-nums">
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              {r.details ? <p className="text-sm text-ink-muted whitespace-pre-wrap">{r.details}</p> : null}
              {r.review ? (
                <div className="rounded-xl bg-ink/[0.03] px-3 py-2.5 text-sm ring-1 ring-black/[0.04]">
                  <p className="font-medium text-ink">
                    {r.review.guest_name ?? 'Guest'}
                    {r.review.rating != null ? ` · ${r.review.rating}★` : ''}
                    {r.review.hidden_at ? ' · already hidden' : ''}
                  </p>
                  {r.review.comment ? (
                    <p className="mt-1 text-ink-muted whitespace-pre-wrap">{r.review.comment}</p>
                  ) : null}
                </div>
              ) : null}

              {r.status === 'open' ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                  {r.target_type === 'review' && r.review && !r.review.hidden_at ? (
                    <>
                      <label className="flex-1 min-w-[12rem] text-xs text-ink-muted">
                        Hide reason
                        <input
                          type="text"
                          value={hideReasonByReview[r.target_id] ?? ''}
                          onChange={(e) =>
                            setHideReasonByReview((prev) => ({ ...prev, [r.target_id]: e.target.value }))
                          }
                          className="mt-1 w-full rounded-lg bg-paper-raised px-3 py-2 text-sm text-ink ring-1 ring-black/[0.06]"
                          placeholder="Why this review is hidden"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void hideReview(r.target_id, r.id)}
                        className="tv-btn-primary text-sm disabled:opacity-50"
                      >
                        Hide review
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void setStatus(r.id, 'resolved')}
                    className="tv-btn-secondary text-sm disabled:opacity-50"
                  >
                    Mark resolved
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void setStatus(r.id, 'dismissed')}
                    className="tv-btn-secondary text-sm disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
