import { useCallback, useEffect, useState } from 'react';
import { History, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';
import { AdminSupplierDetailSection, type AdminSupplierDetailPayload } from './AdminSupplierDetailSection';

type VerifiedRow = {
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

export default function AdminPastVerificationsPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<VerifiedRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<Record<string, AdminSupplierDetailPayload>>({});

  const loadList = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await invokeAdminEdgeFunction<{ items: VerifiedRow[] }>({ action: 'list_verified' });
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load list');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured()) void loadList();
  }, [loadList]);

  const loadDetail = async (supplierId: string, force = false) => {
    if (!force && detailById[supplierId]) return;
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

  const baseConfigured = isSupabaseConfigured();

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <History className="w-5 h-5 text-slate-700" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">Past verifications</h2>
            <p className="text-sm text-gray-600 mt-1">
              Suppliers who are fully onboarded for payouts: both business identity and bank (payout) details are
              verified. Expand a row to see the full profile and verification files.
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
            onClick={() => void loadList()}
            disabled={loading || !baseConfigured}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
            Refresh list
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{error}</div>
      )}

      {items.length === 0 && !loading && (
        <p className="text-sm text-gray-500">
          No suppliers with both business and payout verification approved yet (or none returned).
        </p>
      )}

      <div className="space-y-4">
        {items.map((row) => {
          const name = row.company_legal_name?.trim() || row.display_name?.trim() || row.id;
          const expanded = expandedId === row.id;
          const detail = detailById[row.id];
          const detailLoading = detailLoadingId === row.id;

          return (
            <div key={row.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">{name}</p>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">{row.id}</p>
                </div>
                <p className="text-xs text-gray-400">
                  Updated {row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-emerald-50/80 border border-emerald-100 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Business</p>
                  <p className="text-gray-800 mt-1">
                    Status: <span className="font-medium">{row.verification_status ?? '—'}</span>
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Payout</p>
                  <p className="text-gray-800 mt-1">
                    Status: <span className="font-medium">{row.payout_verification_status ?? '—'}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void toggleExpand(row.id)}
                className="inline-flex items-center gap-2 text-sm font-medium text-sky-700 hover:text-sky-900"
              >
                {expanded ? <ChevronUp className="w-4 h-4" aria-hidden /> : <ChevronDown className="w-4 h-4" aria-hidden />}
                {expanded ? 'Hide full details' : 'View full profile & documents'}
              </button>

              {expanded && (
                <div className="border-t border-gray-100 pt-4 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void loadDetail(row.id, true)}
                      disabled={detailLoading}
                      className="text-xs font-medium text-sky-700 hover:underline disabled:opacity-50"
                    >
                      Refresh signed document links
                    </button>
                  </div>
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
