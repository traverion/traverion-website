import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Loader2, RefreshCw, FileText, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';

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

type DetailProfile = Record<string, unknown>;

type DetailResponse = {
  profile: DetailProfile;
  documents: {
    identity: { path: string; signedUrl: string | null } | null;
    company_registration: { path: string; signedUrl: string | null } | null;
  };
  signedUrlExpiresInSeconds?: number;
};

function formatLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const DETAIL_SKIP = new Set([
  'identity_document_path',
  'company_registration_document_path',
  'business_logo_url',
]);

export default function AdminSupplierVerificationPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<QueueRow[]>([]);
  const [feedbackDraft, setFeedbackDraft] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<Record<string, DetailResponse>>({});

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
      const data = await invokeAdminEdgeFunction<DetailResponse>({ action: 'detail', supplierId });
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
      const feedback =
        action === 'reject_business' || action === 'reject_payout'
          ? (feedbackDraft[supplierId] ?? '').trim() || null
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
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-5 h-5 text-emerald-700" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">Supplier verification queue</h2>
            <p className="text-sm text-gray-600 mt-1">
              Review submitted business and payout data. Open verification files in a new tab. Approve or reject
              separately; rejection notes are shown to the supplier.
            </p>
          </div>
        </div>

        {!baseConfigured && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Set <code className="text-xs">VITE_SUPABASE_URL</code> and <code className="text-xs">VITE_SUPABASE_ANON_KEY</code>{' '}
            in your env.
          </p>
        )}

        <div className="mt-4">
          <button
            type="button"
            onClick={() => void loadQueue()}
            disabled={loading || !baseConfigured}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh queue
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{error}</div>
      )}

      {items.length === 0 && !loading && (
        <p className="text-sm text-gray-500">
          No rows in queue (no supplier with business or payout status pending after submit).
        </p>
      )}

      <div className="space-y-4">
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
              className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">{name}</p>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">{row.id}</p>
                </div>
                <p className="text-xs text-gray-400">
                  Updated {row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Business</p>
                  <p className="text-gray-800">
                    Status: <span className="font-medium">{row.verification_status ?? '—'}</span>
                    {bizPending ? <span className="text-amber-700"> · in queue</span> : null}
                  </p>
                  {bizPending && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        disabled={actingId === row.id}
                        onClick={() => void runAction(row.id, 'approve_business')}
                        className="px-2.5 py-1 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={actingId === row.id}
                        onClick={() => void runAction(row.id, 'reject_business')}
                        className="px-2.5 py-1 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
                <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Payout</p>
                  <p className="text-gray-800">
                    Status: <span className="font-medium">{row.payout_verification_status ?? '—'}</span>
                    {payPending ? <span className="text-amber-700"> · in queue</span> : null}
                  </p>
                  {payPending && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        disabled={actingId === row.id}
                        onClick={() => void runAction(row.id, 'approve_payout')}
                        className="px-2.5 py-1 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={actingId === row.id}
                        onClick={() => void runAction(row.id, 'reject_payout')}
                        className="px-2.5 py-1 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Optional note on reject (shown to supplier)
                </label>
                <textarea
                  value={feedbackDraft[row.id] ?? ''}
                  onChange={(e) => setFeedbackDraft((d) => ({ ...d, [row.id]: e.target.value }))}
                  rows={2}
                  placeholder="e.g. Registration document is unreadable — please upload a clearer PDF."
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <button
                type="button"
                onClick={() => void toggleExpand(row.id)}
                className="inline-flex items-center gap-2 text-sm font-medium text-sky-700 hover:text-sky-900"
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {expanded ? 'Hide submission details' : 'View submission details & files'}
              </button>

              {expanded && (
                <div className="border-t border-gray-100 pt-4 space-y-4">
                  {detailLoading && (
                    <p className="text-sm text-gray-500 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading profile…
                    </p>
                  )}
                  {!detailLoading && detail && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {detail.documents.identity?.signedUrl && (
                          <a
                            href={detail.documents.identity.signedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-800 text-xs font-medium hover:bg-slate-200"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Identity document
                            <ExternalLink className="w-3 h-3 opacity-70" />
                          </a>
                        )}
                        {detail.documents.identity?.path && !detail.documents.identity.signedUrl && (
                          <span className="text-xs text-amber-700">Identity file on file (could not sign URL)</span>
                        )}
                        {detail.documents.company_registration?.signedUrl && (
                          <a
                            href={detail.documents.company_registration.signedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-800 text-xs font-medium hover:bg-slate-200"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Company registration
                            <ExternalLink className="w-3 h-3 opacity-70" />
                          </a>
                        )}
                        {detail.documents.company_registration?.path &&
                          !detail.documents.company_registration.signedUrl && (
                            <span className="text-xs text-amber-700">
                              Registration file on file (could not sign URL)
                            </span>
                          )}
                        {!detail.documents.identity && !detail.documents.company_registration && (
                          <span className="text-xs text-gray-500">No verification documents uploaded.</span>
                        )}
                      </div>
                      {detail.signedUrlExpiresInSeconds && (
                        <p className="text-xs text-gray-400">
                          Document links expire in about {Math.round(detail.signedUrlExpiresInSeconds / 60)} minutes.
                        </p>
                      )}
                      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        {Object.entries(detail.profile)
                          .filter(([k]) => !DETAIL_SKIP.has(k))
                          .map(([k, v]) => (
                            <div key={k} className="flex flex-col sm:flex-row sm:gap-2 border-b border-gray-50 pb-1">
                              <span className="text-gray-500 shrink-0 w-44">{formatLabel(k)}</span>
                              <span className="text-gray-900 break-words">
                                {v === null || v === undefined || v === '' ? '—' : String(v)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
