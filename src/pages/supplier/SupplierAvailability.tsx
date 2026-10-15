import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Ban, X } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
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
import { nightsOccupiedByStay, stayRangeFromBooking, partnerStayDayKind, partnerStayCalendarOccupiesNight, addCalendarDays } from '../../lib/stayOccupancy';
import {
  accumulatePartnerStayCheckOutsByDate,
  accumulatePartnerStayGuestsByDate,
  partnerAvailabilityTreatAsStay,
} from '../../lib/partner-availability-stay-maps';
import { displayListingTitleFromPurchase, partnerOpsDepartureDisplay } from '../../lib/purchase-snapshot';
import {
  buildMonthCells,
  capacitySpotsFromBookingOptions,
  defaultCapacityForOpenDay,
  listingTourCapacityFromOptions,
  partnerDepartureRemainingLine,
  partnerTourMonthCellCapacityLabel,
  partnerTourDaySpotDisplay,
} from '../../lib/availability-ops';
import { tourSellingDeparturesOnDate } from '../../lib/listing-option-schedules';
import { formatPartnerCheckoutHoldLabel, tourCheckoutOccupiedGuests, normalizeTourStartTimeHm } from '../../lib/booking-hold';
import { bulkCapacityBelowSoldWarning, capacityBelowSoldWarning } from '../../lib/capacity-reduction-warn';
import { experienceTodayIsoForListing } from '../../lib/booking-quote';
import { navigateSupplierUrl, openSupplierBooking } from '../../lib/supplierPortalNavigation';
import { PARTNER_CREATE_PATH, PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierEmptyState,
  SupplierModalHeader,
  SupplierModalShell,
} from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import NoticeCallout from '../../components/NoticeCallout';
import PartnerSelect from '../../components/supplier/PartnerSelect';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MAX_BULK_RANGE_DAYS = 366;

/** Inclusive list of ISO dates from `fromIso` to `toIso`, capped so a bad range can't hang the tab. */
function enumerateIsoDates(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  if (!fromIso || !toIso || fromIso > toIso) return out;
  let cur = fromIso;
  while (cur <= toIso && out.length < MAX_BULK_RANGE_DAYS) {
    out.push(cur);
    cur = addCalendarDays(cur, 1);
  }
  return out;
}

function defaultSpots(listing: TourPackage | null): number | null {
  const opts = listing ? materializedBookingOptions(listing.listingExtras?.bookingOptions) : [];
  const max = listingTourCapacityFromOptions(capacitySpotsFromBookingOptions(opts));
  // Phase 1281: starter from listing spots only — never invent capacity 8.
  return defaultCapacityForOpenDay(max ?? undefined);
}

