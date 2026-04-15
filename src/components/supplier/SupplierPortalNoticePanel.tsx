import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import {
  fetchSupplierPortalNotifications,
  type SupplierPortalNotificationRow,
} from '../../data/supabase-supplier-portal-notifications';

const DISMISS_STORAGE_KEY = (userId: string) => `supplier_portal_notice_dismissed_v1_${userId}`;

function readDismissedIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY(userId));
    const arr = JSON.parse(raw ?? '[]') as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function writeDismissedIds(userId: string, ids: Set<string>) {
  localStorage.setItem(DISMISS_STORAGE_KEY(userId), JSON.stringify([...ids]));
}

function variantStyles(variant: SupplierPortalNotificationRow['variant']) {
  switch (variant) {
    case 'warning':
      return {
        wrap: 'border-amber-200 bg-amber-50/90 text-amber-950',
        icon: AlertTriangle,
        iconClass: 'text-amber-600',
      };
    case 'success':
      return {
        wrap: 'border-emerald-200 bg-emerald-50/90 text-emerald-950',
        icon: CheckCircle,
        iconClass: 'text-emerald-600',
      };
    default:
      return {
        wrap: 'border-sky-200 bg-sky-50/90 text-sky-950',
        icon: Info,
        iconClass: 'text-sky-600',
      };
  }
}

type SupplierPortalNoticePanelProps = {
  userId: string;
};

export default function SupplierPortalNoticePanel({ userId }: SupplierPortalNoticePanelProps) {
  const [rows, setRows] = useState<SupplierPortalNotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissedIds(userId));

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchSupplierPortalNotifications()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load messages'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDismissed(readDismissedIds(userId));
  }, [userId]);

  const visible = useMemo(
    () => rows.filter((r) => !dismissed.has(r.id)),
    [rows, dismissed]
  );

  const dismissOne = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeDismissedIds(userId, next);
      return next;
    });
  };

  if (loading && rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-gray-500">
        Loading messages…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-3">
        <span>{error}</span>
        <button type="button" onClick={() => void load()} className="text-red-900 font-medium underline shrink-0">
          Retry
        </button>
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-gray-500 shadow-sm ring-1 ring-slate-900/5">
        No messages from Traverion right now.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Messages from Traverion</h2>
      </div>
      <ul className="space-y-2">
        {visible.map((n) => {
          const vs = variantStyles(n.variant);
          const Icon = vs.icon;
          return (
            <li
              key={n.id}
              className={`relative flex gap-3 rounded-xl border-2 px-4 py-3 pr-11 shadow-sm ${vs.wrap}`}
            >
              <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${vs.iconClass}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug">{n.title}</p>
                <p className="text-xs sm:text-sm mt-1 whitespace-pre-wrap opacity-95">{n.body}</p>
              </div>
              <button
                type="button"
                onClick={() => dismissOne(n.id)}
                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-white/80 text-gray-700 hover:bg-white shadow-sm"
                aria-label="Dismiss this message"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
