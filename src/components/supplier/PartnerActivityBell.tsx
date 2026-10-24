/**
 * Partner topbar in-app notifications (supplier_activity_notifications).
 * Deep-links new_review rows into Supplier → Reviews with highlight.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import {
  countUnreadSupplierActivityNotifications,
  fetchSupplierActivityNotifications,
  markAllSupplierActivityNotificationsRead,
  markSupplierActivityNotificationRead,
  type SupplierActivityNotificationRow,
} from '../../data/supabase-supplier-activity-notifications';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';

type Props = {
  enabled: boolean;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

export default function PartnerActivityBell({ enabled }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SupplierActivityNotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useDialogFocus(open, panelRef, () => setOpen(false));

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const [list, count] = await Promise.all([
        fetchSupplierActivityNotifications(25),
        countUnreadSupplierActivityNotifications(),
      ]);
      setRows(list);
      setUnread(count);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notifications');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, [enabled, refresh]);

  if (!enabled) return null;

  const openNotification = async (row: SupplierActivityNotificationRow) => {
    if (!row.read_at) {
      await markSupplierActivityNotificationRead(row.id);
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, read_at: new Date().toISOString() } : r))
      );
      setUnread((n) => Math.max(0, n - 1));
    }
    setOpen(false);
    const path = (row.href_path ?? '').trim();
    if (path.startsWith('/partner')) {
      navigateSupplierUrl(path);
      return;
    }
    if (row.review_id) {
      navigateSupplierUrl(
        `${PARTNER_APP_BASE}/reviews?highlight=${encodeURIComponent(row.review_id)}`
      );
      return;
    }
    navigateSupplierUrl(`${PARTNER_APP_BASE}/reviews`);
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="partner-nav-item lux-flat relative inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void refresh();
        }}
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e11d48] px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/90"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
            <p className="text-[13px] font-semibold text-slate-900">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                className="text-[12px] font-semibold text-[#073b83]"
                onClick={() => {
                  void markAllSupplierActivityNotificationsRead().then(() => {
                    setUnread(0);
                    setRows((prev) =>
                      prev.map((r) => ({ ...r, read_at: r.read_at ?? new Date().toISOString() }))
                    );
                  });
                }}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain">
            {loading && rows.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-[13px] text-slate-500">Loading…</p>
            ) : error ? (
              <p className="px-3.5 py-6 text-center text-[13px] text-rose-700">{error}</p>
            ) : rows.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-[13px] text-slate-500">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const lines = row.body.split('\n').filter(Boolean);
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        className={`lux-flat w-full px-3.5 py-2.5 text-left hover:bg-slate-50 ${
                          row.read_at ? '' : 'bg-[#073b83]/[0.03]'
                        }`}
                        onClick={() => void openNotification(row)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[13px] font-semibold text-slate-900">{row.title}</p>
                          {!row.read_at ? (
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#073b83]" aria-hidden />
                          ) : null}
                        </div>
                        {lines[0] ? (
                          <p className="mt-0.5 text-[12.5px] font-medium text-slate-700">{lines[0]}</p>
                        ) : null}
                        {lines[1] ? (
                          <p className="mt-0.5 text-[12px] tracking-wide text-amber-600">{lines[1]}</p>
                        ) : null}
                        {lines[2] ? (
                          <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-slate-600">
                            {lines[2]}
                          </p>
                        ) : null}
                        {lines[3] ? (
                          <p className="mt-0.5 text-[11.5px] text-slate-500">{lines[3]}</p>
                        ) : null}
                        <p className="mt-1 text-[11px] text-slate-400">{formatWhen(row.created_at)}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
