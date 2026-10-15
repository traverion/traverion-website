import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, CalendarDays, Layers, X } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import { fetchMyListings, pgTimeToHm, updateListing } from '../../data/supabase-listings';
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
import {
  nightsOccupiedByStay,
  stayRangeFromBooking,
  partnerStayDayKind,
  partnerStayCalendarOccupiesNight,
  addCalendarDays,
} from '../../lib/stayOccupancy';
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
import {
  bulkActionSummary,
  CUTOFF_PRESETS,
  cutoffDisplayLabel,
  enumerateIsoDates,
  patchOptionCutoff,
  patchScheduleOrOptionSpots,
  resolveOptionCutoffHours,
  type BulkCalendarAction,
} from './calendarAvailabilityUi';
import AvailabilityAgendaView from './AvailabilityAgendaView';
import AvailabilityWeekView from './AvailabilityWeekView';
import {
  buildWorkspaceDepartures,
  filterDeparturesByStatus,
  nextDaysRange,
  optionChoicesForListings,
  parseAvailabilityView,
  parseStatusFilter,
  weekRangeContaining,
  type AvailabilityStatusFilter,
  type AvailabilityViewMode,
} from './availabilityWorkspaceModel';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_FILTER_DEFAULT = [true, true, true, true, true, true, true];

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
  const [depEdits, setDepEdits] = useState<
    Record<string, { spots: string; cutoffHours: string }>
  >({});
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [dayDraftCapacity, setDayDraftCapacity] = useState('');
  const dayBaselineCapacityRef = useRef('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFrom, setBulkFrom] = useState('');
  const [bulkTo, setBulkTo] = useState('');
  const [bulkCapacity, setBulkCapacity] = useState('0');
  const [bulkAction, setBulkAction] = useState<BulkCalendarAction>('close');
  const [bulkWeekdays, setBulkWeekdays] = useState<boolean[]>(() => [...WEEKDAY_FILTER_DEFAULT]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [view, setView] = useState<AvailabilityViewMode>(() => {
    if (typeof window === 'undefined') return 'agenda';
    return parseAvailabilityView(new URLSearchParams(window.location.search).get('view'));
  });
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [optionId, setOptionId] = useState(() => {
    if (typeof window === 'undefined') return '';
    return (new URLSearchParams(window.location.search).get('option') ?? '').trim();
  });
  const [statusFilter, setStatusFilter] = useState<AvailabilityStatusFilter>(() => {
    if (typeof window === 'undefined') return 'all';
    return parseStatusFilter(new URLSearchParams(window.location.search).get('status'));
  });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [workspaceCapRows, setWorkspaceCapRows] = useState<AvailabilityRow[]>([]);
  const daySheetRef = useRef<HTMLDivElement>(null);
  const loadGenRef = useRef(0);
  /** Invalidates in-flight month/listing capacity fetches — stale responses must not paint another listing. */
  const capsLoadGenRef = useRef(0);
  const prevListingIdForCapsRef = useRef(listingId);
  const availabilityHubUserIdRef = useRef<string | null>(null);

  const forceCloseDaySheet = useCallback(() => {
    setEditing(null);
    setDepEdits({});
    setDayDraftCapacity('');
    setSaveNote(null);
    setScheduleSaving(false);
  }, []);

  const requestCloseDaySheet = useCallback(() => {
    const dayDirty = dayDraftCapacity !== dayBaselineCapacityRef.current;
    const scheduleDirty = Object.keys(depEdits).length > 0;
    if (dayDirty || scheduleDirty) {
      const ok = window.confirm('Discard unsaved changes for this date?');
      if (!ok) return;
    }
    forceCloseDaySheet();
  }, [dayDraftCapacity, depEdits, forceCloseDaySheet]);

  useDialogFocus(editing !== null, daySheetRef, requestCloseDaySheet);

  useEffect(() => {
    if (!editing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [editing]);

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
    const nextStr = String(capacity);
    dayBaselineCapacityRef.current = nextStr;
    setDayDraftCapacity(nextStr);
    setEditing((prev) => (prev ? { ...prev, capacity: nextStr } : prev));
    if (occupied && capacity === 0) {
      setSaveNote(
        'Block saved. The night stays Occupied while this guest is in-house; new travelers already cannot book it. The block remains after checkout.'
      );
    } else if (underSold) {
      setSaveNote(underSold);
    } else {
      setSaveNote(capacity < 1 ? 'Date closed for new bookings.' : 'Date availability saved.');
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
    const restored = String(defaultSpots(listing) ?? '');
    dayBaselineCapacityRef.current = restored;
    setDayDraftCapacity(restored);
    setEditing((prev) => (prev ? { ...prev, capacity: restored } : prev));
    setSaveNote('Restored schedule defaults for this date (day override cleared).');
    if (monthFromIso && monthToIso) await loadCaps(listingId, monthFromIso, monthToIso);
  };

  const saveScheduleDefaults = async () => {
    if (!listing || !canEditCalendar || !editing) return;
    const occupiedByKey = new Map<string, number>();
    for (const d of daySellingDepartures) {
      const rowKey = `${d.optionId}-${d.scheduleId}-${d.startTime}`;
      occupiedByKey.set(
        rowKey,
        tourCheckoutOccupiedGuests(
          dayBookings,
          editing.iso,
          null,
          Date.now(),
          d.startTime || null
        )
      );
    }
    let opts = materializedBookingOptions(listing.listingExtras?.bookingOptions);
    let changed = false;
    for (const d of daySellingDepartures) {
      const rowKey = `${d.optionId}-${d.scheduleId}-${d.startTime}`;
      const draft = depEdits[rowKey];
      if (!draft) continue;
      const baselineCutoff = resolveOptionCutoffHours(listing, d.optionId);
      const nextSpots = Math.min(99, Math.max(1, Math.floor(Number(draft.spots) || 0)));
      const nextCutoff = Math.max(0, Math.floor(Number(draft.cutoffHours) || 0));
      const occupying = occupiedByKey.get(rowKey) ?? 0;
      if (nextSpots !== d.maxSpotsPerSlot) {
        if (nextSpots < occupying) {
          setSaveNote(
            `Cannot set ${d.optionName || 'departure'} capacity below ${occupying} confirmed guest${
              occupying === 1 ? '' : 's'
            }.`
          );
          return;
        }
        opts = patchScheduleOrOptionSpots(opts, d.optionId, d.scheduleId, nextSpots);
        changed = true;
      }
      if (nextCutoff !== baselineCutoff) {
        opts = patchOptionCutoff(opts, d.optionId, nextCutoff);
        changed = true;
      }
    }
    if (!changed) {
      setSaveNote('No schedule default changes to save.');
      return;
    }
    setScheduleSaving(true);
    setSaveNote(null);
    try {
      const res = await persistListingOptions(opts);
      if (!res.success) {
        setSaveNote(res.error ?? 'Could not save schedule defaults.');
        return;
      }
      setDepEdits({});
      setSaveNote('Schedule defaults saved. They apply to all dates using these departures.');
    } finally {
      setScheduleSaving(false);
    }
  };

  const persistListingOptions = async (
    nextOptions: ReturnType<typeof materializedBookingOptions>
  ): Promise<{ success: boolean; error?: string }> => {
    if (!listing || !listingId) return { success: false, error: 'Select a listing.' };
    const res = await updateListing(listingId, {
      ...listing,
      listingExtras: {
        ...listing.listingExtras,
        bookingOptions: nextOptions,
      },
    });
    if (!res.ok) return { success: false, error: res.error ?? 'Could not update listing.' };
    if (res.tour) {
      setListings((prev) => prev.map((l) => (l.id === listingId ? res.tour! : l)));
    }
    return { success: true };
  };

  const applyBulk = async () => {
    if (!listingId || !canEditCalendar) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bulkFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(bulkTo)) {
      setBulkError('Pick a start and end date.');
      return;
    }
    if (bulkFrom > bulkTo) {
      setBulkError('End date must be on or after the start date.');
      return;
    }
    if (!bulkWeekdays.some(Boolean)) {
      setBulkError('Select at least one weekday.');
      return;
    }
    const dates = enumerateIsoDates(bulkFrom, bulkTo, bulkWeekdays);
    if (dates.length === 0) {
      setBulkError('No dates match that range and weekday filter.');
      return;
    }
    const capacity = Math.max(0, Math.floor(Number(bulkCapacity) || 0));
    const mode: 'set' | 'clear' =
      bulkAction === 'reopen' || bulkAction === 'clear' ? 'clear' : 'set';
    const applyCapacity = bulkAction === 'close' ? 0 : capacity;
    if (
      !bulkConfirm &&
      (bulkAction === 'close' || (bulkAction === 'set_override' && applyCapacity === 0))
    ) {
      setBulkConfirm(true);
      return;
    }
    setBulkSaving(true);
    setBulkError(null);
    const res =
      mode === 'clear'
        ? await deleteAvailabilityRange(listingId, dates)
        : await upsertAvailability(
            listingId,
            dates.map((available_date) => ({ available_date, capacity: applyCapacity }))
          );
    setBulkSaving(false);
    if (!res.success) {
      setBulkError(userFacingError(res.error, 'Could not save that range. Try again.'));
      return;
    }
    if (mode === 'clear') removeCapRows(dates);
    else mergeCapRows(dates.map((available_date) => ({ available_date, capacity: applyCapacity })));
    if (mode === 'set' && !stayCalendar) {
      const underSold = bulkCapacityBelowSoldWarning({
        newCapacity: applyCapacity,
        dates,
        occupyingGuestsForDate: (iso) => guestsByDate.get(iso)?.guests ?? 0,
      });
      setSaveNote(
        underSold ??
          bulkActionSummary({
            action: bulkAction,
            dateCount: dates.length,
            capacity: applyCapacity,
            stay: stayCalendar,
          })
      );
    } else {
      setSaveNote(
        bulkActionSummary({
          action: bulkAction,
          dateCount: dates.length,
          capacity: applyCapacity,
          stay: stayCalendar,
        })
      );
    }
    setBulkOpen(false);
    setBulkConfirm(false);
    setBulkFrom('');
    setBulkTo('');
    setBulkCapacity('0');
    setBulkAction('close');
    setBulkWeekdays([...WEEKDAY_FILTER_DEFAULT]);
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
      { value: '', label: 'All products' },
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

  // Seed agenda/week date window once we know experience-local today.
  useEffect(() => {
    if (filterFrom && filterTo) return;
    const today = localTodayIso;
    if (view === 'week') {
      const w = weekRangeContaining(today);
      setFilterFrom(w.from);
      setFilterTo(w.to);
    } else {
      const r = nextDaysRange(today, 14);
      setFilterFrom(r.from);
      setFilterTo(r.to);
    }
  }, [localTodayIso, view, filterFrom, filterTo]);

  const syncWorkspaceUrl = useCallback(
    (next: {
      view?: AvailabilityViewMode;
      listing?: string;
      option?: string;
      status?: AvailabilityStatusFilter;
      from?: string;
      to?: string;
    }) => {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      const v = next.view ?? view;
      if (v === 'agenda') url.searchParams.delete('view');
      else url.searchParams.set('view', v);
      const lid = next.listing !== undefined ? next.listing : listingId;
      if (lid) url.searchParams.set('listing', lid);
      else url.searchParams.delete('listing');
      const oid = next.option !== undefined ? next.option : optionId;
      if (oid) url.searchParams.set('option', oid);
      else url.searchParams.delete('option');
      const st = next.status !== undefined ? next.status : statusFilter;
      if (st === 'all') url.searchParams.delete('status');
      else url.searchParams.set('status', st);
      const from = next.from !== undefined ? next.from : filterFrom;
      const to = next.to !== undefined ? next.to : filterTo;
      if (from && to && v !== 'month') {
        url.searchParams.set('from', from);
        url.searchParams.set('to', to);
      } else {
        url.searchParams.delete('from');
        url.searchParams.delete('to');
      }
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    },
    [view, listingId, optionId, statusFilter, filterFrom, filterTo]
  );

  const setViewAndRange = useCallback(
    (next: AvailabilityViewMode) => {
      setView(next);
      setSelectedKeys(new Set());
      if (next === 'week') {
        const w = weekRangeContaining(localTodayIso);
        setFilterFrom(w.from);
        setFilterTo(w.to);
        syncWorkspaceUrl({ view: next, from: w.from, to: w.to });
      } else if (next === 'agenda') {
        const r = nextDaysRange(localTodayIso, 14);
        setFilterFrom(r.from);
        setFilterTo(r.to);
        syncWorkspaceUrl({ view: next, from: r.from, to: r.to });
      } else {
        syncWorkspaceUrl({ view: next });
      }
    },
    [localTodayIso, syncWorkspaceUrl]
  );

  // Load day-capacity overrides for the workspace window (multi-listing when All products).
  useEffect(() => {
    if (view === 'month') return;
    if (!filterFrom || !filterTo) return;
    let cancelled = false;
    const tourIds = (
      listingId
        ? listings.filter((l) => l.id === listingId)
        : listings.filter((l) => inventoryFamilyFromListing(l) !== 'stay')
    )
      .map((l) => l.id)
      .slice(0, 48);
    if (tourIds.length === 0) {
      setWorkspaceCapRows([]);
      return;
    }
    void (async () => {
      try {
        const batches = await Promise.all(
          tourIds.map((id) =>
            fetchAvailabilityByListingId(id, { fromDate: filterFrom, toDate: filterTo })
          )
        );
        if (cancelled) return;
        setWorkspaceCapRows(batches.flat());
      } catch {
        if (!cancelled) setWorkspaceCapRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, filterFrom, filterTo, listingId, listings]);

  const dayCapsMap = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    const source = view === 'month' ? rows : workspaceCapRows.length ? workspaceCapRows : rows;
    for (const r of source) {
      let inner = map.get(r.listing_id);
      if (!inner) {
        inner = new Map();
        map.set(r.listing_id, inner);
      }
      inner.set(r.available_date, r.capacity);
    }
    return map;
  }, [view, rows, workspaceCapRows]);

  const workspaceDepartures = useMemo(() => {
    if (view === 'month' || stayCalendar) return [];
    if (!filterFrom || !filterTo) return [];
    const raw = buildWorkspaceDepartures({
      listings,
      listingIds: listingId ? [listingId] : 'all',
      optionId,
      fromIso: filterFrom,
      toIso: filterTo,
      dayCaps: dayCapsMap,
      occupyingForSlot: (lid, iso, startTimeHm) =>
        tourCheckoutOccupiedGuests(
          bookings.filter((b) => b.listing_id === lid && b.booking_date === iso),
          iso,
          null,
          Date.now(),
          startTimeHm || null
        ),
    });
    return filterDeparturesByStatus(raw, statusFilter);
  }, [
    view,
    stayCalendar,
    filterFrom,
    filterTo,
    listings,
    listingId,
    optionId,
    dayCapsMap,
    bookings,
    statusFilter,
  ]);

  const optionSelectOptions = useMemo(
    () => [
      { value: '', label: 'All options' },
      ...optionChoicesForListings(listings, listingId ? [listingId] : 'all'),
    ],
    [listings, listingId]
  );

  const openManageDate = useCallback(
    (iso: string, forListingId: string) => {
      if (forListingId && forListingId !== listingId) {
        setListingIdAndUrl(forListingId);
      }
      const targetListing =
        listings.find((l) => l.id === (forListingId || listingId)) ?? listing;
      const cap =
        (forListingId || listingId
          ? dayCapsMap.get(forListingId || listingId)?.get(iso)
          : undefined) ?? undefined;
      const capStr = String(
        typeof cap === 'number' ? cap : defaultSpots(targetListing ?? null) ?? ''
      );
      dayBaselineCapacityRef.current = capStr;
      setDayDraftCapacity(capStr);
      setDepEdits({});
      setSaveNote(null);
      setEditing({ iso, capacity: capStr });
    },
    [listingId, listings, listing, dayCapsMap, setListingIdAndUrl]
  );

  const selectedDepartureRows = useMemo(
    () => workspaceDepartures.filter((r) => selectedKeys.has(r.key)),
    [workspaceDepartures, selectedKeys]
  );

  const applyAgendaBulkClose = async () => {
    if (!canEditCalendar || selectedDepartureRows.length === 0) return;
    const byListing = new Map<string, Set<string>>();
    for (const r of selectedDepartureRows) {
      let set = byListing.get(r.listingId);
      if (!set) {
        set = new Set();
        byListing.set(r.listingId, set);
      }
      set.add(r.iso);
    }
    setBulkSaving(true);
    try {
      for (const [lid, dates] of byListing) {
        const list = [...dates];
        const res = await upsertAvailability(
          lid,
          list.map((available_date) => ({ available_date, capacity: 0 }))
        );
        if (!res.success) {
          setSaveNote(res.error ?? 'Could not close some selected dates.');
          return;
        }
      }
      setSelectedKeys(new Set());
      setSaveNote(
        `Closed ${[...byListing.values()].reduce((n, s) => n + s.size, 0)} date(s) for selected departures (day-wide).`
      );
      // Refresh workspace caps
      setFilterFrom((f) => f);
      setWorkspaceCapRows((prev) => prev); // trigger reload via effect deps by bumping
      const tourIds = [...byListing.keys()];
      const batches = await Promise.all(
        tourIds.map((id) =>
          fetchAvailabilityByListingId(id, { fromDate: filterFrom, toDate: filterTo })
        )
      );
      setWorkspaceCapRows((prev) => {
        const drop = new Set(tourIds);
        return [...prev.filter((r) => !drop.has(r.listing_id)), ...batches.flat()];
      });
    } finally {
      setBulkSaving(false);
    }
  };

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} min-h-[70vh]`}>
      <header className="tv-avail-page-head">
        <div className="tv-avail-page-head__text">
          <h1>Availability</h1>
          <p>Manage departures, inventory and booking cutoffs</p>
        </div>
        {listings.length > 0 && listingId ? (
          <button
            type="button"
            disabled={!canEditCalendar}
            onClick={() => {
              if (!canEditCalendar) return;
              setBulkError(null);
              setBulkConfirm(false);
              setSaveNote(null);
              setBulkFrom(filterFrom || localTodayIso);
              setBulkTo(filterTo || addCalendarDays(localTodayIso, 6));
              setBulkCapacity('0');
              setBulkAction('close');
              setBulkWeekdays([...WEEKDAY_FILTER_DEFAULT]);
              setBulkOpen(true);
            }}
            className="tv-btn-primary inline-flex h-10 shrink-0 items-center gap-1.5 !px-3 text-[13px] disabled:opacity-40"
          >
            <Layers className="h-3.5 w-3.5" aria-hidden />
            Bulk edit
          </button>
        ) : null}
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
          body="Availability shows departures and nights after you have a tour or stay. You have none yet — that is the first step."
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
              title="Availability unavailable"
              body={userFacingError(error, USER_ERROR.calendar)}
              retry={{ onClick: () => void loadListings() }}
            />
          ) : null}

          <div className="tv-avail-switch" role="tablist" aria-label="Availability views">
            {(
              [
                { id: 'agenda' as const, label: 'Agenda' },
                { id: 'week' as const, label: 'Week' },
                { id: 'month' as const, label: 'Month' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={view === tab.id}
                className={`tv-avail-switch__btn ${view === tab.id ? 'is-active' : ''}`}
                onClick={() => setViewAndRange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="tv-avail-filters">
            {view !== 'month' ? (
              <>
                <div className="tv-avail-filters__field">
                  <label htmlFor="avail-from">From</label>
                  <input
                    id="avail-from"
                    type="date"
                    value={filterFrom}
                    onChange={(e) => {
                      setFilterFrom(e.target.value);
                      syncWorkspaceUrl({ from: e.target.value });
                    }}
                    className="tv-input"
                  />
                </div>
                <div className="tv-avail-filters__field">
                  <label htmlFor="avail-to">To</label>
                  <input
                    id="avail-to"
                    type="date"
                    value={filterTo}
                    onChange={(e) => {
                      setFilterTo(e.target.value);
                      syncWorkspaceUrl({ to: e.target.value });
                    }}
                    className="tv-input"
                  />
                </div>
                <div className="tv-avail-filters__shortcuts">
                  <button
                    type="button"
                    className="lux-flat"
                    onClick={() => {
                      const r = nextDaysRange(localTodayIso, 1);
                      setFilterFrom(r.from);
                      setFilterTo(r.to);
                      syncWorkspaceUrl({ from: r.from, to: r.to });
                    }}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className="lux-flat"
                    onClick={() => {
                      const t = addCalendarDays(localTodayIso, 1);
                      setFilterFrom(t);
                      setFilterTo(t);
                      syncWorkspaceUrl({ from: t, to: t });
                    }}
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    className="lux-flat"
                    onClick={() => {
                      const r = nextDaysRange(localTodayIso, 7);
                      setFilterFrom(r.from);
                      setFilterTo(r.to);
                      if (view === 'week') {
                        const w = weekRangeContaining(localTodayIso);
                        setFilterFrom(w.from);
                        setFilterTo(w.to);
                        syncWorkspaceUrl({ from: w.from, to: w.to });
                      } else {
                        syncWorkspaceUrl({ from: r.from, to: r.to });
                      }
                    }}
                  >
                    Next 7 days
                  </button>
                </div>
              </>
            ) : null}
            <div className="tv-avail-filters__field tv-avail-filters__field--grow">
              <label htmlFor="availability-listing">Product</label>
              <PartnerSelect
                id="availability-listing"
                aria-label="Product"
                value={listingId}
                onChange={(id) => {
                  setListingIdAndUrl(id);
                  setOptionId('');
                  syncWorkspaceUrl({ listing: id, option: '' });
                }}
                options={listingSelectOptions}
              />
            </div>
            {!stayCalendar ? (
              <div className="tv-avail-filters__field tv-avail-filters__field--grow">
                <label htmlFor="availability-option">Option</label>
                <PartnerSelect
                  id="availability-option"
                  aria-label="Option"
                  value={optionId}
                  onChange={(id) => {
                    setOptionId(id);
                    syncWorkspaceUrl({ option: id });
                  }}
                  options={optionSelectOptions}
                />
              </div>
            ) : null}
            {!stayCalendar && view !== 'month' ? (
              <div className="tv-avail-filters__field">
                <label htmlFor="availability-status">Status</label>
                <select
                  id="availability-status"
                  value={statusFilter}
                  onChange={(e) => {
                    const next = parseStatusFilter(e.target.value);
                    setStatusFilter(next);
                    syncWorkspaceUrl({ status: next });
                  }}
                  className="tv-input"
                >
                  <option value="all">All statuses</option>
                  <option value="available">Available</option>
                  <option value="limited">Limited availability</option>
                  <option value="sold_out">Sold out</option>
                  <option value="closed">Closed</option>
                  <option value="cutoff">Past cutoff</option>
                </select>
              </div>
            ) : null}
          </div>

          {view === 'agenda' && selectedKeys.size > 0 ? (
            <div className="tv-avail-bulkbar">
              <span>
                {selectedKeys.size} selected ·{' '}
                {new Set(selectedDepartureRows.map((r) => r.iso)).size} date
                {new Set(selectedDepartureRows.map((r) => r.iso)).size === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                disabled={!canEditCalendar || bulkSaving}
                onClick={() => void applyAgendaBulkClose()}
                className="tv-btn-secondary !min-h-9 !px-3 text-[13px] disabled:opacity-40"
              >
                {bulkSaving ? 'Closing…' : 'Close selected dates'}
              </button>
              <button
                type="button"
                className="tv-btn-ghost !min-h-9 !px-3 text-[13px]"
                onClick={() => setSelectedKeys(new Set())}
              >
                Clear selection
              </button>
            </div>
          ) : null}

          {view === 'agenda' && !stayCalendar ? (
            <AvailabilityAgendaView
              rows={workspaceDepartures}
              selectedKeys={selectedKeys}
              canEdit={canEditCalendar}
              onToggleKey={(key) => {
                setSelectedKeys((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                });
              }}
              onToggleDate={(_iso, keys) => {
                setSelectedKeys((prev) => {
                  const next = new Set(prev);
                  const allOn = keys.every((k) => next.has(k));
                  if (allOn) keys.forEach((k) => next.delete(k));
                  else keys.forEach((k) => next.add(k));
                  return next;
                });
              }}
              onOpenDate={openManageDate}
            />
          ) : null}

          {view === 'week' && !stayCalendar ? (
            <AvailabilityWeekView
              weekFromIso={filterFrom || weekRangeContaining(localTodayIso).from}
              todayIso={localTodayIso}
              rows={workspaceDepartures}
              onOpenDate={(iso, lid) => {
                if (!lid && listingId) openManageDate(iso, listingId);
                else if (lid) openManageDate(iso, lid);
                else if (listings[0]) openManageDate(iso, listings[0].id);
              }}
            />
          ) : null}

          {stayCalendar && view !== 'month' ? (
            <NoticeCallout tone="info" className="mb-3">
              Stay listings use the Month view for night inventory. Switch to Month to manage blocks.
            </NoticeCallout>
          ) : null}

          {view === 'month' || stayCalendar ? (
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
                          name: d.optionName || d.scheduleName || 'Departure',
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
                      departureLines: [],
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
                setDepEdits({});
                const capStr = String(cap?.capacity ?? defaultSpots(listing) ?? '');
                dayBaselineCapacityRef.current = capStr;
                setDayDraftCapacity(capStr);
                setEditing({
                  iso: cell.iso,
                  capacity: capStr,
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
                      {monthCapacityLabel.departuresCount >= 2 ? (
                        <span className="tv-cal-day__meta">
                          {monthCapacityLabel.departuresCount} departures
                        </span>
                      ) : monthCapacityLabel.timeHm ? (
                        <span className="tv-cal-day__meta">{monthCapacityLabel.timeHm}</span>
                      ) : null}
                      {monthCapacityLabel.short === 'Sold out' ||
                      monthCapacityLabel.short === 'Closed' ||
                      monthCapacityLabel.short === 'Partial' ? (
                        <span
                          className={`tv-cal-day__meta ${
                            monthCapacityLabel.tone === 'full'
                              ? 'tv-cal-day__meta--danger'
                              : monthCapacityLabel.tone === 'partial'
                                ? 'tv-cal-day__meta--warn'
                                : 'tv-cal-day__meta--cap'
                          }`}
                        >
                          <span
                            className={`tv-cal-day__dot ${
                              monthCapacityLabel.short === 'Closed'
                                ? 'tv-cal-day__dot--muted'
                                : monthCapacityLabel.short === 'Partial'
                                  ? 'tv-cal-day__dot--warn'
                                  : 'tv-cal-day__dot--danger'
                            }`}
                            aria-hidden
                          />
                          {monthCapacityLabel.short === 'Partial' ? 'Limited' : monthCapacityLabel.short}
                        </span>
                      ) : monthCapacityLabel.departureLines.length >= 2 ? (
                        <span className="tv-cal-day__deps" aria-hidden={false}>
                          {monthCapacityLabel.departureLines.slice(0, 2).map((line) => (
                            <span
                              key={`${line.startTimeHm}-${line.shortName}`}
                              className={`tv-cal-day__dep ${
                                line.full ? 'tv-cal-day__dep--full' : ''
                              }`}
                            >
                              <span className="tv-cal-day__dep-name">{line.shortName}</span>
                              <span className="tv-cal-day__dep-cap">
                                {line.full ? 'Full' : `${line.remaining}/${line.capacity}`}
                              </span>
                            </span>
                          ))}
                          {monthCapacityLabel.departureLines.length > 2 ? (
                            <span className="tv-cal-day__meta">
                              +{monthCapacityLabel.departureLines.length - 2} more
                            </span>
                          ) : null}
                        </span>
                      ) : monthCapacityLabel.remaining != null &&
                        monthCapacityLabel.capacity != null ? (
                        <span className="tv-cal-day__meta tv-cal-day__meta--cap">
                          <span className="tv-cal-day__dot" aria-hidden />
                          {monthCapacityLabel.remaining} / {monthCapacityLabel.capacity}
                        </span>
                      ) : (
                        <span className="tv-cal-day__meta">{monthCapacityLabel.short}</span>
                      )}
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
                      name: d.optionName || d.scheduleName || 'Departure',
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
                        setDepEdits({});
                        const capStr = String(cap?.capacity ?? defaultSpots(listing) ?? '');
                        dayBaselineCapacityRef.current = capStr;
                        setDayDraftCapacity(capStr);
                        setEditing({
                          iso: cell.iso,
                          capacity: capStr,
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
          ) : null}

          {editing
            ? createPortal(
                <div ref={daySheetRef} className="tv-cal-drawer-root">
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute inset-0"
                    aria-label="Close day panel"
                    onClick={requestCloseDaySheet}
                  />
                  <aside
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="calendar-day-title"
                    className="tv-cal-drawer relative z-[1]"
                  >
                    <header className="tv-cal-drawer__head">
                      <div className="min-w-0 flex-1">
                        <p className="tv-cal-drawer__kicker">Manage availability</p>
                        <h2 id="calendar-day-title">
                          {new Date(`${editing.iso}T12:00:00`).toLocaleDateString('en-GB', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </h2>
                        <p className="tv-cal-drawer__listing">
                          {viewingAll
                            ? 'All listings — select one to edit'
                            : listing?.title?.trim() || 'Listing'}
                        </p>
                        {!viewingAll && listing ? (
                          <p className="tv-cal-drawer__status">
                            {(() => {
                              const cap = rowByDate.get(editing.iso);
                              if (typeof cap?.capacity === 'number' && cap.capacity < 1) {
                                return (
                                  <span className="tv-cal-status tv-cal-status--closed">
                                    Status: Closed
                                  </span>
                                );
                              }
                              if (!stayCalendar && daySellingDepartures.length === 0) {
                                return (
                                  <span className="tv-cal-status tv-cal-status--muted">
                                    Status: No schedule
                                  </span>
                                );
                              }
                              if (dayBookings.length > 0) {
                                return (
                                  <span className="tv-cal-status tv-cal-status--warn">
                                    Status: Has bookings
                                  </span>
                                );
                              }
                              return (
                                <span className="tv-cal-status tv-cal-status--open">
                                  Status: Open
                                </span>
                              );
                            })()}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={requestCloseDaySheet}
                        className="lux-flat inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-[#f2f4f7] hover:text-ink"
                        aria-label="Close"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </header>

                    <div className="tv-cal-drawer__body">
                      {saveNote ? (
                        <div className="mb-4">
                          <NoticeCallout title="Saved" tone="info">
                            {saveNote}
                          </NoticeCallout>
                        </div>
                      ) : null}

                      {(dayBookings.length > 0 || dayDepartures.length > 0) && (
                        <section className="tv-cal-drawer__section">
                          <h3>Bookings</h3>
                          <ul className="m-0 list-none p-0">
                            {dayBookings.map((b) => {
                              const times = daySheetTimesLine(b);
                              const hold = formatPartnerCheckoutHoldLabel(b);
                              return (
                                <li key={b.id} className="border-b border-[#f2f4f7] last:border-0">
                                  <button
                                    type="button"
                                    onClick={() => openSupplierBooking(b.id)}
                                    className="lux-flat w-full rounded-md px-0 py-2.5 text-left hover:bg-[#f8fafc]"
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
                                      <p className="mt-0.5 text-[11px] font-medium text-amber-900">
                                        {hold}
                                      </p>
                                    ) : null}
                                  </button>
                                </li>
                              );
                            })}
                            {dayDepartures.map((b) => (
                              <li
                                key={`out-${b.id}`}
                                className="border-b border-[#f2f4f7] last:border-0"
                              >
                                <button
                                  type="button"
                                  onClick={() => openSupplierBooking(b.id)}
                                  className="lux-flat w-full rounded-md px-0 py-2.5 text-left hover:bg-[#f8fafc]"
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

                      {viewingAll ? (
                        <section className="tv-cal-drawer__section">
                          <h3>Select listing</h3>
                          <p className="tv-cal-drawer__hint">
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
                      ) : (
                        <section className="tv-cal-drawer__section">
                          <h3>Manage this date</h3>
                          <p className="tv-cal-drawer__hint">
                            {stayCalendar
                              ? 'Close or reopen this night. Existing stays stay intact.'
                              : 'Close or reopen this date, or set an optional day-wide guest limit across all departures. This does not change each departure’s schedule capacity.'}
                          </p>
                          <div className="tv-cal-drawer__actions">
                            <button
                              type="button"
                              disabled={!canEditCalendar || savingIso === editing.iso}
                              onClick={() => void saveCap(editing.iso, 0)}
                              className="tv-btn-secondary !min-h-10 !px-3 text-[13px] disabled:opacity-40"
                            >
                              {stayCalendar ? 'Block night' : 'Close date'}
                            </button>
                            <button
                              type="button"
                              disabled={!canEditCalendar || savingIso === editing.iso}
                              onClick={() => void clearCap(editing.iso)}
                              className="tv-btn-secondary !min-h-10 !px-3 text-[13px] disabled:opacity-40"
                            >
                              {stayCalendar ? 'Clear block' : 'Reopen date'}
                            </button>
                          </div>
                          <label
                            className="mb-1.5 block text-[12px] font-medium text-ink"
                            htmlFor="day-capacity"
                          >
                            {stayCalendar
                              ? 'Night block value (0 = blocked)'
                              : 'Day-wide capacity limit (0 = closed)'}
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              id="day-capacity"
                              type="number"
                              min={0}
                              max={99}
                              value={dayDraftCapacity}
                              onChange={(e) => {
                                setSaveNote(null);
                                setDayDraftCapacity(e.target.value);
                                setEditing({ ...editing, capacity: e.target.value });
                              }}
                              className="tv-input !min-h-10 w-28 tabular-nums"
                            />
                            <span className="text-[13px] text-ink-muted">spots</span>
                          </div>
                        </section>
                      )}

                      {!stayCalendar && !viewingAll && listing ? (
                        <section className="tv-cal-drawer__section">
                          <h3>Departures on this date</h3>
                          {daySellingDepartures.length > 0 ? (
                            <ul className="tv-cal-dep-list">
                              {daySellingDepartures.map((d) => {
                                const rowKey = `${d.optionId}-${d.scheduleId}-${d.startTime}`;
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
                                const dayCapRow = rowByDate.get(editing.iso);
                                const dayClosed =
                                  typeof dayCapRow?.capacity === 'number' &&
                                  dayCapRow.capacity < 1;
                                const statusWord = dayClosed
                                  ? 'Closed'
                                  : line.full
                                    ? 'Sold out'
                                    : 'Available';
                                return (
                                  <li key={rowKey} className="tv-cal-dep-row">
                                    <p className="tv-cal-dep-row__title">
                                      <span className="tv-cal-dep-row__time">
                                        {normalizeTourStartTimeHm(d.startTime) ||
                                          d.startTime ||
                                          '—'}
                                      </span>
                                      {' — '}
                                      {optionLabel}
                                    </p>
                                    <p className="tv-cal-dep-row__meta">
                                      {statusWord}
                                      {' · '}
                                      {line.remaining} of {line.capacity} seats remaining
                                      {occupying > 0 ? ` · ${occupying} booked` : ''}
                                    </p>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="tv-cal-drawer__hint">
                              {weekdayOpen(editing.iso)
                                ? 'No ready departures for this date.'
                                : 'No schedule on this weekday — a day override does not open traveler booking.'}
                            </p>
                          )}
                        </section>
                      ) : null}

                      {!stayCalendar && !viewingAll && listing && daySellingDepartures.length > 0 ? (
                        <section className="tv-cal-drawer__section">
                          <h3>Edit schedule defaults</h3>
                          <p className="tv-cal-drawer__hint">
                            These controls change capacity and booking cutoff for the schedule or
                            option across all applicable dates — not only{' '}
                            {new Date(`${editing.iso}T12:00:00`).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                            })}
                            . Date-specific departure overrides are not supported.
                          </p>
                          <ul className="tv-cal-dep-list">
                            {daySellingDepartures.map((d) => {
                              const rowKey = `${d.optionId}-${d.scheduleId}-${d.startTime}`;
                              const occupying = tourCheckoutOccupiedGuests(
                                dayBookings,
                                editing.iso,
                                null,
                                Date.now(),
                                d.startTime || null
                              );
                              const optionLabel =
                                d.optionName.trim() ||
                                d.scheduleName.trim() ||
                                'Departure';
                              const cutoffHours = resolveOptionCutoffHours(listing, d.optionId);
                              const draft = depEdits[rowKey] ?? {
                                spots: String(d.maxSpotsPerSlot),
                                cutoffHours: String(cutoffHours),
                              };
                              return (
                                <li key={`sch-${rowKey}`} className="tv-cal-dep-row">
                                  <p className="tv-cal-dep-row__title">
                                    <span className="tv-cal-dep-row__time">
                                      {normalizeTourStartTimeHm(d.startTime) ||
                                        d.startTime ||
                                        '—'}
                                    </span>
                                    {' — '}
                                    {optionLabel}
                                  </p>
                                  <p className="tv-cal-dep-row__meta">
                                    Current cutoff: {cutoffDisplayLabel(cutoffHours)}
                                  </p>
                                  {canEditCalendar ? (
                                    <div className="tv-cal-dep-row__fields">
                                      <label className="tv-cal-dep-row__field">
                                        <span>Capacity</span>
                                        <input
                                          type="number"
                                          min={Math.max(1, occupying)}
                                          max={99}
                                          value={draft.spots}
                                          disabled={scheduleSaving}
                                          onChange={(e) =>
                                            setDepEdits((prev) => ({
                                              ...prev,
                                              [rowKey]: {
                                                ...draft,
                                                spots: e.target.value,
                                              },
                                            }))
                                          }
                                          className="tv-input tabular-nums"
                                        />
                                      </label>
                                      <label className="tv-cal-dep-row__field">
                                        <span>Booking cutoff</span>
                                        <select
                                          value={draft.cutoffHours}
                                          disabled={scheduleSaving}
                                          onChange={(e) =>
                                            setDepEdits((prev) => ({
                                              ...prev,
                                              [rowKey]: {
                                                ...draft,
                                                cutoffHours: e.target.value,
                                              },
                                            }))
                                          }
                                          className="tv-input"
                                        >
                                          {CUTOFF_PRESETS.map((p) => (
                                            <option key={p.hours} value={String(p.hours)}>
                                              {p.label}
                                            </option>
                                          ))}
                                          {!CUTOFF_PRESETS.some(
                                            (p) => String(p.hours) === draft.cutoffHours
                                          ) ? (
                                            <option value={draft.cutoffHours}>
                                              {draft.cutoffHours}h custom
                                            </option>
                                          ) : null}
                                        </select>
                                      </label>
                                    </div>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                          {canEditCalendar ? (
                            <div className="mt-4">
                              <button
                                type="button"
                                disabled={scheduleSaving || Object.keys(depEdits).length === 0}
                                onClick={() => void saveScheduleDefaults()}
                                className="tv-btn-secondary !min-h-10 !px-3 text-[13px] disabled:opacity-40"
                              >
                                {scheduleSaving ? 'Saving…' : 'Save schedule defaults'}
                              </button>
                            </div>
                          ) : null}
                        </section>
                      ) : null}
                    </div>

                    {!viewingAll ? (
                      <footer className="tv-cal-drawer__foot">
                        <span className="tv-cal-drawer__foot-note">
                          Save applies to this date only
                        </span>
                        <button
                          type="button"
                          onClick={requestCloseDaySheet}
                          className="tv-btn-ghost !min-h-10 !px-3 text-[13px]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!canEditCalendar || savingIso === editing.iso}
                          onClick={() =>
                            void saveCap(
                              editing.iso,
                              Math.max(0, Math.floor(Number(dayDraftCapacity) || 0))
                            )
                          }
                          className="tv-btn-primary !min-h-10 !px-3 text-[13px] disabled:opacity-40"
                        >
                          {savingIso === editing.iso ? 'Saving…' : 'Save changes'}
                        </button>
                      </footer>
                    ) : (
                      <footer className="tv-cal-drawer__foot">
                        <button
                          type="button"
                          onClick={requestCloseDaySheet}
                          className="tv-btn-ghost !min-h-10 !px-3 text-[13px]"
                        >
                          Close
                        </button>
                      </footer>
                    )}
                  </aside>
                </div>,
                document.body
              )
            : null}
        </div>
      )}

      {bulkOpen ? (
        <SupplierModalShell
          onClose={bulkSaving ? undefined : () => {
            setBulkOpen(false);
            setBulkConfirm(false);
          }}
          maxWidth="lg"
        >
          <SupplierModalHeader
            icon={Layers}
            title="Bulk availability"
            subtitle={listing?.title}
            onClose={
              bulkSaving
                ? undefined
                : () => {
                    setBulkOpen(false);
                    setBulkConfirm(false);
                  }
            }
          />
          <div className="space-y-5 p-4 sm:p-5">
            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-ink">1. Select dates</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-ink" htmlFor="bulk-from">
                    From
                  </label>
                  <input
                    id="bulk-from"
                    type="date"
                    value={bulkFrom}
                    onChange={(e) => {
                      setBulkConfirm(false);
                      setBulkFrom(e.target.value);
                    }}
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
                    onChange={(e) => {
                      setBulkConfirm(false);
                      setBulkTo(e.target.value);
                    }}
                    className="tv-input w-full"
                  />
                </div>
              </div>
              <p className="mb-2 mt-3 text-[12px] font-medium text-ink">Weekdays</p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={bulkWeekdays[i]}
                    onClick={() => {
                      setBulkConfirm(false);
                      setBulkWeekdays((prev) => {
                        const next = [...prev];
                        next[i] = !next[i];
                        return next;
                      });
                    }}
                    className={`lux-flat inline-flex h-8 min-w-[2.25rem] items-center justify-center rounded-md px-2 text-[12px] font-medium ${
                      bulkWeekdays[i]
                        ? 'bg-finland text-white'
                        : 'bg-[#f2f4f7] text-ink-muted hover:bg-[#e8ebf0]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  className="lux-flat ml-1 text-[12px] font-medium text-finland hover:underline"
                  onClick={() => {
                    setBulkConfirm(false);
                    setBulkWeekdays([true, true, true, true, true, false, false]);
                  }}
                >
                  Weekdays
                </button>
                <button
                  type="button"
                  className="lux-flat text-[12px] font-medium text-finland hover:underline"
                  onClick={() => {
                    setBulkConfirm(false);
                    setBulkWeekdays([false, false, false, false, false, true, true]);
                  }}
                >
                  Weekends
                </button>
                <button
                  type="button"
                  className="lux-flat text-[12px] font-medium text-finland hover:underline"
                  onClick={() => {
                    setBulkConfirm(false);
                    setBulkWeekdays([...WEEKDAY_FILTER_DEFAULT]);
                  }}
                >
                  All
                </button>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-ink">2. Choose action</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    {
                      id: 'close' as const,
                      label: stayCalendar ? 'Block nights' : 'Close dates',
                      hint: stayCalendar
                        ? 'Block inventory for new stays'
                        : 'Day-wide close (capacity 0)',
                    },
                    {
                      id: 'reopen' as const,
                      label: stayCalendar ? 'Clear blocks' : 'Reopen / restore defaults',
                      hint: 'Remove daily overrides in range',
                    },
                    {
                      id: 'set_override' as const,
                      label: stayCalendar ? 'Set night value' : 'Set day-wide limit',
                      hint: stayCalendar
                        ? 'Same block value on each night'
                        : 'Cap total guests across departures',
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={bulkAction === opt.id}
                    onClick={() => {
                      setBulkConfirm(false);
                      setBulkAction(opt.id);
                    }}
                    className={`lux-flat rounded-lg border px-3 py-2.5 text-left ${
                      bulkAction === opt.id
                        ? 'border-finland bg-[#f5f8ff]'
                        : 'border-[#e5e7eb] bg-white hover:bg-[#fafafa]'
                    }`}
                  >
                    <span className="block text-[13px] font-semibold text-ink">{opt.label}</span>
                    <span className="mt-0.5 block text-[11px] text-ink-muted">{opt.hint}</span>
                  </button>
                ))}
              </div>
              {bulkAction === 'set_override' ? (
                <div className="mt-3">
                  <label
                    className="mb-1 block text-[12px] font-medium text-ink"
                    htmlFor="bulk-capacity"
                  >
                    {stayCalendar ? 'Night value (0 = blocked)' : 'Day-wide spots (0 = closed)'}
                  </label>
                  <input
                    id="bulk-capacity"
                    type="number"
                    min={0}
                    max={99}
                    value={bulkCapacity}
                    onChange={(e) => {
                      setBulkConfirm(false);
                      setBulkCapacity(e.target.value);
                    }}
                    className="tv-input w-28 tabular-nums"
                  />
                  {!stayCalendar ? (
                    <p className="mt-1.5 text-[12px] text-ink-muted">
                      Does not rewrite each departure&apos;s schedule capacity. Booking cutoffs are
                      edited per option in Manage date.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-ink">3. Review</h3>
              {bulkFrom && bulkTo && bulkFrom <= bulkTo ? (
                (() => {
                  const dates = enumerateIsoDates(bulkFrom, bulkTo, bulkWeekdays);
                  const applyCapacity =
                    bulkAction === 'close' ? 0 : Math.max(0, Math.floor(Number(bulkCapacity) || 0));
                  const underSold =
                    !stayCalendar && bulkAction === 'set_override'
                      ? bulkCapacityBelowSoldWarning({
                          newCapacity: applyCapacity,
                          dates,
                          occupyingGuestsForDate: (iso) => guestsByDate.get(iso)?.guests ?? 0,
                        })
                      : null;
                  const occupiedNights = stayCalendar
                    ? dates.filter((iso) => (guestsByDate.get(iso)?.count ?? 0) > 0).length
                    : 0;
                  return (
                    <div className="rounded-lg border border-[#e5e7eb] bg-[#fafafa] px-3 py-3 text-[13px] text-ink">
                      <p className="font-medium">
                        {bulkActionSummary({
                          action: bulkAction,
                          dateCount: dates.length,
                          capacity: applyCapacity,
                          stay: stayCalendar,
                        })}
                      </p>
                      <p className="mt-1 text-[12px] text-ink-muted">
                        {listing?.title?.trim() || 'Listing'} · day-wide inventory only
                      </p>
                      {underSold ? (
                        <p className="mt-2 text-[12px] font-medium text-amber-900">{underSold}</p>
                      ) : null}
                      {occupiedNights > 0 ? (
                        <p className="mt-2 text-[12px] text-ink-muted">
                          {occupiedNights} night{occupiedNights === 1 ? '' : 's'} already have paid
                          guests — Occupied labels stay until checkout.
                        </p>
                      ) : null}
                      {bulkConfirm ? (
                        <NoticeCallout title="Confirm closing dates" tone="warn" className="mt-3">
                          Existing bookings stay intact. New travelers will not be able to book these
                          dates. Click Apply again to confirm.
                        </NoticeCallout>
                      ) : null}
                    </div>
                  );
                })()
              ) : (
                <p className="text-[13px] text-ink-muted">Choose a valid date range to preview impact.</p>
              )}
            </section>

            {bulkError ? <p className="text-sm text-red-700">{bulkError}</p> : null}

            <div className="flex flex-wrap justify-end gap-2 border-t border-[#eef0f3] pt-4">
              <button
                type="button"
                onClick={() => {
                  setBulkOpen(false);
                  setBulkConfirm(false);
                }}
                disabled={bulkSaving}
                className="tv-btn-ghost disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkSaving}
                onClick={() => void applyBulk()}
                className="tv-btn-primary disabled:opacity-50"
              >
                {bulkSaving ? 'Applying…' : bulkConfirm ? 'Confirm apply' : 'Apply changes'}
              </button>
            </div>
          </div>
        </SupplierModalShell>
      ) : null}
    </div>
  );
}
