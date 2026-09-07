import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
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
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';

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
  const daySheetRef = useRef<HTMLDivElement>(null);
  const closeDaySheet = useCallback(() => setEditing(null), []);
  useDialogFocus(editing !== null, daySheetRef, closeDaySheet);

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
      setError(userFacingError(e, USER_ERROR.calendar));
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
      setError(userFacingError(res.error, 'Could not save that date. Try again.'));
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
      setError(userFacingError(res.error, 'Could not clear that date. Try again.'));
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
            {viewingAll ? (
              <p className="mt-2 text-xs font-medium text-finland">Select a tour to edit daily caps</p>
            ) : null}
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
          icon={CalendarDays}
          title="Create a listing first"
          body="Calendar shows departures and guests after you have a tour. You have none yet — that is the first step, not a broken calendar."
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
            <ErrorState
              className="mb-4 py-4"
              title="Calendar unavailable"
              body={userFacingError(error, USER_ERROR.calendar)}
              retry={{ onClick: () => void loadListings() }}
            />
          ) : null}

          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted" aria-hidden>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-finland/40" /> Guests
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-finland/15" /> Cap
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-300" /> Full
            </span>
            <span className="inline-flex items-center gap-1.5 text-ink-faint">Closed days show —</span>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint mb-2" aria-hidden>
            {WEEKDAYS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div key={`${year}-${monthIndex0}`} className="grid grid-cols-7 gap-1 sm:gap-2 motion-safe:animate-fade-in min-w-0">
            {cells.map((cell) => {
              const open = cell.inMonth && weekdayOpen(cell.iso);
              const cap = rowByDate.get(cell.iso);
              const remaining = cap ? remainingCapacity(cap.capacity, cap.booked) : null;
              const booked = guestsByDate.get(cell.iso);
              const isToday = cell.iso === localTodayIso;
              const isEditing = editing?.iso === cell.iso;
              const busy = savingIso === cell.iso;
              const dateLabel = new Date(`${cell.iso}T12:00:00`).toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              });
              const statusLabel = !cell.inMonth
                ? undefined
                : booked
                  ? `${dateLabel}, ${booked.guests} guest${booked.guests === 1 ? '' : 's'}`
                  : cap
                    ? `${dateLabel}, ${remaining} of ${cap.capacity} spots left`
                    : open
                      ? `${dateLabel}, open`
                      : dateLabel;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={!cell.inMonth || busy}
                  aria-label={statusLabel}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={isEditing}
                  onClick={() => {
                    if (!open && !cap && !booked) return;
                    setEditing({
                      iso: cell.iso,
                      capacity: String(cap?.capacity ?? defaultSpots(listing)),
                    });
                  }}
                  className={`lux-flat min-h-[4.75rem] sm:min-h-[6.25rem] rounded-2xl p-1.5 sm:p-2 text-left transition-[background-color,box-shadow,transform] duration-150 disabled:opacity-40 motion-safe:active:scale-[0.97] ${
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
                    <span className="mt-0.5 block text-[10px] font-medium leading-tight text-finland">
                      {booked.guests} guest{booked.guests === 1 ? '' : 's'}
                    </span>
                  ) : cell.inMonth && cap ? (
                    <span className={`mt-0.5 block text-[10px] leading-tight ${remaining === 0 ? 'font-semibold text-rose-700' : 'text-ink-muted'}`}>
                      {remaining === 0 ? 'Full' : `${remaining}/${cap.capacity} left`}
                    </span>
                  ) : cell.inMonth && open ? (
                    <span className="mt-0.5 block text-[10px] leading-tight text-ink-faint">Open</span>
                  ) : cell.inMonth ? (
                    <span className="mt-0.5 block text-[10px] leading-tight text-ink-faint">—</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {editing ? (
            <div ref={daySheetRef} className="tv-sheet-overlay z-[70]">
              <button type="button" tabIndex={-1} className="absolute inset-0" aria-label="Close day" onClick={closeDaySheet} />
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
