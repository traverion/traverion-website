import { useCallback, useEffect, useState } from 'react';
import { History, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';
import { AdminSupplierDetailSection, type AdminSupplierDetailPayload } from './AdminSupplierDetailSection';
import NoticeCallout from '../NoticeCallout';
import StatusChip from '../StatusChip';
import EmptyState from '../EmptyState';

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

function humanStatus(status: string | null | undefined): string {
  const s = (status ?? '').trim();
  if (!s) return 'Not submitted';
  if (s === 'pending') return 'Pending';
  if (s === 'approved' || s === 'verified') return 'Approved';
  if (s === 'rejected') return 'Rejected';
  return s;
}

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
      <div className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-finland/10 flex items-center justify-center shrink-0">
            <History className="w-5 h-5 text-finland" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl text-ink tracking-tight">Past verifications</h2>
            <p className="text-sm text-ink-muted mt-1 leading-relaxed">
              Suppliers who are fully onboarded for payouts: both business identity and bank (payout) details are
              verified. Expand a row to see the full profile and verification files.
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
            onClick={() => void loadList()}
            disabled={loading || !baseConfigured}
            className="tv-btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
            Refresh list
          </button>
        </div>
      </div>

      {error ? (
        <NoticeCallout title="Could not load list" tone="danger">
          {error}
        </NoticeCallout>
      ) : null}

      {items.length === 0 && !loading ? (
        <div className="rounded-2xl bg-paper-raised px-4 py-2 shadow-soft ring-1 ring-black/[0.06]">
          <EmptyState
            icon={History}
            title="No fully verified suppliers yet"
            body="When a supplier has both business and payout verification approved, they appear here."
          />
        </div>
      ) : null}

      <div className="space-y-3">
        {items.map((row) => {
          const name = row.company_legal_name?.trim() || row.display_name?.trim() || row.id;
          const expanded = expandedId === row.id;
          const detail = detailById[row.id];
          const detailLoading = detailLoadingId === row.id;

          return (
            <div key={row.id} className="rounded-2xl bg-paper-raised p-4 sm:p-5 shadow-soft ring-1 ring-black/[0.06] space-y-3">
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
                <div className="rounded-xl bg-emerald-50/70 ring-1 ring-emerald-200/60 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-900/70">Business</p>
                    <StatusChip tone="good">{humanStatus(row.verification_status)}</StatusChip>
                  </div>
                </div>
                <div className="rounded-xl bg-finland/8 ring-1 ring-finland/15 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Payout</p>
                    <StatusChip tone="good">{humanStatus(row.payout_verification_status)}</StatusChip>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void toggleExpand(row.id)}
                className="lux-flat inline-flex items-center gap-2 text-sm font-semibold text-finland"
              >
                {expanded ? <ChevronUp className="w-4 h-4" aria-hidden /> : <ChevronDown className="w-4 h-4" aria-hidden />}
                {expanded ? 'Hide full details' : 'View full profile & documents'}
              </button>

              {expanded && (
                <div className="border-t border-black/[0.06] pt-4 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void loadDetail(row.id, true)}
                      disabled={detailLoading}
                      className="lux-flat text-xs font-semibold text-finland disabled:opacity-50"
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
