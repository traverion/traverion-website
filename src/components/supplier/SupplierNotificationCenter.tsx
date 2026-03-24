/**
 * In-app notification bell for suppliers (derived from bookings + reviews; dismiss + prefs in localStorage).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Bell, X, Calendar, Star, ChevronRight, Loader2 } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchBookingsForSupplier } from '../../data/supabase-bookings';
import { fetchMyListings } from '../../data/supabase-listings';
import {
  fetchReviewsForSupplierListings,
  getReviewRepliesByReviewIds,
} from '../../data/supabase-reviews';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import {
  loadSupplierNotifPrefs,
  loadDismissedNotificationKeys,
  dismissNotificationKey,
  clearDismissedNotifications,
  isWithinQuietHours,
} from '../../lib/supplierNotificationPrefs';

export type SupplierNotifItem = {
  key: string;
  kind: 'booking' | 'review';
  urgency: 'high' | 'normal';
  title: string;
  subtitle: string;
  createdAt: string;
  href: string;
};

async function buildNotificationItems(supplierId: string): Promise<SupplierNotifItem[]> {
  const [bookings, listings, reviews] = await Promise.all([
    fetchBookingsForSupplier(supplierId),
    fetchMyListings(supplierId),
    fetchReviewsForSupplierListings(supplierId),
  ]);

  const titleByListing: Record<string, string> = {};
  listings.forEach((l) => {
    titleByListing[l.id] = l.title;
  });

  const items: SupplierNotifItem[] = [];

  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    if (b.acknowledged_at) continue;
    items.push({
      key: `booking:${b.id}`,
      kind: 'booking',
      urgency: b.status === 'pending' ? 'high' : 'normal',
      title: 'Booking needs acknowledgement',
      subtitle: `${titleByListing[b.listing_id] ?? 'Listing'} · ${b.guest_name ?? b.guest_email ?? 'Guest'}`,
      createdAt: b.created_at,
      href: '/supplier/bookings',
    });
  }

  const reviewIds = reviews.map((r) => r.id);
  const replies = await getReviewRepliesByReviewIds(reviewIds);
  for (const r of reviews) {
    if (replies[r.id]) continue;
    items.push({
      key: `review:${r.id}`,
      kind: 'review',
      urgency: r.rating <= 3 ? 'high' : 'normal',
      title: 'New review — reply suggested',
      subtitle: `${r.listing_title ?? 'Listing'} · ${r.guest_name}`,
      createdAt: r.created_at,
      href: `/supplier/reviews?highlight=${encodeURIComponent(r.id)}`,
    });
  }

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return items;
}

export default function SupplierNotificationCenter() {
  const { user, isSupabase } = useSupplierAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SupplierNotifItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissedNotificationKeys());
  const [prefs, setPrefs] = useState(loadSupplierNotifPrefs);

  const refreshDismissed = useCallback(() => {
    setDismissed(loadDismissedNotificationKeys());
  }, []);

  useEffect(() => {
    const onDismiss = () => refreshDismissed();
    const onPrefs = () => setPrefs(loadSupplierNotifPrefs());
    window.addEventListener('traverion-supplier-notif-dismiss', onDismiss);
    window.addEventListener('traverion-supplier-notif-prefs', onPrefs);
    return () => {
      window.removeEventListener('traverion-supplier-notif-dismiss', onDismiss);
      window.removeEventListener('traverion-supplier-notif-prefs', onPrefs);
    };
  }, [refreshDismissed]);

  const load = useCallback(async () => {
    if (!isSupabase || !user?.id) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const next = await buildNotificationItems(user.id);
      setItems(next);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [isSupabase, user?.id]);

  useEffect(() => {
    if (!isSupabase || !user) return;
    load();
    const t = window.setInterval(load, 120_000);
    return () => window.clearInterval(t);
  }, [isSupabase, user, load]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const visible = useMemo(() => {
    const quietNow = isWithinQuietHours(prefs);
    const suppressInApp = !prefs.channelInApp || quietNow;
    return items.filter((it) => {
      if (suppressInApp) return false;
      if (dismissed.has(it.key)) return false;
      if (it.kind === 'booking' && !prefs.newBookings) return false;
      if (it.kind === 'review' && !prefs.reviewsNeedReply) return false;
      if (it.kind === 'booking' && prefs.bookingUrgency === 'high_only' && it.urgency !== 'high') return false;
      if (it.kind === 'review' && prefs.reviewUrgency === 'high_only' && it.urgency !== 'high') return false;
      return true;
    });
  }, [items, dismissed, prefs]);

  const unreadCount = visible.length;

  if (!isSupabase || !user) return null;

  return (
    <div className="relative mr-2 sm:mr-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative no-lux-interaction lux-tap-target p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] h-[1.125rem] px-1 flex items-center justify-center rounded-full bg-finland text-white text-[10px] font-bold tabular-nums">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-[min(100vw-2rem,22rem)] z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
              <div className="flex items-center gap-1">
                {visible.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      visible.forEach((it) => dismissNotificationKey(it.key));
                      refreshDismissed();
                    }}
                    className="text-xs text-finland hover:underline px-1"
                  >
                    Clear all
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1 rounded-lg text-gray-500 hover:bg-gray-100"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[min(70vh,24rem)] overflow-y-auto">
              {loading && items.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-10 text-gray-500 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading…
                </div>
              ) : visible.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-gray-500">You&apos;re all caught up.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {visible.map((it) => (
                    <li key={it.key} className="group">
                      <div className="flex items-stretch">
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            navigateSupplierUrl(it.href);
                          }}
                          className="flex-1 text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3 min-w-0"
                        >
                          <span className="mt-0.5 p-1.5 rounded-lg bg-finland/10 text-finland flex-shrink-0">
                            {it.kind === 'booking' ? (
                              <Calendar className="w-4 h-4" />
                            ) : (
                              <Star className="w-4 h-4" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="text-sm font-medium text-gray-900 block">{it.title}</span>
                            <span className={`inline-flex mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                              it.urgency === 'high' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {it.urgency}
                            </span>
                            <span className="text-xs text-gray-600 line-clamp-2">{it.subtitle}</span>
                            <span className="text-[11px] text-gray-400 mt-1 block">
                              {new Date(it.createdAt).toLocaleString()}
                            </span>
                          </span>
                          <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            dismissNotificationKey(it.key);
                            refreshDismissed();
                          }}
                          className="px-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 flex-shrink-0"
                          title="Dismiss"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/80">
              <button
                type="button"
                onClick={() => {
                  clearDismissedNotifications();
                  refreshDismissed();
                }}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Restore dismissed
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
