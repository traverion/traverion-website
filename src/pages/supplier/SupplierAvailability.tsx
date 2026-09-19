import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Ban } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { fetchMyListings, pgTimeToHm } from '../../data/supabase-listings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import {
  deleteAvailability,
  deleteAvailabilityRange,
  fetchAvailabilityByListingId,
  upsertAvailability,
  type AvailabilityRow,
} from '../../data/supabase-availability';
import { materializedBookingOptions } from '../../types/listingExtras';
import type { TourPackage } from '../../types/tour';
import { listingRunsOnDate } from '../../lib/booking-quote';
import { inventoryFamilyFromListing } from '../../lib/inventory';
import { nightsOccupiedByStay, stayRangeFromBooking, partnerStayDayKind, partnerStayCalendarOccupiesNight } from '../../lib/stayOccupancy';
import {
  buildMonthCells,
  defaultCapacityForOpenDay,
  partnerTourDaySpotDisplay,
} from '../../lib/availability-ops';
import { formatPartnerCheckoutHoldLabel } from '../../lib/booking-hold';
import { navigateSupplierUrl, openSupplierBooking } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierEmptyState,
  SupplierModalHeader,
  SupplierModalShell,
  SupplierPageHero,
} from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MAX_BULK_RANGE_DAYS = 366;

