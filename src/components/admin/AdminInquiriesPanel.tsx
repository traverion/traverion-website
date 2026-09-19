import { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, RefreshCw } from 'lucide-react';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';
import { isSupabaseConfigured } from '../../lib/supabase';
import NoticeCallout from '../NoticeCallout';
import StatusChip from '../StatusChip';
import EmptyState from '../EmptyState';

type InquiryRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  inquiry_type: string | null;
  status: string | null;
  created_at: string;
};

function inquiryTypeLabel(type: string | null): string {
  const t = (type ?? '').trim().toLowerCase();
  if (t === 'affiliate') return 'Affiliate';
  if (t === 'content_creator') return 'Content creator';
  return 'General';
}

export default function AdminInquiriesPanel() {
  const [items, setItems] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await invokeAdminEdgeFunction<{ items: InquiryRow[] }>({ action: 'list_contact_inquiries' });
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load inquiries');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured()) void load();
  }, [load]);

  const setStatus = async (id: string, status: 'new' | 'resolved') => {
    setUpdatingId(id);
    setError(null);
    try {
      await invokeAdminEdgeFunction({ action: 'update_contact_inquiry_status', inquiryId: id, inquiryStatus: status });
      setItems((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update this inquiry');
    } finally {
      setUpdatingId(null);
    }
  };

  const isResolved = (row: InquiryRow) => (row.status ?? '').trim().toLowerCase() === 'resolved';
  const visible = showResolved ? items : items.filter((row) => !isResolved(row));
  const openCount = items.filter((row) => !isResolved(row)).length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-finland/10 flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-finland" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl text-ink tracking-tight">Inquiries</h2>
            <p className="text-sm text-ink-muted mt-1 leading-relaxed">
              Contact, affiliate, and content-creator form submissions. Each one already emails{' '}
              <code className="text-xs font-mono">info@traverion.com</code> when it's submitted — this list is
              the record in the product, so a lost or missed email doesn't mean a lost inquiry.
            </p>
          </div>
        </div>

        {!isSupabaseConfigured() ? (
          <NoticeCallout title="Supabase not configured" tone="warn">
            Inquiries need the live app configuration.
          </NoticeCallout>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowResolved((v) => !v)}
            aria-pressed={showResolved}
            className={`lux-flat rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ring-1 ${
              showResolved
                ? 'bg-finland text-white shadow-sm ring-finland/30'
                : 'bg-paper text-ink-muted ring-black/[0.06] hover:bg-finland/10 hover:text-finland'
            }`}
          >
            {showResolved ? 'Showing all' : `Open only · ${openCount}`}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || !isSupabaseConfigured()}
            className="tv-btn-secondary text-sm inline-flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <NoticeCallout title="Could not load inquiries" tone="danger">
          {error}
        </NoticeCallout>
      ) : null}

      {!loading && !error && visible.length === 0 ? (
        <div className="rounded-2xl bg-paper-raised px-4 py-2 shadow-soft ring-1 ring-black/[0.06]">
          <EmptyState
            icon={Mail}
            title={items.length === 0 ? 'No inquiries yet' : 'Nothing open'}
            body={
              items.length === 0
                ? 'No one has submitted the contact, affiliate, or content-creator form yet.'
                : 'Every inquiry is marked resolved. Toggle "Showing all" to see the history.'
            }
          />
        </div>
      ) : null}

      <div className="space-y-2">
        {visible.map((row) => {
          const resolved = isResolved(row);
          return (
            <div
              key={row.id}
              className="rounded-2xl bg-paper-raised px-4 py-3.5 shadow-soft ring-1 ring-black/[0.06]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{row.subject || '(no subject)'}</p>
                    <StatusChip tone={resolved ? 'good' : 'warn'}>{resolved ? 'Resolved' : 'Open'}</StatusChip>
                    <StatusChip tone="neutral">{inquiryTypeLabel(row.inquiry_type)}</StatusChip>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {row.name} · <a href={`mailto:${row.email}`} className="text-finland hover:underline">{row.email}</a>
                    {row.phone ? ` · ${row.phone}` : ''}
                  </p>
                  <p className="mt-2 text-sm text-ink whitespace-pre-wrap">{row.message}</p>
                  <p className="mt-2 text-xs text-ink-faint">{new Date(row.created_at).toLocaleString()}</p>
                </div>
                <button
                  type="button"
                  disabled={updatingId === row.id}
                  onClick={() => void setStatus(row.id, resolved ? 'new' : 'resolved')}
                  className="tv-btn-secondary text-xs h-8 px-3 shrink-0 disabled:opacity-50"
                >
                  {updatingId === row.id ? 'Saving…' : resolved ? 'Reopen' : 'Mark resolved'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