export default function SupplierAvailability() {
  const { user, isSupabase } = useSupplierAuth();
  const { role } = useSupplierRole();
  // Phase 1747: finance/viewer read calendar; writes need editor roles (RLS 1746).
  const canEditCalendar = canManageBookings(role);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [monthIndex0, setMonthIndex0] = useState(today.getMonth());
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [listingId, setListingId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return (new URLSearchParams(window.location.search).get('listing') ?? '').trim();
  });
  const [rows, setRows] = useState<AvailabilityRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingIso, setSavingIso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [capsError, setCapsError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ iso: string; capacity: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFrom, setBulkFrom] = useState('');
  const [bulkTo, setBulkTo] = useState('');
  const [bulkCapacity, setBulkCapacity] = useState('0');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const daySheetRef = useRef<HTMLDivElement>(null);
  const loadGenRef = useRef(0);
  /** Invalidates in-flight month/listing capacity fetches — stale responses must not paint another listing. */
  const capsLoadGenRef = useRef(0);
  const prevListingIdForCapsRef = useRef(listingId);
  const availabilityHubUserIdRef = useRef<string | null>(null);
  const closeDaySheet = useCallback(() => {
    setEditing(null);
    setSaveNote(null);
  }, []);
  useDialogFocus(editing !== null, daySheetRef, closeDaySheet);

  const listing = listings.find((l) => l.id === listingId) ?? null;
  const viewingAll = listingId === '';
  const stayCalendar = Boolean(listing && inventoryFamilyFromListing(listing) === 'stay');
  const cells = useMemo(() => buildMonthCells(year, monthIndex0), [year, monthIndex0]);
  const rowByDate = useMemo(() => new Map(rows.map((r) => [r.available_date, r])), [rows]);
  const guestsByDate = useMemo(() => {
    const listingById = new Map(listings.map((l) => [l.id, l]));
    return accumulatePartnerStayGuestsByDate({
      bookings,
      listingById,
      listingIdFilter: listingId,
      viewingAll,
    });
  }, [bookings, listingId, viewingAll, listings]);

  /** Ops-only: check-out mornings (inventory stays [checkIn, checkOut)). */
  const checkOutsByDate = useMemo(() => {
    const listingById = new Map(listings.map((l) => [l.id, l]));
    return accumulatePartnerStayCheckOutsByDate({
      bookings,
      listingById,
      listingIdFilter: listingId,
      viewingAll,
    });
  }, [bookings, listingId, viewingAll, listings]);

  const dayBookings = useMemo(() => {
    if (!editing) return [];
    const rows = bookings.filter((b) => {
      if (!partnerStayCalendarOccupiesNight(b)) return false;
      if (!viewingAll && b.listing_id !== listingId) return false;
      const item = listings.find((l) => l.id === b.listing_id);
      const isStay = partnerAvailabilityTreatAsStay(item, b);
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

  const dayDepartures = useMemo(() => {
    if (!editing || !stayCalendar) return [];
    return bookings
      .filter((b) => {
        if (!partnerStayCalendarOccupiesNight(b)) return false;
        if (!viewingAll && b.listing_id !== listingId) return false;
        const range = stayRangeFromBooking(b);
        return Boolean(range && range.checkOut === editing.iso);
      })
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  }, [bookings, editing, listingId, viewingAll, stayCalendar]);

  const daySellingDepartures = useMemo(() => {
    if (!editing || stayCalendar || viewingAll || !listing) return [];
    const opts = materializedBookingOptions(listing.listingExtras?.bookingOptions);
    return tourSellingDeparturesOnDate(opts, editing.iso);
  }, [editing, stayCalendar, viewingAll, listing]);

  const daySheetTimesLine = (b: BookingRow) => {
    const opsStart = pgTimeToHm(b.start_time);
    const dep = partnerOpsDepartureDisplay(b.purchase_snapshot, opsStart);
    const pickup = pgTimeToHm(b.pickup_time);
    const bits: string[] = [];
    if (dep.displayHm) bits.push(`Start ${dep.displayHm}`);
    if (dep.purchasedNote) bits.push(dep.purchasedNote);
    if (pickup) bits.push(`Pickup ${pickup}`);
    return bits.join(' · ');
  };

  const daySheetListingLine = (b: BookingRow) =>
    displayListingTitleFromPurchase(
      b.purchase_snapshot,
      listings.find((l) => l.id === b.listing_id)?.title,
      'Listing'
    );


  const loadListings = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setLoading(false);
      return;
    }
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    setBookingsError(null);
    try {
      const mine = await fetchMyListings(uid);
      if (gen !== loadGenRef.current) return;
      setListings(mine);
      setListingId((prev) => {
        if (prev && mine.some((l) => l.id === prev)) return prev;
        const fromUrl = (new URLSearchParams(window.location.search).get('listing') ?? '').trim();
        if (fromUrl && mine.some((l) => l.id === fromUrl)) return fromUrl;
        if (mine.length === 1) return mine[0]!.id;
        return '';
      });
      // Keep URL honest when we auto-focus the only listing.
      if (typeof window !== 'undefined' && mine.length === 1) {
        const only = mine[0]!.id;
        const url = new URL(window.location.href);
        if (url.searchParams.get('listing') !== only) {
          url.searchParams.set('listing', only);
          window.history.replaceState({}, '', `${url.pathname}${url.search}`);
        }
      }
      try {
        const mineBookings = await fetchBookingsForSupplier(uid);
        if (gen !== loadGenRef.current) return;
        setBookings(mineBookings.filter((b) => partnerStayCalendarOccupiesNight(b)));
        setBookingsError(null);
      } catch (e) {
        if (gen !== loadGenRef.current) return;
        // Do not pretend occupancy is empty — sold-seat warnings would go dark.
        setBookingsError(
          userFacingError(e, 'Could not load bookings for this calendar. Sold seats may be missing until you retry.')
        );
      }
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      setError(userFacingError(e, USER_ERROR.calendar));
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [isSupabase, user?.id]);

  const monthFromIso = cells[0]?.iso;
  const monthToIso = cells[cells.length - 1]?.iso;

  const loadCaps = useCallback(async (id: string, fromIso?: string, toIso?: string) => {
    if (!id) {
      setRows([]);
      setCapsError(null);
      return;
    }
    const gen = ++capsLoadGenRef.current;
    try {
      const data = await fetchAvailabilityByListingId(
        id,
        fromIso && toIso ? { fromDate: fromIso, toDate: toIso } : undefined
      );
      if (gen !== capsLoadGenRef.current) return;
      setRows(data);
      setCapsError(null);
    } catch (e) {
      if (gen !== capsLoadGenRef.current) return;
      // Keep prior capacity rows; never flash an empty month as “no overrides”.
      setCapsError(
        userFacingError(e, 'Could not load capacity overrides for this month. Check your connection and try again.')
      );
    }
  }, []);

  useLayoutEffect(() => {
    const clearAvailabilityPartnerWorkspace = () => {
      setListings([]);
      setBookings([]);
      setRows([]);
      setError(null);
      setBookingsError(null);
      setCapsError(null);
      setEditing(null);
    };
    if (!user?.id) {
      availabilityHubUserIdRef.current = null;
      loadGenRef.current += 1;
      clearAvailabilityPartnerWorkspace();
      setLoading(false);
      return;
    }
    // Phase 1388: clear prior partner calendar before loading the next account (Bookings 1384 parity).
    if (availabilityHubUserIdRef.current !== user.id) {
      availabilityHubUserIdRef.current = user.id;
      loadGenRef.current += 1;
      capsLoadGenRef.current += 1;
      clearAvailabilityPartnerWorkspace();
    }
  }, [user?.id]);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  const setListingIdAndUrl = useCallback((next: string) => {
    setListingId(next);
    setEditing(null);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!next) url.searchParams.delete('listing');
    else url.searchParams.set('listing', next);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const fromUrl = (new URLSearchParams(window.location.search).get('listing') ?? '').trim();
      setListingId((prev) => (prev === fromUrl ? prev : fromUrl));
      setEditing(null);
    };
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  useEffect(() => {
    if (!listings.length) return;
    if (listingId && !listings.some((l) => l.id === listingId)) {
      setListingIdAndUrl('');
    }
  }, [listings, listingId, setListingIdAndUrl]);

  useEffect(() => {
    if (prevListingIdForCapsRef.current !== listingId) {
      prevListingIdForCapsRef.current = listingId;
      capsLoadGenRef.current += 1;
      setRows([]);
      setCapsError(null);
      setEditing(null);
    }
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
    // Phase 1747: role gate before RLS (finance/viewer are read-only).
    if (!canEditCalendar) {
      setError('Your role can view the calendar but cannot change capacity or blocks.');
      return;
    }
    setSavingIso(iso);
    setError(null);
    setSaveNote(null);
    const occupied = stayCalendar && (guestsByDate.get(iso)?.count ?? 0) > 0;
    const tourOccupying = !stayCalendar ? guestsByDate.get(iso)?.guests ?? 0 : 0;
    const underSold = !stayCalendar
      ? capacityBelowSoldWarning({ newCapacity: capacity, occupyingGuests: tourOccupying, scopeLabel: 'this date' })
      : null;
    const res = await upsertAvailability(listingId, [{ available_date: iso, capacity }]);
    setSavingIso(null);
    if (!res.success) {
      setError(userFacingError(res.error, 'Could not save that date. Try again.'));
      return;
    }
    mergeCapRows([{ available_date: iso, capacity }]);
    if (occupied && capacity === 0) {
      setSaveNote(
        'Block saved. The night stays Occupied while this guest is in-house; new travelers already cannot book it. The block remains after checkout.'
      );
    } else if (underSold) {
      setSaveNote(underSold);
    } else {
      setEditing(null);
    }
    if (monthFromIso && monthToIso) await loadCaps(listingId, monthFromIso, monthToIso);
  };

  const clearCap = async (iso: string) => {
    if (!listingId) return;
    // Phase 1753: role gate before RLS — finance/viewer must not clear caps via day sheet.
    if (!canEditCalendar) {
      setError('Your role can view the calendar but cannot change capacity or blocks.');
      return;
    }
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
    if (mode === 'set' && !stayCalendar) {
      const underSold = bulkCapacityBelowSoldWarning({
        newCapacity: capacity,
        dates,
        occupyingGuestsForDate: (iso) => guestsByDate.get(iso)?.guests ?? 0,
      });
      setSaveNote(underSold);
    } else {
      setSaveNote(null);
    }
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
  // Phase 1367 / 1314 parity: experience-local today (Helsinki when no listing), not browser localYmd.
  const localTodayIso = experienceTodayIsoForListing(listing?.listingExtras?.departureTimezone);

  const listingSelectOptions = useMemo(
    () => [
      { value: '', label: 'All listings' },
      ...listings.map((l) => ({
        value: l.id,
        label: `${l.title}${l.status === 'draft' ? ' (draft)' : ''}`,
        hint:
          inventoryFamilyFromListing(l) === 'stay'
            ? 'Stay'
            : l.experienceKind === 'ticket'
              ? 'Ticket'
              : l.experienceKind === 'transportation'
                ? 'Transport'
                : 'Tour',
      })),
    ],
    [listings]
  );

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} min-h-[70vh]`}>
      <header className="tv-cal-page-head">
        <h1>Calendar</h1>
      </header>

      {!isSupabase || !user ? (
        <p className="text-sm text-ink-muted">Sign in to manage availability.</p>
      ) : loading ? (
        <div className="tv-cal-shell" aria-busy="true" aria-label="Loading calendar">
          <div className="tv-cal-grid">
            {Array.from({ length: 35 }, (_, i) => (
              <div key={i} className="min-h-[4.75rem] animate-pulse bg-[#f2f4f7] lg:min-h-[5.25rem]" />
            ))}
          </div>
        </div>
      ) : error ? (
        <ErrorState
          className="py-6"
          title="Calendar unavailable"
          body={userFacingError(error, USER_ERROR.calendar)}
          retry={{ onClick: () => void loadListings() }}
        />
      ) : listings.length === 0 ? (
        <SupplierEmptyState
          icon={CalendarDays}
          title="Create a listing first"
          body="Calendar shows departures and nights after you have a tour or stay. You have none yet — that is the first step, not a broken calendar."
          action={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigateSupplierUrl(PARTNER_CREATE_PATH)}
                className="tv-btn-primary"
              >
                New listing
              </button>
              {/* Phase 1670: Inbox/Money/Pickup parity — listings escape when calendar is empty. */}
              <button
                type="button"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`)}
                className="tv-btn-ghost"
              >
                Your listings
              </button>
            </div>
          }
        />
      ) : (
        <div>
          {bookingsError ? (
            <div className="mb-4">
              <ErrorState
                className="py-4"
                title="Bookings unavailable"
                body={bookingsError}
                retry={{ onClick: () => void loadListings() }}
              />
            </div>
          ) : null}
          {capsError && listingId ? (
            <div className="mb-4">
              {/* Phase 1628: capacity override load failure needs Retry (bookings ErrorState parity). */}
              <NoticeCallout
                title="Capacity overrides unavailable"
                tone="warn"
                action={
                  <button
                    type="button"
                    onClick={() => void loadCaps(listingId, monthFromIso, monthToIso)}
                    className="tv-btn-secondary"
                  >
                    Retry
                  </button>
                }
              >
                {capsError}
              </NoticeCallout>
            </div>
          ) : null}
          {saveNote && !editing ? (
            <div className="mb-3">
              <NoticeCallout title="Capacity saved with bookings on those dates" tone="info">
                {saveNote}
              </NoticeCallout>
            </div>
          ) : null}

          {!canEditCalendar ? (
            <NoticeCallout tone="info" className="mb-3">
              Your role can view this calendar but cannot change capacity or blocks. Ask an owner, manager, or ops teammate.
            </NoticeCallout>
          ) : null}

          {error ? (
            <ErrorState
              className="mb-3 py-4"
              title="Calendar unavailable"
              body={userFacingError(error, USER_ERROR.calendar)}
              retry={{ onClick: () => void loadListings() }}
            />
          ) : null}

          <div className="tv-cal-shell">
          <div className="tv-cal-toolbar">
            <div className="tv-cal-toolbar__nav">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="lux-flat inline-flex h-8 w-8 items-center justify-center rounded-md text-ink hover:bg-[#f2f4f7]"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="tv-cal-toolbar__month">{monthLabel}</p>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="lux-flat inline-flex h-8 w-8 items-center justify-center rounded-md text-ink hover:bg-[#f2f4f7]"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const [y, m] = localTodayIso.split('-').map(Number);
                  if (y && m) {
                    setYear(y);
                    setMonthIndex0(m - 1);
                  }
                }}
                className="lux-flat ml-1 inline-flex h-8 items-center rounded-md px-2.5 text-[13px] font-medium text-finland hover:bg-[#f2f4f7]"
              >
                Today
              </button>
            </div>
            <div className="tv-cal-toolbar__actions">
              <div className="tv-cal-toolbar__listing">
                <PartnerSelect
                  id="availability-listing"
                  aria-label="Listing"
                  value={listingId}
                  onChange={setListingIdAndUrl}
                  options={listingSelectOptions}
                />
              </div>
              {listingId ? (
                <button
                  type="button"
                  disabled={!canEditCalendar}
                  onClick={() => {
                    if (!canEditCalendar) return;
                    setBulkError(null);
                    setSaveNote(null);
                    setBulkFrom('');
                    setBulkTo('');
                    setBulkCapacity('0');
                    setBulkOpen(true);
                  }}
                  className="tv-btn-secondary inline-flex h-10 shrink-0 items-center gap-1.5 !px-3 text-[13px] disabled:opacity-40"
                >
                  <Ban className="h-3.5 w-3.5" aria-hidden />
                  {stayCalendar ? 'Block nights' : 'Edit multiple dates'}
                </button>
              ) : null}
            </div>
          </div>

          {/* Phase 1627: calendar legend must be available to assistive tech (was aria-hidden). */}
          <div
            className="tv-cal-legend"
            role="group"
            aria-label={
              stayCalendar
                ? 'Calendar legend: Occupied, Check-out, Available, Blocked'
                : 'Calendar legend: Available, Partially booked, Sold out, Closed, No schedule'
            }
          >
            {stayCalendar ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="tv-cal-legend__swatch bg-finland" /> Occupied
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="tv-cal-legend__swatch bg-amber-400" /> Check-out
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="tv-cal-legend__swatch bg-emerald-400" /> Available
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="tv-cal-legend__swatch bg-rose-500" /> Blocked
                </span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="tv-cal-legend__swatch bg-emerald-400" /> Available
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="tv-cal-legend__swatch bg-amber-400" /> Partially booked
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="tv-cal-legend__swatch bg-rose-500" /> Sold out
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="tv-cal-legend__swatch bg-slate-300" /> Closed
                </span>
                <span className="inline-flex items-center gap-1.5 text-ink-faint">No schedule</span>
              </>
            )}
          </div>

          <div className="tv-cal-weekdays" aria-hidden>
            {WEEKDAYS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div key={`${year}-${monthIndex0}`} className="tv-cal-grid motion-safe:animate-fade-in">
            {cells.map((cell) => {
              // Stays are night inventory — weekday option rules are tour departures only.
              const open = cell.inMonth && (stayCalendar || weekdayOpen(cell.iso));
              const cap = rowByDate.get(cell.iso);
              const occupying = guestsByDate.get(cell.iso);
              const departing = stayCalendar ? checkOutsByDate.get(cell.iso) : undefined;
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
              const monthCapacityLabel =
                !stayCalendar && listing && open
                  ? (() => {
                      const opts = materializedBookingOptions(listing.listingExtras?.bookingOptions);
                      const deps = tourSellingDeparturesOnDate(opts, cell.iso);
                      const dayBookingsForCell = bookings.filter((b) => {
                        if (!partnerStayCalendarOccupiesNight(b)) return false;
                        if (!viewingAll && b.listing_id !== listingId) return false;
                        return b.booking_date === cell.iso;
                      });
                      return partnerTourMonthCellCapacityLabel({
                        offered: open,
                        dayCapacityOverride:
                          typeof cap?.capacity === 'number' ? cap.capacity : null,
                        defaultCapacity: defaultSpots(listing),
                        occupyingGuestsDay: occupying?.guests ?? 0,
                        departures: deps.map((d) => ({
                          startTimeHm: normalizeTourStartTimeHm(d.startTime) || d.startTime,
                          maxSpots: d.maxSpotsPerSlot,
                          occupyingGuests: tourCheckoutOccupiedGuests(
                            dayBookingsForCell,
                            cell.iso,
                            null,
                            Date.now(),
                            d.startTime || null
                          ),
                        })),
                      });
                    })()
                  : {
                      short: null,
                      aria: null,
                      tone: null as 'full' | 'partial' | 'open' | null,
                      timeHm: null,
                      remaining: null,
                      capacity: null,
                      departuresCount: 0,
                    };
              const tourCapacity = tourSpots.capacity;
              const remaining = tourSpots.remaining;
              const isToday = cell.iso === localTodayIso;
              const isPast = cell.inMonth && cell.iso < localTodayIso;
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
                    : departing
                      ? `${dateLabel}, check-out`
                      : occupying
                      ? `${dateLabel}, ${occupying.guests} guest${occupying.guests === 1 ? '' : 's'}`
                      : monthCapacityLabel.aria
                        ? `${dateLabel}, ${monthCapacityLabel.aria}`
                        : remaining !== null && tourCapacity != null
                        ? `${dateLabel}, ${remaining} of ${tourCapacity} spots left`
                        : open
                          ? `${dateLabel}, available`
                          : `${dateLabel}, ${stayCalendar ? 'not offered' : 'no schedule'}`;
              const openDaySheet = () => {
                // With a listing selected, closed weekdays must still open so partners can set a cap / block.
                if (viewingAll) {
                  if (!open && !occupying) return;
                } else if (!listingId) {
                  return;
                }
                setSaveNote(null);
                setEditing({
                  iso: cell.iso,
                  capacity: String(cap?.capacity ?? defaultSpots(listing) ?? ''),
                });
              };
              return (
                <button
                  key={cell.iso}
                  type="button"
                  // Phase 1753: finance/viewer may open the day sheet to view occupancy;
                  // Save/Clear stay gated via canEditCalendar (clearCap/saveCap).
                  disabled={!cell.inMonth || busy}
                  aria-label={statusLabel}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={isEditing}
                  onClick={openDaySheet}
                  className={`lux-flat tv-cal-day ${
                    !cell.inMonth
                      ? 'tv-cal-day--out'
                      : isEditing
                        ? 'tv-cal-day--editing'
                        : [
                            isToday ? 'tv-cal-day--today' : '',
                            isPast ? 'tv-cal-day--past' : '',
                            occupying || stayKind === 'occupied'
                              ? 'tv-cal-day--occupied'
                              : departing
                                ? 'tv-cal-day--checkout'
                                : stayKind === 'blocked' || (open && monthCapacityLabel.tone === 'full')
                                  ? stayKind === 'blocked'
                                    ? 'tv-cal-day--blocked'
                                    : 'tv-cal-day--full'
                                  : (cap && (stayCalendar || open)) || (open && stayCalendar)
                                    ? 'tv-cal-day--available'
                                    : open
                                      ? 'tv-cal-day--open'
                                      : 'tv-cal-day--closed',
                          ]
                            .filter(Boolean)
                            .join(' ')
                  }`}
                >
                  <span className="tv-cal-day__num">{cell.day}</span>
                  {cell.inMonth && stayCalendar && (stayKind === 'occupied' || occupying) ? (
                    <span className="tv-cal-day__meta tv-cal-day__meta--cap">
                      <span className="tv-cal-day__dot" aria-hidden />
                      Occupied
                    </span>
                  ) : cell.inMonth && !stayCalendar && monthCapacityLabel.short ? (
                    <>
                      {monthCapacityLabel.timeHm ? (
                        <span className="tv-cal-day__meta">{monthCapacityLabel.timeHm}</span>
                      ) : monthCapacityLabel.departuresCount >= 2 ? (
                        <span className="tv-cal-day__meta">
                          {monthCapacityLabel.departuresCount} departures
                        </span>
                      ) : null}
                      <span
                        className={`tv-cal-day__meta ${
                          monthCapacityLabel.tone === 'full'
                            ? 'tv-cal-day__meta--danger'
                            : monthCapacityLabel.tone === 'partial'
                              ? 'tv-cal-day__meta--warn'
                              : 'tv-cal-day__meta--cap'
                        }`}
                      >
                        {monthCapacityLabel.short === 'Sold out' ||
                        monthCapacityLabel.short === 'Closed' ? (
                          <>
                            <span
                              className={`tv-cal-day__dot ${
                                monthCapacityLabel.short === 'Closed'
                                  ? 'tv-cal-day__dot--muted'
                                  : 'tv-cal-day__dot--danger'
                              }`}
                              aria-hidden
                            />
                            {monthCapacityLabel.short}
                          </>
                        ) : monthCapacityLabel.short === 'Partial' ? (
                          <>
                            <span className="tv-cal-day__dot tv-cal-day__dot--warn" aria-hidden />
                            Partial
                          </>
                        ) : monthCapacityLabel.remaining != null &&
                          monthCapacityLabel.capacity != null ? (
                          <>
                            <span className="tv-cal-day__dot" aria-hidden />
                            {monthCapacityLabel.remaining} / {monthCapacityLabel.capacity}
                          </>
                        ) : (
                          monthCapacityLabel.short
                        )}
                      </span>
                    </>
                  ) : cell.inMonth && occupying ? (
                    <span className="tv-cal-day__meta tv-cal-day__meta--cap">
                      {occupying.guests} guest{occupying.guests === 1 ? '' : 's'}
                    </span>
                  ) : cell.inMonth && departing ? (
                    <span className="tv-cal-day__meta tv-cal-day__meta--warn">Check-out</span>
                  ) : cell.inMonth && stayKind === 'blocked' ? (
                    <span className="tv-cal-day__meta tv-cal-day__meta--danger">
                      <span className="tv-cal-day__dot tv-cal-day__dot--danger" aria-hidden />
                      Blocked
                    </span>
                  ) : cell.inMonth && remaining !== null && tourCapacity != null ? (
                    <span
                      className={`tv-cal-day__meta ${
                        remaining === 0 ? 'tv-cal-day__meta--danger' : 'tv-cal-day__meta--cap'
                      }`}
                    >
                      {remaining === 0 ? (
                        <>
                          <span className="tv-cal-day__dot tv-cal-day__dot--danger" aria-hidden />
                          Sold out
                        </>
                      ) : (
                        <>
                          <span className="tv-cal-day__dot" aria-hidden />
                          {remaining} / {tourCapacity}
                        </>
                      )}
                    </span>
                  ) : cell.inMonth && open ? (
                    <span className="tv-cal-day__meta">
                      <span className="tv-cal-day__dot" aria-hidden />
                      Open
                    </span>
                  ) : cell.inMonth ? (
                    <span className="tv-cal-day__meta">
                      {cap && !stayCalendar ? 'Closed' : '—'}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {!stayCalendar && listingId && listing ? (
            <div className="tv-cal-mobile-list" aria-label="Upcoming departures this month">
              {cells
                .filter((c) => c.inMonth && c.iso >= localTodayIso && weekdayOpen(c.iso))
                .slice(0, 12)
                .map((cell) => {
                  const cap = rowByDate.get(cell.iso);
                  const occupying = guestsByDate.get(cell.iso);
                  const opts = materializedBookingOptions(listing.listingExtras?.bookingOptions);
                  const deps = tourSellingDeparturesOnDate(opts, cell.iso);
                  const dayBookingsForCell = bookings.filter(
                    (b) =>
                      partnerStayCalendarOccupiesNight(b) &&
                      b.listing_id === listingId &&
                      b.booking_date === cell.iso
                  );
                  const label = partnerTourMonthCellCapacityLabel({
                    offered: true,
                    dayCapacityOverride:
                      typeof cap?.capacity === 'number' ? cap.capacity : null,
                    defaultCapacity: defaultSpots(listing),
                    occupyingGuestsDay: occupying?.guests ?? 0,
                    departures: deps.map((d) => ({
                      startTimeHm: normalizeTourStartTimeHm(d.startTime) || d.startTime,
                      maxSpots: d.maxSpotsPerSlot,
                      occupyingGuests: tourCheckoutOccupiedGuests(
                        dayBookingsForCell,
                        cell.iso,
                        null,
                        Date.now(),
                        d.startTime || null
                      ),
                    })),
                  });
                  const dayName = new Date(`${cell.iso}T12:00:00`).toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  });
                  return (
                    <button
                      key={`m-${cell.iso}`}
                      type="button"
                      className="tv-cal-mobile-list__item lux-flat"
                      onClick={() => {
                        setSaveNote(null);
                        setEditing({
                          iso: cell.iso,
                          capacity: String(cap?.capacity ?? defaultSpots(listing) ?? ''),
                        });
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-ink">{dayName}</span>
                        <span className="mt-0.5 block text-[12px] text-ink-muted">
                          {label.timeHm
                            ? label.timeHm
                            : label.departuresCount >= 2
                              ? `${label.departuresCount} departures`
                              : 'Departure day'}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 text-[12px] font-semibold tabular-nums ${
                          label.tone === 'full'
                            ? 'text-rose-700'
                            : label.tone === 'partial'
                              ? 'text-amber-800'
                              : 'text-ink'
                        }`}
                      >
                        {label.short === 'Sold out' || label.short === 'Closed' || label.short === 'Partial'
                          ? label.short === 'Partial'
                            ? 'Partial'
                            : label.short
                          : label.remaining != null && label.capacity != null
                            ? `${label.remaining} / ${label.capacity}`
                            : label.short ?? '—'}
                      </span>
                    </button>
                  );
                })}
            </div>
          ) : null}
          </div>

          {editing ? (
            <div ref={daySheetRef} className="tv-sheet-overlay z-[70]">
              <button
                type="button"
                tabIndex={-1}
                className="absolute inset-0"
                aria-label="Close day"
                onClick={closeDaySheet}
              />
              <aside
                role="dialog"
                aria-modal="true"
                aria-labelledby="calendar-day-title"
                className="tv-sheet-panel relative max-w-md !rounded-t-xl !p-0 motion-safe:animate-slide-up sm:!rounded-xl"
              >
                <div className="tv-cal-day-panel">
                  <div className="tv-cal-day-panel__head">
                    <div className="min-w-0">
                      <h2 id="calendar-day-title">
                        {new Date(`${editing.iso}T12:00:00`).toLocaleDateString('en-GB', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </h2>
                      <p className="tv-cal-day-panel__sub" title={listing?.title?.trim() || undefined}>
                        {viewingAll
                          ? 'All listings — select one to edit capacity'
                          : [listing?.city, listing?.title?.trim()].filter(Boolean).join(' · ') ||
                            'Listing'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeDaySheet}
                      className="lux-flat inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-[#f2f4f7] hover:text-ink"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>

                  <div className="tv-cal-day-panel__body">
                    {(dayBookings.length > 0 || dayDepartures.length > 0) && (
                      <section className="tv-cal-day-panel__section">
                        <h3>Bookings</h3>
                        <ul>
                          {dayBookings.map((b) => {
                            const times = daySheetTimesLine(b);
                            const hold = formatPartnerCheckoutHoldLabel(b);
                            return (
                              <li key={b.id}>
                                <button
                                  type="button"
                                  onClick={() => openSupplierBooking(b.id)}
                                  className="lux-flat w-full rounded-md px-0 py-2 text-left hover:bg-[#f8fafc]"
                                >
                                  <p className="text-[13px] font-medium text-ink">
                                    {b.guest_name?.trim() || 'Guest'}
                                  </p>
                                  <p className="text-[12px] text-ink-muted">
                                    {viewingAll
                                      ? `${daySheetListingLine(b)} · ${b.guests} guest${
                                          b.guests === 1 ? '' : 's'
                                        }`
                                      : `${b.guests} guest${b.guests === 1 ? '' : 's'}`}
                                    {times ? ` · ${times}` : ''}
                                    {stayCalendar ? ' · In-house' : ''}
                                  </p>
                                  {hold ? (
                                    <p className="mt-0.5 text-[11px] font-medium text-amber-900">{hold}</p>
                                  ) : null}
                                </button>
                              </li>
                            );
                          })}
                          {dayDepartures.map((b) => (
                            <li key={`out-${b.id}`}>
                              <button
                                type="button"
                                onClick={() => openSupplierBooking(b.id)}
                                className="lux-flat w-full rounded-md px-0 py-2 text-left hover:bg-[#f8fafc]"
                              >
                                <p className="text-[13px] font-medium text-ink">
                                  {b.guest_name?.trim() || 'Guest'}
                                </p>
                                <p className="text-[12px] text-ink-muted">
                                  {viewingAll
                                    ? `${daySheetListingLine(b)} · ${b.guests} guest${
                                        b.guests === 1 ? '' : 's'
                                      }`
                                    : `${b.guests} guest${b.guests === 1 ? '' : 's'}`}
                                  {' · Check-out'}
                                </p>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {!stayCalendar && !viewingAll && listing ? (
                      <section className="tv-cal-day-panel__section">
                        <h3>Departures</h3>
                        {daySellingDepartures.length > 0 ? (
                          <ul>
                            {daySellingDepartures.map((d) => {
                              const occupying = tourCheckoutOccupiedGuests(
                                dayBookings,
                                editing.iso,
                                null,
                                Date.now(),
                                d.startTime || null
                              );
                              const line = partnerDepartureRemainingLine({
                                scheduleName: d.scheduleName,
                                optionName: d.optionName,
                                startTime: d.startTime,
                                maxSpotsPerSlot: d.maxSpotsPerSlot,
                                occupyingGuests: occupying,
                              });
                              const optionLabel =
                                d.optionName.trim() ||
                                d.scheduleName.trim() ||
                                'Departure';
                              return (
                                <li
                                  key={`${d.optionId}-${d.scheduleId}-${d.startTime}`}
                                  className="tv-cal-dep-row"
                                >
                                  <span className="tv-cal-dep-row__time">
                                    {normalizeTourStartTimeHm(d.startTime) || d.startTime || '—'}
                                  </span>
                                  <span className="tv-cal-dep-row__name" title={optionLabel}>
                                    {optionLabel}
                                  </span>
                                  <span
                                    className={`tv-cal-dep-row__cap ${
                                      line.full ? 'tv-cal-dep-row__cap--full' : ''
                                    }`}
                                  >
                                    {line.full
                                      ? 'Sold out'
                                      : `${line.remaining} / ${line.capacity}`}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="tv-cal-day-panel__hint">
                            {weekdayOpen(editing.iso)
                              ? 'No ready departures for this date.'
                              : 'No schedule on this weekday — a daily override does not open traveler booking.'}
                          </p>
                        )}
                      </section>
                    ) : null}

                    {viewingAll ? (
                      <section className="tv-cal-day-panel__section">
                        <h3>Select listing</h3>
                        <p className="tv-cal-day-panel__hint">
                          Capacity edits apply to one listing at a time.
                        </p>
                        <PartnerSelect
                          id="calendar-day-pick-listing"
                          aria-label="Listing to edit"
                          value={listingId}
                          onChange={setListingIdAndUrl}
                          placeholder="Select a listing…"
                          options={listingSelectOptions.filter((o) => o.value !== '')}
                        />
                      </section>
                    ) : stayCalendar ? (
                      <section className="tv-cal-day-panel__section">
                        <h3>Night block</h3>
                        {dayBookings.length > 0 ? (
                          <p className="tv-cal-day-panel__hint">
                            Occupied by a paid stay. Blocking still saves for after checkout.
                          </p>
                        ) : dayDepartures.length > 0 ? (
                          <p className="tv-cal-day-panel__hint">
                            Check-out morning — night is free for the next stay.
                          </p>
                        ) : (
                          <p className="tv-cal-day-panel__hint">
                            Set 0 to block this night. Reset clears the block.
                          </p>
                        )}
                        {saveNote ? (
                          <p className="mb-3 text-[12px] font-medium text-emerald-800">{saveNote}</p>
                        ) : null}
                        <label className="mb-1 block text-[12px] font-medium text-ink" htmlFor="day-capacity">
                          Block value
                        </label>
                        <input
                          id="day-capacity"
                          type="number"
                          min={0}
                          max={99}
                          value={editing.capacity}
                          onChange={(e) => {
                            setSaveNote(null);
                            setEditing({ ...editing, capacity: e.target.value });
                          }}
                          className="tv-input !min-h-10 w-28"
                        />
                      </section>
                    ) : (
                      <section className="tv-cal-day-panel__section">
                        <h3>Daily availability</h3>
                        <p className="tv-cal-day-panel__hint">
                          Optional day-wide cap across all departures. Does not change each
                          option&apos;s schedule capacity. Set 0 to close the day. Reset removes
                          the override.
                        </p>
                        {saveNote ? (
                          <div className="mb-3">
                            <NoticeCallout title="Saved" tone="info">
                              {saveNote}
                            </NoticeCallout>
                          </div>
                        ) : null}
                        <label
                          className="mb-1 block text-[12px] font-medium text-ink"
                          htmlFor="day-capacity"
                        >
                          Daily capacity override
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            id="day-capacity"
                            type="number"
                            min={0}
                            max={99}
                            value={editing.capacity}
                            onChange={(e) => setEditing({ ...editing, capacity: e.target.value })}
                            className="tv-input !min-h-10 w-28 tabular-nums"
                          />
                          <span className="text-[13px] text-ink-muted">spots</span>
                        </div>
                      </section>
                    )}
                  </div>

                  {!viewingAll ? (
                    <div className="tv-cal-day-panel__foot">
                      <button
                        type="button"
                        disabled={!canEditCalendar || savingIso === editing.iso}
                        onClick={() => void clearCap(editing.iso)}
                        className="lux-flat text-[13px] font-medium text-ink-muted hover:text-ink disabled:opacity-40"
                      >
                        Reset to schedule defaults
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={closeDaySheet}
                          className="tv-btn-ghost !min-h-9 !px-3 text-[13px]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!canEditCalendar || savingIso === editing.iso}
                          onClick={() =>
                            void saveCap(
                              editing.iso,
                              Math.max(0, Math.floor(Number(editing.capacity) || 0))
                            )
                          }
                          className="tv-btn-primary !min-h-9 !px-3 text-[13px] disabled:opacity-40"
                        >
                          {savingIso === editing.iso ? 'Saving…' : 'Save changes'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </aside>
            </div>
          ) : null}
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
                ? 'Block several nights at once \u2014 a maintenance week or a personal booking elsewhere. Clear range returns nights to available. Nights with paid stays stay Occupied until checkout; a block still saves for afterward.'
                : 'Set the same spot count across a date range at once \u2014 close for a holiday, or open extra departures for a busy stretch. Clear range removes daily overrides. Caps never override weekday or season rules on the traveler calendar.'}
            </p>
            {stayCalendar &&
            /^\d{4}-\d{2}-\d{2}$/.test(bulkFrom) &&
            /^\d{4}-\d{2}-\d{2}$/.test(bulkTo) &&
            bulkFrom <= bulkTo
              ? (() => {
                  const occupiedNights = enumerateIsoDates(bulkFrom, bulkTo).filter(
                    (iso) => (guestsByDate.get(iso)?.count ?? 0) > 0
                  ).length;
                  return occupiedNights > 0 ? (
                    <NoticeCallout title="Some nights already have stays" tone="info">
                      {occupiedNights} night{occupiedNights === 1 ? '' : 's'} in this range already have paid
                      guests. Blocking still saves; Occupied labels stay until checkout.
                    </NoticeCallout>
                  ) : null;
                })()
              : null}
            {!stayCalendar &&
            /^\d{4}-\d{2}-\d{2}$/.test(bulkFrom) &&
            /^\d{4}-\d{2}-\d{2}$/.test(bulkTo) &&
            bulkFrom <= bulkTo
              ? (() => {
                  const underSold = bulkCapacityBelowSoldWarning({
                    newCapacity: Math.max(0, Math.floor(Number(bulkCapacity) || 0)),
                    dates: enumerateIsoDates(bulkFrom, bulkTo),
                    occupyingGuestsForDate: (iso) => guestsByDate.get(iso)?.guests ?? 0,
                  });
                  return underSold ? (
                    <NoticeCallout title="Some dates already have more guests booked" tone="info">
                      {underSold}
                    </NoticeCallout>
                  ) : null;
                })()
              : null}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-ink" htmlFor="bulk-from">
                  From
                </label>
                <input
                  id="bulk-from"
                  type="date"
                  value={bulkFrom}
                  onChange={(e) => setBulkFrom(e.target.value)}
                  className="tv-input w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-ink" htmlFor="bulk-to">
                  To
                </label>
                <input
                  id="bulk-to"
                  type="date"
                  value={bulkTo}
                  onChange={(e) => setBulkTo(e.target.value)}
                  className="tv-input w-full"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-ink" htmlFor="bulk-capacity">
                {stayCalendar
                  ? 'Night block (0 = blocked)'
                  : 'Daily capacity override (0 = closed)'}
              </label>
              <p className="mb-2 text-[12px] leading-snug text-ink-muted">
                {stayCalendar
                  ? 'Applies the same block value to every night in the range.'
                  : 'Day-wide listing cap only — does not rewrite each departure’s schedule capacity.'}
              </p>
              <input
                id="bulk-capacity"
                type="number"
                min={0}
                max={99}
                value={bulkCapacity}
                onChange={(e) => setBulkCapacity(e.target.value)}
                className="tv-input w-28 tabular-nums"
              />
            </div>
            {bulkError ? <p className="text-sm text-red-700">{bulkError}</p> : null}
            {bulkFrom && bulkTo && bulkFrom <= bulkTo ? (
              <p className="text-[12px] text-ink-muted">
                {`${listing?.title?.trim() || 'Listing'} · ${enumerateIsoDates(bulkFrom, bulkTo).length} date${
                  enumerateIsoDates(bulkFrom, bulkTo).length === 1 ? '' : 's'
                } affected`}
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
