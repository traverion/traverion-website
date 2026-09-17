import { useCallback, useEffect, useState } from 'react';
import { Loader2, Megaphone, RefreshCw, Trash2 } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';
import NoticeCallout from '../NoticeCallout';
import StatusChip from '../StatusChip';
import EmptyState from '../EmptyState';

type NoticeRow = {
  id: string;
  title: string;
  body: string;
  variant: string;
  audience: string;
  supplier_user_id: string | null;
  created_at: string;
};

function variantTone(v: string): 'info' | 'warn' | 'good' | 'neutral' {
  const s = v.toLowerCase();
  if (s === 'warning') return 'warn';
  if (s === 'success') return 'good';
  if (s === 'info') return 'info';
  return 'neutral';
}

function variantLabel(v: string): string {
  const s = v.toLowerCase();
  if (s === 'warning') return 'Warning';
  if (s === 'success') return 'Success';
  if (s === 'info') return 'Info';
  return v || 'Info';
}

export default function AdminSupplierPortalMessagesPanel() {
  const [items, setItems] = useState<NoticeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [variant, setVariant] = useState<'info' | 'warning' | 'success'>('info');
  const [audience, setAudience] = useState<'all' | 'supplier'>('all');
  const [supplierUserId, setSupplierUserId] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await invokeAdminEdgeFunction<{ items: NoticeRow[] }>({ action: 'list_portal_notifications' });
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load messages');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured()) void load();
  }, [load]);

  const createNotice = async () => {
    setError(null);
    setSaving(true);
    try {
      await invokeAdminEdgeFunction({
        action: 'create_portal_notification',
        notificationTitle: title.trim(),
        notificationBody: messageBody.trim(),
        notificationVariant: variant,
        notificationAudience: audience,
        supplierUserId: audience === 'supplier' ? supplierUserId.trim() : undefined,
      });
      setTitle('');
      setMessageBody('');
      setSupplierUserId('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create message');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    setDeletingId(id);
    try {
      await invokeAdminEdgeFunction({ action: 'delete_portal_notification', notificationId: id });
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="font-display text-xl text-ink tracking-tight flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-finland/10 text-finland">
              <Megaphone className="w-5 h-5" aria-hidden />
            </span>
            Supplier portal messages
          </h2>
          <p className="text-sm text-ink-muted mt-2 leading-relaxed">
            Banners appear on each supplier&apos;s <strong className="text-ink font-semibold">Dashboard</strong> under
            Quick start. Publish for everyone or for one supplier using their{' '}
            <strong className="text-ink font-semibold">user id</strong> (same as profile id in the verification queue).
            These are portal banners — not emails.
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
        <NoticeCallout title="Could not update messages" tone="danger">
          {error}
        </NoticeCallout>
      ) : null}

      <div className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06] space-y-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">New message</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="tv-input mt-1.5 w-full text-sm"
              placeholder="e.g. Update your payment details"
              maxLength={300}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Style</span>
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value as 'info' | 'warning' | 'success')}
              className="tv-input mt-1.5 w-full text-sm"
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="success">Success</option>
            </select>
          </label>
        </div>
        <fieldset className="text-sm">
          <legend className="text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-2">Audience</legend>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 cursor-pointer text-ink">
              <input type="radio" name="aud" checked={audience === 'all'} onChange={() => setAudience('all')} />
              All suppliers
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer text-ink">
              <input type="radio" name="aud" checked={audience === 'supplier'} onChange={() => setAudience('supplier')} />
              One supplier
            </label>
          </div>
        </fieldset>
        {audience === 'supplier' ? (
          <label className="block text-sm">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Supplier user id (UUID)</span>
            <input
              value={supplierUserId}
              onChange={(e) => setSupplierUserId(e.target.value)}
              className="tv-input mt-1.5 w-full text-sm font-mono"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </label>
        ) : null}
        <label className="block text-sm">
          <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Message</span>
          <textarea
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            rows={4}
            className="tv-input mt-1.5 w-full text-sm min-h-[6rem] resize-y"
            placeholder="Explain what you need them to do and where in Settings to find it."
            maxLength={8000}
          />
        </label>
        <button
          type="button"
          onClick={() => void createNotice()}
          disabled={saving || !title.trim() || !messageBody.trim()}
          className="tv-btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
          Publish message
        </button>
      </div>

      <div className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-4">
          Published ({items.length})
        </h3>
        {loading && items.length === 0 ? (
          <p className="text-sm text-ink-muted flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading…
          </p>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            className="py-8 sm:py-10"
            title="No portal messages yet"
            body="Published banners will show here and on supplier dashboards under Quick start."
          />
        ) : (
          <ul className="space-y-3 m-0 p-0 list-none">
            {items.map((n) => (
              <li
                key={n.id}
                className="rounded-xl bg-black/[0.02] ring-1 ring-black/[0.06] p-4 flex flex-col sm:flex-row sm:items-start gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{n.title}</span>
                    <StatusChip tone={variantTone(n.variant)}>{variantLabel(n.variant)}</StatusChip>
                    <StatusChip tone="info">{n.audience === 'all' ? 'All suppliers' : 'One supplier'}</StatusChip>
                  </div>
                  <p className="text-sm text-ink-muted mt-1.5 whitespace-pre-wrap leading-relaxed">{n.body}</p>
                  <p className="text-xs text-ink-faint mt-2">
                    {new Date(n.created_at).toLocaleString()}
                    {n.supplier_user_id ? ` · ${n.supplier_user_id}` : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(n.id)}
                  disabled={deletingId === n.id}
                  className="shrink-0 tv-btn-secondary text-sm inline-flex items-center gap-1.5 text-rose-800 ring-rose-200 disabled:opacity-50"
                >
                  {deletingId === n.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="w-4 h-4" aria-hidden />
                  )}
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