/** Inclusive list of ISO dates from `fromIso` to `toIso`, capped so a bad range can't hang the tab. */
function enumerateIsoDates(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  let cursor = new Date(`${fromIso}T00:00:00Z`).getTime();
  const end = new Date(`${toIso}T00:00:00Z`).getTime();
  if (!Number.isFinite(cursor) || !Number.isFinite(end)) return out;
  while (cursor <= end && out.length < MAX_BULK_RANGE_DAYS) {
    out.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 24 * 60 * 60 * 1000;
  }
  return out;
}

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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFrom, setBulkFrom] = useState('');
  const [bulkTo, setBulkTo] = useState('');
  const [bulkCapacity, setBulkCapacity] = useState('0');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const daySheetRef = useRef<HTMLDivElement>(null);
  const closeDaySheet = useCallback(() => setEditing(null), []);
  useDialogFocus(editing !== null, daySheetRef, closeDaySheet);

  const listing = listings.find((l) => l.id === listingId) ?? null;
  const viewingAll = listingId === '';
  const stayCalendar = Boolean(listing && inventoryFamilyFromListing(listing) === 'stay');
  const cells = useMemo(() => buildMonthCells(year, monthIndex0), [year, monthIndex0]);
  const rowByDate = useMemo(() => new Map(rows.map((r) => [r.available_date, r])), [rows]);
  const guestsByDate = useMemo(() => {
    const map = new Map<string, { guests: number; count: number }>();
    const listingById = new Map(listings.map((l) => [l.id, l]));
    for (const b of bookings) {
      if (!partnerStayCalendarOccupiesNight(b)) continue;
      if (!viewingAll && b.listing_id !== listingId) continue;
      if (!b.booking_date) continue;
      const item = listingById.get(b.listing_id);
      const isStay = item ? inventoryFamilyFromListing(item) === 'stay' : false;
      const nights = isStay
        ? (() => {
            const range = stayRangeFromBooking(b);
            return range ? nightsOccupiedByStay(range.checkIn, range.checkOut) : [b.booking_date];
          })()
        : [b.booking_date];
      for (const iso of nights) {
        const cur = map.get(iso) ?? { guests: 0, count: 0 };
        cur.guests += b.guests ?? 0;
        cur.count += 1;
        map.set(iso, cur);
      }
    }
    return map;
  }, [bookings, listingId, viewingAll, listings]);
  const dayBookings = useMemo(() => {
    if (!editing) return [];
    const rows = bookings.filter((b) => {
      if (!partnerStayCalendarOccupiesNight(b)) return false;
      if (!viewingAll && b.listing_id !== listingId) return false;
      const item = listings.find((l) => l.id === b.listing_id);
      const isStay = item ? inventoryFamilyFromListing(item) === 'stay' : false;
      if (isStay) {
        const range = stayRangeFromBooking(b);
        if (!range) return false;
        return nightsOccupiedByStay(range.checkIn, range.checkOut).includes(editing.iso);
      }
      return b.booking_date === editing.iso;
    });
    return [...rows].sort((a, b) => {
      const aStart = pgTimeToHm(a.start_time) ?? '';
      const bStart = pgTimeToHm(b.start_time) ?? '';
      if (aStart !== bStart) return aStart.localeCompare(bStart);
      const aPickup = pgTimeToHm(a.pickup_time) ?? '';
      const bPickup = pgTimeToHm(b.pickup_time) ?? '';
      if (aPickup !== bPickup) return aPickup.localeCompare(bPickup);
      return a.created_at.localeCompare(b.created_at);
    });
  }, [bookings, editing, listingId, viewingAll, listings]);

  const daySheetTimesLine = (b: BookingRow) => {
    const start = pgTimeToHm(b.start_time);
    const pickup = pgTimeToHm(b.pickup_time);
    const bits: string[] = [];
    if (start) bits.push(`Start ${start}`);
    if (pickup) bits.push(`Pickup ${pickup}`);
    return bits.join(' · ');
  };


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
      setBookings(mineBookings.filter((b) => partnerStayCalendarOccupiesNight(b)));
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

  const monthFromIso = cells[0]?.iso;
  const monthToIso = cells[cells.length - 1]?.iso;

  const loadCaps = useCallback(async (id: string, fromIso?: string, toIso?: string) => {
    if (!id) {
      setRows([]);
      return;
    }
    const data = await fetchAvailabilityByListingId(
      id,
      fromIso && toIso ? { fromDate: fromIso, toDate: toIso } : undefined
    );
    setRows(data);
  }, []);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  useEffect(() => {
    if (listingId && monthFromIso && monthToIso) void loadCaps(listingId, monthFromIso, monthToIso);
    else if (!listingId) setRows([]);
  }, [listingId, monthFromIso, monthToIso, loadCaps]);

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, monthIndex0 + delta, 1));
    setYear(d.getUTCFullYear());
    setMonthIndex0(d.getUTCMonth());
  };

  const listingOpenOn = (item: TourPackage, iso: string) => listingRunsOnDate(item, iso);

  const weekdayOpen = (iso: string) => {
    if (viewingAll) return listings.some((item) => listingOpenOn(item, iso));
    if (!listing) return false;
    return listingOpenOn(listing, iso);
  };

  const mergeCapRows = (entries: { available_date: string; capacity: number }[]) => {
    setRows((prev) => {
      const map = new Map(prev.map((r) => [r.available_date, r]));
      for (const e of entries) {
        map.set(e.available_date, {
          listing_id: listingId,
          available_date: e.available_date,
          capacity: e.capacity,
          booked: 0,
        });
      }
      return [...map.values()].sort((a, b) => a.available_date.localeCompare(b.available_date));
    });
  };

  const removeCapRows = (dates: string[]) => {
    const drop = new Set(dates);
    setRows((prev) => prev.filter((r) => !drop.has(r.available_date)));
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
    mergeCapRows([{ available_date: iso, capacity }]);
    setEditing(null);
    if (monthFromIso && monthToIso) await loadCaps(listingId, monthFromIso, monthToIso);
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
    removeCapRows([iso]);
    setEditing(null);
    if (monthFromIso && monthToIso) await loadCaps(listingId, monthFromIso, monthToIso);
  };

  const applyBulk = async (mode: 'set' | 'clear') => {
    if (!listingId) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bulkFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(bulkTo)) {
      setBulkError('Pick a start and end date.');
      return;
    }
    if (bulkFrom > bulkTo) {
      setBulkError('End date must be on or after the start date.');
      return;
    }
    const dates = enumerateIsoDates(bulkFrom, bulkTo);
    if (dates.length === 0) {
      setBulkError('Pick a valid range.');
      return;
    }
    setBulkSaving(true);
    setBulkError(null);
    const capacity = Math.max(0, Math.floor(Number(bulkCapacity) || 0));
    const res =
      mode === 'clear'
        ? await deleteAvailabilityRange(listingId, dates)
        : await upsertAvailability(
            listingId,
            dates.map((available_date) => ({ available_date, capacity }))
          );
    setBulkSaving(false);
    if (!res.success) {
      setBulkError(userFacingError(res.error, 'Could not save that range. Try again.'));
      return;
    }
    if (mode === 'clear') removeCapRows(dates);
    else mergeCapRows(dates.map((available_date) => ({ available_date, capacity })));
    setBulkOpen(false);
    setBulkFrom('');
    setBulkTo('');
    setBulkCapacity('0');
    if (monthFromIso && monthToIso) await loadCaps(listingId, monthFromIso, monthToIso);
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
      <SupplierPageHero
        badge="Operate"
        title="Calendar"
        description="Availability, capacity, blocked dates, and bookings by day. Select a listing to edit."
        actions={
          !isSupabase || !user || listings.length === 0 ? undefined : (
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
                    {inventoryFamilyFromListing(l) === 'stay' ? 'Stay · ' : 'Tour · '}
                    {l.title}
                    {l.status === 'draft' ? ' (draft)' : ''}
                  </option>
                ))}
              </select>
              {viewingAll ? (
                <p className="mt-2 text-xs font-medium text-finland">Select a listing to edit that day</p>
              ) : stayCalendar ? (
                <p className="mt-2 text-xs font-medium text-finland">Stay nights — occupied, available, or blocked</p>
              ) : (
                <p className="mt-2 text-xs font-medium text-finland">Select a listing to edit daily caps</p>
              )}
            </label>
          )
        }
      />

      {!isSupabase || !user ? (
        <p className="text-sm text-ink-muted">Sign in to manage availability.</p>
      ) : loading ? (
        <div
          className="grid grid-cols-7 gap-1.5"
          aria-busy="true"
          aria-label="Loading calendar"
        >
          {Array.from({ length: 35 }, (_, i) => (
            <div key={i} className="min-h-[4.5rem] rounded-xl bg-black/[0.04] animate-pulse" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <SupplierEmptyState
          icon={CalendarDays}
          title="Create a listing first"
          body="Calendar shows departures and nights after you have a tour or stay. You have none yet — that is the first step, not a broken calendar."
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

          {listingId ? (
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setBulkError(null);
                  setBulkFrom('');
                  setBulkTo('');
                  setBulkCapacity('0');
                  setBulkOpen(true);
                }}
                className="tv-btn-secondary inline-flex items-center gap-1.5 text-sm"
              >
                <Ban className="h-4 w-4" aria-hidden />
                {stayCalendar ? 'Block a range of nights' : 'Edit multiple dates'}
              </button>
            </div>
          ) : null}

          {error ? (
            <ErrorState
              className="mb-4 py-4"
              title="Calendar unavailable"
              body={userFacingError(error, USER_ERROR.calendar)}
              retry={{ onClick: () => void loadListings() }}
            />
          ) : null}

          <div
            className="mb-4 flex flex-wrap gap-x-4 gap-y-2 rounded-xl bg-paper-raised px-3 py-2.5 text-xs text-ink-muted shadow-soft ring-1 ring-black/[0.06]"
            aria-hidden
          >
            {stayCalendar ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-finland ring-1 ring-finland/30" /> Occupied
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 ring-1 ring-emerald-500/30" /> Available
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500 ring-1 ring-rose-600/30" /> Blocked
                </span>
                <span className="text-ink-faint">Minimum stay and nightly price live on the listing.</span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 ring-1 ring-emerald-500/30" /> Open
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-finland ring-1 ring-finland/30" /> Booked
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500 ring-1 ring-rose-600/30" /> Full
                </span>
                <span className="inline-flex items-center gap-1.5 text-ink-faint">Closed days show —</span>
              </>
            )}
          </div>

          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint mb-2 min-w-[28rem] sm:min-w-0" aria-hidden>
            {WEEKDAYS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div key={`${year}-${monthIndex0}`} className="grid grid-cols-7 gap-1 sm:gap-2 motion-safe:animate-fade-in min-w-[28rem] sm:min-w-0">
            {cells.map((cell) => {
              // Stays are night inventory — weekday option rules are tour departures only.
              const open = cell.inMonth && (stayCalendar || weekdayOpen(cell.iso));
              const cap = rowByDate.get(cell.iso);
              const occupying = guestsByDate.get(cell.iso);
              const stayKind = stayCalendar
                ? partnerStayDayKind({ occupying: Boolean(occupying), capacity: cap?.capacity })
                : null;
              const tourSpots =
                !stayCalendar && listing
                  ? partnerTourDaySpotDisplay({
                      offered: open,
                      savedCapacity: cap?.capacity,
                      defaultCapacity: defaultSpots(listing),
                      occupyingGuests: occupying?.guests ?? 0,
                    })
                  : { capacity: null, remaining: null };
              const tourCapacity = tourSpots.capacity;
              const remaining = tourSpots.remaining;
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
                : stayKind === 'occupied'
                  ? `${dateLabel}, occupied`
                  : stayKind === 'blocked'
                    ? `${dateLabel}, blocked`
                    : occupying
                      ? `${dateLabel}, ${occupying.guests} guest${occupying.guests === 1 ? '' : 's'}`
                      : remaining !== null && tourCapacity != null
                        ? `${dateLabel}, ${remaining} of ${tourCapacity} spots left`
                        : open
                          ? `${dateLabel}, ${stayCalendar ? 'available' : 'open'}`
                          : `${dateLabel}, not offered`;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={!cell.inMonth || busy}
                  aria-label={statusLabel}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={isEditing}
                  onClick={() => {
                    // With a listing selected, closed weekdays must still open so partners can set a cap / block.
                    if (viewingAll) {
                      if (!open && !occupying) return;
                    } else if (!listingId) {
                      return;
                    }
                    setEditing({
                      iso: cell.iso,
                      capacity: String(cap?.capacity ?? defaultSpots(listing)),
                    });
                  }}
                  className={`lux-flat min-h-[4.75rem] sm:min-h-[6.25rem] rounded-2xl p-1.5 sm:p-2 text-left ring-1 transition-[background-color,box-shadow,transform] duration-150 disabled:opacity-40 motion-safe:active:scale-[0.97] ${
                    !cell.inMonth
                      ? 'bg-transparent text-ink-faint ring-transparent'
                      : isEditing
                        ? 'bg-paper-raised ring-2 ring-finland/40 shadow-soft'
                        : isToday
                          ? 'bg-paper-raised ring-finland/25 shadow-soft'
                          : occupying || stayKind === 'occupied'
                            ? 'bg-finland/15 ring-finland/20'
                        : stayKind === 'blocked' || (open && remaining === 0)
                          ? 'bg-rose-50 ring-rose-200/70'
                          : (cap && (stayCalendar || open)) || (open && stayCalendar)
                          ? 'bg-emerald-50/80 ring-emerald-200/50'
                          : open
                          ? 'bg-paper-raised/80 ring-black/[0.05] hover:bg-emerald-50/60'
                          : 'text-ink-faint ring-transparent'
                  }`}
                >
                  <span className="block text-sm font-semibold text-ink">{cell.day}</span>
                  {cell.inMonth && (stayKind === 'occupied' || occupying) ? (
                    <span className="mt-0.5 block text-[10px] font-medium leading-tight text-finland">
                      {stayCalendar ? 'Occupied' : `${occupying?.guests} guest${occupying?.guests === 1 ? '' : 's'}`}
                    </span>
                  ) : cell.inMonth && stayKind === 'blocked' ? (
                    <span className="mt-0.5 block text-[10px] font-semibold leading-tight text-rose-700">Blocked</span>
                  ) : cell.inMonth && remaining !== null && tourCapacity != null ? (
                    <span className={`mt-0.5 block text-[10px] leading-tight ${remaining === 0 ? 'font-semibold text-rose-700' : 'text-ink-muted'}`}>
                      {remaining === 0 ? 'Full' : `${remaining}/${tourCapacity} left`}
                    </span>
                  ) : cell.inMonth && open ? (
                    <span className="mt-0.5 block text-[10px] leading-tight text-ink-faint">{stayCalendar ? 'Available' : 'Open'}</span>
                  ) : cell.inMonth ? (
                    <span className="mt-0.5 block text-[10px] leading-tight text-ink-faint">
                      {cap && !stayCalendar ? 'Not offered' : '—'}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
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
                <p className="mt-3 text-sm text-ink-muted">
                  {stayCalendar ? 'No stay on this night.' : 'No guests on this date.'}
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {dayBookings.map((b) => {
                    const times = daySheetTimesLine(b);
                    const hold = formatPartnerCheckoutHoldLabel(b);
                    return (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => openSupplierBooking(b.id)}
                        className="lux-flat w-full text-left"
                      >
                        <p className="font-semibold text-ink">{b.guest_name?.trim() || 'Guest'}</p>
                        <p className="text-sm text-ink-muted">
                          {viewingAll
                            ? `${listings.find((l) => l.id === b.listing_id)?.title ?? 'Listing'} · ${b.guests} guest${b.guests === 1 ? '' : 's'}`
                            : `${b.guests} guest${b.guests === 1 ? '' : 's'}`}
                          {times ? ` · ${times}` : ''}
                        </p>
                        {hold ? (
                          <p className="mt-0.5 text-[11px] font-medium text-amber-900">{hold}</p>
                        ) : null}
                      </button>
                    </li>
                    );
                  })}
                </ul>
              )}
              {viewingAll ? (
                <p className="mt-5 text-sm text-ink-muted">
                  Choose a listing above to edit that day. Caps are per tour. Stays use occupied nights.
                </p>
              ) : stayCalendar ? (
                <>
                  <p className="mt-5 text-sm text-ink-muted">
                    Block a night by setting spots to 0. Clearing returns the night to available.
                  </p>
                  <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
                    <label className="text-sm text-ink" htmlFor="day-capacity">
                      Block
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
                      Save
                    </button>
                    <button type="button" onClick={() => void clearCap(editing.iso)} className="tv-btn-ghost">
                      Clear
                    </button>
                  </div>
                </>
              ) : (
                <>
              {!weekdayOpen(editing.iso) ? (
                <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200/80">
                  No departures this day per your option schedule. A saved cap does not open traveler
                  booking — clear the cap or adjust options on the listing.
                </p>
              ) : null}
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

      {bulkOpen ? (
        <SupplierModalShell onClose={bulkSaving ? undefined : () => setBulkOpen(false)} maxWidth="md">
          <SupplierModalHeader
            icon={Ban}
            title={stayCalendar ? 'Block a range of nights' : 'Edit multiple dates'}
            subtitle={listing?.title}
            onClose={bulkSaving ? undefined : () => setBulkOpen(false)}
          />
          <div className="space-y-4 p-4 sm:p-5">
            <p className="text-sm text-ink-muted">
              {stayCalendar
                ? 'Block several nights at once \u2014 a maintenance week or a personal booking elsewhere. Clear range returns nights to available.'
                : 'Set the same spot count across a date range at once \u2014 close for a holiday, or open extra departures for a busy stretch. Clear range removes daily overrides. Caps never override weekday or season rules on the traveler calendar.'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint" htmlFor="bulk-from">
                  From
                </label>
                <input
                  id="bulk-from"
                  type="date"
                  value={bulkFrom}
                  onChange={(e) => setBulkFrom(e.target.value)}
                  className="tv-input mt-1 w-full"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint" htmlFor="bulk-to">
                  To
                </label>
                <input
                  id="bulk-to"
                  type="date"
                  value={bulkTo}
                  onChange={(e) => setBulkTo(e.target.value)}
                  className="tv-input mt-1 w-full"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-ink-faint" htmlFor="bulk-capacity">
                {stayCalendar ? 'Spots (0 blocks every night in range)' : 'Spots per day (0 closes every date in range)'}
              </label>
              <input
                id="bulk-capacity"
                type="number"
                min={0}
                max={99}
                value={bulkCapacity}
                onChange={(e) => setBulkCapacity(e.target.value)}
                className="tv-input mt-1 w-24"
              />
            </div>
            {bulkError ? <p className="text-sm text-red-700">{bulkError}</p> : null}
            {bulkFrom && bulkTo && bulkFrom <= bulkTo ? (
              <p className="text-xs text-ink-faint">
                Applies to {enumerateIsoDates(bulkFrom, bulkTo).length} date
                {enumerateIsoDates(bulkFrom, bulkTo).length === 1 ? '' : 's'}.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={bulkSaving}
                onClick={() => void applyBulk('set')}
                className="tv-btn-primary disabled:opacity-50"
              >
                {bulkSaving
                  ? 'Saving\u2026'
                  : stayCalendar && Math.max(0, Math.floor(Number(bulkCapacity) || 0)) === 0
                    ? 'Block range'
                    : 'Apply to range'}
              </button>
              <button
                type="button"
                disabled={bulkSaving}
                onClick={() => void applyBulk('clear')}
                className="tv-btn-secondary disabled:opacity-50"
              >
                {stayCalendar ? 'Clear range (unblock)' : 'Clear range'}
              </button>
              <button type="button" onClick={() => setBulkOpen(false)} disabled={bulkSaving} className="tv-btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        </SupplierModalShell>
      ) : null}
    </div>
  );
}
