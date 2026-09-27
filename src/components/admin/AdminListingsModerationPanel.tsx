import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Search, ShieldOff } from 'lucide-react';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';
import { isSupabaseConfigured } from '../../lib/supabase';
import NoticeCallout from '../NoticeCallout';
import EmptyState from '../EmptyState';

type ModerationListing = {
  id: string;
  title: string | null;
  status: string | null;
  type: string | null;
  city: string | null;
  country: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  updated_at: string | null;
};

type ModerationEvent = {
  id: string;
  listing_id: string;
  supplier_id: string | null;
  action: string;
  previous_status: string | null;
  new_status: string;
  reason: string;
  actor_email: string | null;
  upcoming_paid_bookings: number;
  created_at: string;
  listing_title?: string | null;
};

export default function AdminListingsModerationPanel() {
  const [items, setItems] = useState<ModerationListing[]>([]);
  const [events, setEvents] = useState<ModerationEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await invokeAdminEdgeFunction<{
        items: ModerationListing[];
        events: ModerationEvent[];
      }>({
        action: 'listings_moderation_list',
        listingSearch: search,
      });
      setItems(Array.isArray(data.items) ? data.items : []);
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load listings');
      setItems([]);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (isSupabaseConfigured()) void load();
  }, [load]);

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const forceUnpublish = async (listingId: string) => {
    const reason = (reasonById[listingId] ?? '').trim();
    if (reason.length < 3) {
      setActionMsg('Enter a moderation reason (at least 3 characters) before unpublishing.');
      return;
    }
    setBusyId(listingId);
    setActionMsg(null);
    try {
      const res = await invokeAdminEdgeFunction<{
        ok: boolean;
        skipped?: boolean;
        upcoming_paid_bookings?: number;
        title?: string | null;
      }>({
        action: 'force_unpublish_listing',
        listingId,
        moderationReason: reason,
      });
      if (res.skipped) {
        setActionMsg('Listing was already unpublished (draft). No audit row added.');
      } else {
        const upcoming = res.upcoming_paid_bookings ?? 0;
        setActionMsg(
          upcoming > 0
            ? `Unpublished “${res.title ?? listingId}”. ${upcoming} upcoming paid booking(s) remain — travelers keep their trips.`
            : `Unpublished “${res.title ?? listingId}”. Removed from traveler discovery.`
        );
      }
      setReasonById((prev) => {
        const next = { ...prev };
        delete next[listingId];
        return next;
      });
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Force unpublish failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <NoticeCallout title="Staff force-unpublish" tone="info">
        Removes a listing from traveler search and detail (status → draft). Does not cancel or rewrite
        existing paid bookings. Requires a written reason; actions are audited.
      </NoticeCallout>

      {actionMsg ? (
        <NoticeCallout title="Moderation result" tone="info">
          {actionMsg}
        </NoticeCallout>
      ) : null}

      {error ? (
        <NoticeCallout
          title="Could not load listings"
          tone="danger"
          action={
            <button type="button" onClick={() => void load()} className="tv-btn-secondary text-sm">
              Retry
            </button>
          }
        >
          {error}
        </NoticeCallout>
      ) : null}

      <div className="flex flex-wrap gap-2 items-center">
        <label className="relative flex-1 min-w-[12rem]">
          <span className="sr-only">Search published listings</span>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" aria-hidden />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by title, city, or listing UUID"
            className="tv-input w-full pl-9"
          />
        </label>
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

      {loading && items.length === 0 ? (
        <p className="text-sm text-ink-muted flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Loading published listings…
        </p>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No published listings match"
          body="Try another search, or all published inventory may already be draft."
        />
      ) : null}

      <ul className="space-y-3">
        {items.map((row) => {
          const busy = busyId === row.id;
          return (
            <li key={row.id} className="tv-card p-3.5 sm:p-4 space-y-3">
              <div className="flex flex-wrap justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-ink truncate">{row.title ?? 'Untitled listing'}</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {[row.type, row.city, row.country].filter(Boolean).join(' · ') || 'Location TBC'}
                    {row.supplier_name ? ` · ${row.supplier_name}` : ''}
                  </p>
                  <p className="text-[11px] text-ink-faint mt-1 font-mono break-all">{row.id}</p>
                </div>
                <span className="text-xs font-medium uppercase tracking-wide text-emerald-800 bg-emerald-50 ring-1 ring-emerald-200/70 rounded-md px-2 py-1 h-fit">
                  {row.status ?? '—'}
                </span>
              </div>
              <label className="block text-sm">
                <span className="text-xs text-ink-muted">Moderation reason (required)</span>
                <input
                  type="text"
                  value={reasonById[row.id] ?? ''}
                  onChange={(e) => setReasonById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                  disabled={busy}
                  placeholder="e.g. Unsafe content / spam / policy violation"
                  className="tv-input w-full mt-1"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void forceUnpublish(row.id)}
                className="tv-btn-secondary text-sm inline-flex items-center gap-2 text-amber-900 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <ShieldOff className="w-4 h-4" aria-hidden />}
                Force unpublish
              </button>
            </li>
          );
        })}
      </ul>

      <div className="pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-finland mb-2">Recent moderation</p>
        {events.length === 0 ? (
          <p className="text-sm text-ink-faint">No force-unpublish events yet.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((ev) => (
              <li key={ev.id} className="text-sm border-b border-black/[0.04] pb-2">
                <span className="font-medium text-ink">{ev.listing_title ?? ev.listing_id}</span>
                <span className="text-ink-muted"> → {ev.new_status}</span>
                <p className="text-xs text-ink-muted mt-0.5">
                  {new Date(ev.created_at).toLocaleString()} · {ev.actor_email ?? 'staff'} ·{' '}
                  {ev.upcoming_paid_bookings} upcoming paid
                </p>
                <p className="text-xs text-ink mt-0.5">{ev.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
