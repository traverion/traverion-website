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
  const cells = useMemo(() => buildMonthCells(year, monthIndex0), [year, monthIndex0]);
  const rowByDate = useMemo(() => new Map(rows.map((r) => [r.available_date, r])), [rows]);
  const guestsByDate = useMemo(() => {
    const map = new Map<string, { guests: number; count: number }>();
    for (const b of bookings) {
      if (b.listing_id !== listingId || !b.booking_date) continue;
      const cur = map.get(b.booking_date) ?? { guests: 0, count: 0 };
      cur.guests += b.guests ?? 0;
      cur.count += 1;
      map.set(b.booking_date, cur);
    }
    return map;
  }, [bookings, listingId]);
  const dayBookings = useMemo(
    () =>
      editing
        ? bookings.filter((b) => b.listing_id === listingId && b.booking_date === editing.iso)
        : [],
    [bookings, editing, listingId]
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
      setListingId((prev) => prev || mine[0]?.id || '');
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

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, monthIndex0 + delta, 1));
    setYear(d.getUTCFullYear());
    setMonthIndex0(d.getUTCMonth());
  };

  const weekdayOpen = (iso: string) => {
    if (!listing) return false;
    const opts = materializedBookingOptions(listing.listingExtras?.bookingOptions);
    if (opts.length === 0) return true;
    return opts.some((o) => optionRunsOnDate(o, iso) === null);
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
          <h1 className="font-display text-3xl sm:text-4xl text-ink">Calendar</h1>
          <p className="mt-2 text-sm text-ink-muted max-w-lg">
          Open days follow each tour’s weekday rules. Dots are booked guests. Tap a date to see the departure.
          </p>
        </div>
        {!isSupabase || !user ? null : listings.length > 0 ? (
          <label className="block sm:min-w-[16rem]">
            <span className="sr-only">Tour</span>
            <select
              id="availability-listing"
              value={listingId}
              onChange={(e) => setListingId(e.target.value)}
              className="w-full rounded-full border-0 bg-paper-raised px-4 py-2.5 text-sm text-ink shadow-none ring-1 ring-black/[0.06]"
            >
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
        <p className="text-sm text-ink-muted">Loading calendar…</p>
      ) : listings.length === 0 ? (
        <SupplierEmptyState
          title="Create a tour first"
          body="Then you can cap specific dates here."
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
              <p className="font-display text-xl sm:text-2xl text-ink">{monthLabel}</p>
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
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
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
                  className={`lux-flat min-h-[4.5rem] sm:min-h-[5.5rem] rounded-xl p-1.5 text-left transition-colors disabled:opacity-40 ${
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
            <div className="mt-8 max-w-xl motion-safe:animate-fade-in-up">
              <p className="font-sans text-base font-semibold text-ink">
                {new Date(`${editing.iso}T12:00:00`).toLocaleDateString('en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
              {dayBookings.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">No bookings on this date.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {dayBookings.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings?booking=${b.id}`)}
                        className="lux-flat text-left text-sm font-semibold text-ink"
                      >
                        {b.guest_name?.trim() || 'Guest'} · {b.guests} guest{b.guests === 1 ? '' : 's'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-sm text-ink-muted">
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
                  className="w-24 rounded-xl border-0 bg-paper-raised px-3 py-2 text-sm ring-1 ring-black/[0.08]"
                />
                <button
                  type="button"
                  onClick={() => void saveCap(editing.iso, Math.max(0, Math.floor(Number(editing.capacity) || 0)))}
                  className="rounded-full bg-finland px-5 py-2 text-sm font-semibold text-white hover:bg-finland-dark"
                >
                  Save cap
                </button>
                <button
                  type="button"
                  onClick={() => void clearCap(editing.iso)}
                  className="lux-flat rounded-full px-4 py-2 text-sm text-ink-muted hover:text-ink"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="lux-flat text-sm text-ink-faint hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-6 text-xs text-ink-faint">Tap a date to add or change a daily cap.</p>
          )}
        </div>
      )}
    </div>
  );
}
