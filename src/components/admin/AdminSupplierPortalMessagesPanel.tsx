import { useCallback, useEffect, useState } from 'react';
import { Loader2, Megaphone, RefreshCw, Trash2 } from 'lucide-react';
import LuxuryButton from '../ui/LuxuryButton';
import LuxuryCard from '../ui/LuxuryCard';
import { isSupabaseConfigured } from '../../lib/supabase';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';

type NoticeRow = {
  id: string;
  title: string;
  body: string;
  variant: string;
  audience: string;
  supplier_user_id: string | null;
  created_at: string;
};

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-finland shrink-0" />
            Supplier portal messages
          </h2>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Banners appear on each supplier&apos;s <strong>Dashboard</strong> under Quick start. Send to everyone or to
            one supplier using their <strong>user id</strong> (same as profile id in the verification queue).
          </p>
        </div>
        <LuxuryButton variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </LuxuryButton>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{error}</div>
      )}

      <LuxuryCard variant="glass" className="p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">New message</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-gray-600">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="e.g. Update your payment details"
              maxLength={300}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Style</span>
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value as 'info' | 'warning' | 'success')}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="success">Success</option>
            </select>
          </label>
        </div>
        <fieldset className="text-sm">
          <legend className="text-gray-600 mb-2">Audience</legend>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="radio" name="aud" checked={audience === 'all'} onChange={() => setAudience('all')} />
              All suppliers
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="radio" name="aud" checked={audience === 'supplier'} onChange={() => setAudience('supplier')} />
              One supplier
            </label>
          </div>
        </fieldset>
        {audience === 'supplier' && (
          <label className="block text-sm">
            <span className="text-gray-600">Supplier user id (UUID)</span>
            <input
              value={supplierUserId}
              onChange={(e) => setSupplierUserId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </label>
        )}
        <label className="block text-sm">
          <span className="text-gray-600">Message</span>
          <textarea
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Explain what you need them to do and where in Settings to find it."
            maxLength={8000}
          />
        </label>
        <LuxuryButton variant="gradient" size="sm" onClick={() => void createNotice()} disabled={saving || !title.trim() || !messageBody.trim()}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Publish message
        </LuxuryButton>
      </LuxuryCard>

      <LuxuryCard variant="glass" className="p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Published ({items.length})</h3>
        {loading && items.length === 0 ? (
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500">No messages yet.</p>
        ) : (
          <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden bg-white">
            {items.map((n) => (
              <li key={n.id} className="p-4 flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{n.title}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{n.variant}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-finland/10 text-finland">
                      {n.audience === 'all' ? 'All suppliers' : 'One supplier'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{n.body}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {new Date(n.created_at).toLocaleString()}
                    {n.supplier_user_id ? ` · ${n.supplier_user_id}` : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(n.id)}
                  disabled={deletingId === n.id}
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {deletingId === n.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </LuxuryCard>
    </div>
  );
}
