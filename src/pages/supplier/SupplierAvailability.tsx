import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import {
  deleteAvailability,
  fetchAvailabilityByListingId,
  upsertAvailability,
  type AvailabilityRow,
} from '../../data/supabase-availability';
import { materializedBookingOptions } from '../../types/listingExtras';
import type { TourPackage } from '../../types/tour';
import { optionRunsOnDate } from '../../lib/booking-quote';
import {
  buildMonthCells,
  defaultCapacityForOpenDay,
  remainingCapacity,
} from '../../lib/availability-ops';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { SUPPLIER_PAGE_CLASS, SupplierEmptyState } from '../../components/supplier/supplierUi';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function defaultSpots(listing: TourPackage | null): number {
  const opts = listing ? materializedBookingOptions(listing.listingExtras?.bookingOptions) : [];
  const max = opts.length > 0 ? Math.max(...opts.map((o) => o.maxSpotsPerSlot || o.maxPersons || 8)) : 8;
  return defaultCapacityForOpenDay(max);
}

export default function SupplierAvailability() {
  const { user, isSupabase } = useSupplierAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [monthIndex0, setMonthIndex0] = useState(today.getMonth());
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [listingId, setListingId] = useState<string>('');
  const [rows, setRows] = useState<AvailabilityRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingIso, setSavingIso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ iso: string; capacity: string } | null>(null);

  const listing = listings.find((l) => l.id === listingId) ?? null;
  const viewingAll = listingId === '';
  const cells = useMemo(() => buildMonthCells(year, monthIndex0), [year, monthIndex0]);
  const rowByDate = useMemo(() => new Map(rows.map((r) => [r.available_date, r])), [rows]);
  const guestsByDate = useMemo(() => {
    const map = new Map<string, { guests: number; count: number }>();
    for (const b of bookings) {
      if (!viewingAll && b.listing_id !== listingId) continue;
      if (!b.booking_date) continue;
      const cur = map.get(b.booking_date) ?? { guests: 0, count: 0 };
      cur.guests += b.guests ?? 0;
      cur.count += 1;
      map.set(b.booking_date, cur);
    }
    return map;
  }, [bookings, listingId, viewingAll]);
  const dayBookings = useMemo(
    () =>
      editing
        ? bookings.filter(
            (b) =>
              b.booking_date === editing.iso && (viewingAll || b.listing_id === listingId)
          )
        : [],
    [bookings, editing, listingId, viewingAll]
  );

  const loadListings = useCallback(async () => {
    if (!isSupabase || !user?.id) {
      setListings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [mine, mineBookings] = await Promise.all([
        fetchMyListings(user.id),
        fetchBookingsForSupplier(user.id).catch(() => [] as BookingRow[]),
      ]);
      setListings(mine);
      setBookings(mineBookings.filter((b) => b.status !== 'cancelled'));
      setListingId((prev) => {
        if (prev && mine.some((l) => l.id === prev)) return prev;
        return '';
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load tours');
    } finally {
      setLoading(false);
    }
  }, [isSupabase, user?.id]);

  const loadCaps = useCallback(async (id: string) => {
    if (!id) {
      setRows([]);
      return;
    }
    const data = await fetchAvailabilityByListingId(id);
    setRows(data);
  }, []);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  useEffect(() => {
    if (listingId) void loadCaps(listingId);
  }, [listingId, loadCaps]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, monthIndex0 + delta, 1));
    setYear(d.getUTCFullYear());
    setMonthIndex0(d.getUTCMonth());
  };

  const listingOpenOn = (item: TourPackage, iso: string) => {
    const opts = materializedBookingOptions(item.listingExtras?.bookingOptions);
    if (opts.length === 0) return true;
    return opts.some((o) => optionRunsOnDate(o, iso) === null);
  };

  const weekdayOpen = (iso: string) => {
    if (viewingAll) return listings.some((item) => listingOpenOn(item, iso));
    if (!listing) return false;
    return listingOpenOn(listing, iso);
  };

  const saveCap = async (iso: string, capacity: number) => {
    if (!listingId) return;
    setSavingIso(iso);
    setError(null);
    const res = await upsertAvailability(listingId, [{ available_date: iso, capacity }]);
    setSavingIso(null);
    if (!res.success) {
      setError(res.error ?? 'Could not save that date');
      return;
    }
    setEditing(null);
    await loadCaps(listingId);
  };

  const clearCap = async (iso: string) => {
    if (!listingId) return;
    setSavingIso(iso);
    setError(null);
    const res = await deleteAvailability(listingId, iso);
    setSavingIso(null);
    if (!res.success) {
      setError(res.error ?? 'Could not clear that date');
      return;
    }
    setEditing(null);
    await loadCaps(listingId);
  };

  const monthLabel = new Date(Date.UTC(year, monthIndex0, 1)).toLocaleString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const localTodayIso = (() => {
    const n = new Date();
    const y = n.getFullYear();
    const m = String(n.getMonth() + 1).padStart(2, '0');
    const d = String(n.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} min-h-[70vh]`}>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl sm:text-5xl text-ink tracking-tight">Calendar</h1>
          <p className="mt-2 text-sm text-ink-muted max-w-lg">
            Departures, guests, and optional daily caps. Open days follow each tour’s weekday rules.
          </p>
        </div>
        {!isSupabase || !user ? null : listings.length > 0 ? (
          <label className="block sm:min-w-[16rem]">
            <span className="sr-only">Listing</span>
            <select
              id="availability-listing"
              value={listingId}
              onChange={(e) => {
                setEditing(null);
                setListingId(e.target.value);
              }}
              className="tv-input"
            >
              <option value="">All listings</option>
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                  {l.status === 'draft' ? ' (draft)' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {!isSupabase || !user ? (
        <p className="text-sm text-ink-muted">Sign in to manage availability.</p>
      ) : loading ? (
        <div className="grid grid-cols-7 gap-1.5" aria-hidden>
          {Array.from({ length: 35 }, (_, i) => (
            <div key={i} className="min-h-[4.5rem] rounded-xl bg-black/[0.04] animate-pulse" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <SupplierEmptyState
          title="Create a listing first"
          body="Calendar shows departures and guests after you have a tour."
          action={
            <button
              type="button"
              onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings?new=1`)}
              className="tv-btn-primary"
            >
              New listing
            </button>
          }
        />
      ) : (
        <div>
          <div className="flex items-center justify-between gap-3 mb-6">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="lux-flat inline-flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-paper-raised"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <p className="font-display text-xl sm:text-3xl text-ink tabular-nums">{monthLabel}</p>
              <button
                type="button"
                onClick={() => {
                  const n = new Date();
                  setYear(n.getFullYear());
                  setMonthIndex0(n.getMonth());
                }}
                className="lux-flat mt-1 text-xs font-semibold text-finland"
              >
                Today
              </button>
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="lux-flat inline-flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-paper-raised"
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {error ? (
            <p className="mb-3 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint mb-2">
            {WEEKDAYS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div key={`${year}-${monthIndex0}`} className="grid grid-cols-7 gap-1 sm:gap-2 motion-safe:animate-fade-in">
            {cells.map((cell) => {
              const open = cell.inMonth && weekdayOpen(cell.iso);
              const cap = rowByDate.get(cell.iso);
              const remaining = cap ? remainingCapacity(cap.capacity, cap.booked) : null;
              const booked = guestsByDate.get(cell.iso);
              const isToday = cell.iso === localTodayIso;
              const isEditing = editing?.iso === cell.iso;
              const busy = savingIso === cell.iso;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={!cell.inMonth || busy}
                  onClick={() => {
                    if (!open && !cap && !booked) return;
                    setEditing({
                      iso: cell.iso,
                      capacity: String(cap?.capacity ?? defaultSpots(listing)),
                    });
                  }}
                  className={`lux-flat min-h-[4.75rem] sm:min-h-[6.25rem] rounded-2xl p-1.5 sm:p-2 text-left transition-colors duration-150 disabled:opacity-40 ${
                    !cell.inMonth
                      ? 'bg-transparent text-ink-faint'
                      : isEditing
                        ? 'bg-paper-raised ring-2 ring-finland/30'
                        : isToday
                          ? 'bg-paper-raised'
                          : booked
                            ? 'bg-finland/10'
                        : cap
                        ? remaining === 0
                          ? 'bg-rose-50'
                          : 'bg-finland/8'
                        : open
                          ? 'hover:bg-paper-raised'
                          : 'text-ink-faint'
                  }`}
                >
                  <span className="block text-sm font-semibold text-ink">{cell.day}</span>
                  {cell.inMonth && booked ? (
                    <span className="mt-0.5 block text-[10px] leading-tight text-ink">
                      {booked.guests} guest{booked.guests === 1 ? '' : 's'}
                    </span>
                  ) : cell.inMonth && cap ? (
                    <span className="mt-0.5 block text-[10px] leading-tight text-ink-muted">
                      {remaining}/{cap.capacity} left
                    </span>
                  ) : cell.inMonth && open ? (
                    <span className="mt-0.5 block text-[10px] leading-tight text-ink-faint">Open</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {editing ? (
            <div className="tv-sheet-overlay z-[70]">
              <button type="button" className="absolute inset-0" aria-label="Close day" onClick={() => setEditing(null)} />
              <aside
                role="dialog"
                aria-modal="true"
                aria-labelledby="calendar-day-title"
                className="tv-sheet-panel relative motion-safe:animate-slide-up max-w-lg"
              >
              <p id="calendar-day-title" className="font-display text-2xl text-ink">
                {new Date(`${editing.iso}T12:00:00`).toLocaleDateString('en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
              {dayBookings.length === 0 ? (
                <p className="mt-3 text-sm text-ink-muted">No guests on this date.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {dayBookings.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?booking=${b.id}`)}
                        className="lux-flat w-full text-left"
                      >
                        <p className="font-semibold text-ink">{b.guest_name?.trim() || 'Guest'}</p>
                        <p className="text-sm text-ink-muted">
                          {viewingAll
                            ? `${listings.find((l) => l.id === b.listing_id)?.title ?? 'Tour'} · ${b.guests} guest${b.guests === 1 ? '' : 's'}`
                            : `${b.guests} guest${b.guests === 1 ? '' : 's'}`}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {viewingAll ? (
                <p className="mt-5 text-sm text-ink-muted">
                  Choose a listing above to set a daily cap. Caps are per tour, not for the whole calendar.
                </p>
              ) : (
                <>
              <p className="mt-5 text-sm text-ink-muted">
                Daily cap is optional. Clearing it returns the date to weekday rules.
              </p>
              <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
                <label className="text-sm text-ink" htmlFor="day-capacity">
                  Spots
                </label>
                <input
                  id="day-capacity"
                  type="number"
                  min={0}
                  max={99}
                  value={editing.capacity}
                  onChange={(e) => setEditing({ ...editing, capacity: e.target.value })}
                  className="tv-input w-24"
                />
                <button
                  type="button"
                  onClick={() => void saveCap(editing.iso, Math.max(0, Math.floor(Number(editing.capacity) || 0)))}
                  className="tv-btn-primary"
                >
                  Save cap
                </button>
                <button
                  type="button"
                  onClick={() => void clearCap(editing.iso)}
                  className="tv-btn-ghost"
                >
                  Clear
                </button>
              </div>
                </>
              )}
              <button type="button" onClick={() => setEditing(null)} className="tv-btn-ghost mt-4">
                Close
              </button>
              </aside>
            </div>
          ) : (
            <p className="mt-6 text-xs text-ink-faint">Tap a date to see guests{viewingAll ? '' : ' or set a daily cap'}.</p>
          )}
        </div>
      )}
    </div>
  );
}
