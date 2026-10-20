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
  partnerTourMonthCellCapacityLabel,
  partnerTourDaySpotDisplay,
} from '../../lib/availability-ops';
import { tourSellingDeparturesOnDate } from '../../lib/listing-option-schedules';
import { formatPartnerCheckoutHoldLabel, tourCheckoutOccupiedGuests, normalizeTourStartTimeHm } from '../../lib/booking-hold';
import { experienceTodayIsoForListing } from '../../lib/booking-quote';
import { navigateSupplierUrl, openSupplierBooking } from '../../lib/supplierPortalNavigation';
import { PARTNER_CREATE_PATH, PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierEmptyState,
  SupplierModalHeader,
  SupplierModalShell,
  SupplierPageHero,
} from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import NoticeCallout from '../../components/NoticeCallout';
import PartnerSelect from '../../components/supplier/PartnerSelect';
import { TraverionSingleDateField } from '../../components/calendar/TraverionSingleDateField';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import {
  findSlotOverride,
  SLOT_OVERRIDE_CAPACITY_MAX,
  upsertSlotOverride,
  type ListingSlotOverride,
} from '../../lib/listing-slot-overrides';
import {
  bookingCutoffSelectLabel,
  bulkActionSummary,
  countDeparturesForOption,
  enumerateIsoDates,
  parseBulkAction,
  resolveOptionCapacitiesAcrossDates,
  resolveOptionCutoffHours,
  resolveOptionCutoffsAcrossDates,
  type BulkCalendarAction,
} from './calendarAvailabilityUi';
import AvailabilityCutoffField from '../../components/supplier/AvailabilityCutoffField';
import AvailabilityAgendaView from './AvailabilityAgendaView';
import AvailabilityWeekView from './AvailabilityWeekView';
import {
  buildWorkspaceDepartures,
  filterDeparturesByStatus,
  formatWeekRangeLabel,
  nextDaysRange,
  optionChoicesForListings,
  parseAvailabilityView,
  parseStatusFilter,
  shiftWeekRange,
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
  const [depBaseline, setDepBaseline] = useState<
    Record<string, { spots: string; cutoffHours: string }>
  >({});
  const [dayClosedDraft, setDayClosedDraft] = useState(false);
  const [dayClosedBaseline, setDayClosedBaseline] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [bulkDiscardOpen, setBulkDiscardOpen] = useState(false);
  const [bulkDirty, setBulkDirty] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFrom, setBulkFrom] = useState('');
  const [bulkTo, setBulkTo] = useState('');
  const [bulkCapacity, setBulkCapacity] = useState('16');
  const [bulkCutoffHours, setBulkCutoffHours] = useState('24');
  const [bulkAction, setBulkAction] = useState<BulkCalendarAction>('close');
  const [bulkTargetOptionId, setBulkTargetOptionId] = useState('');
  const [bulkCapacityMixed, setBulkCapacityMixed] = useState(false);
  const [bulkCutoffMixed, setBulkCutoffMixed] = useState(false);
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

  const isDaySheetDirty = useCallback(() => {
    if (dayClosedDraft !== dayClosedBaseline) return true;
    for (const [key, draft] of Object.entries(depEdits)) {
      const base = depBaseline[key];
      if (!base) return true;
      if (draft.spots !== base.spots || draft.cutoffHours !== base.cutoffHours) return true;
    }
    for (const key of Object.keys(depBaseline)) {
      if (!(key in depEdits)) return true;
    }
    return false;
  }, [dayClosedDraft, dayClosedBaseline, depEdits, depBaseline]);

  const forceCloseDaySheet = useCallback(() => {
    setEditing(null);
    setDepEdits({});
    setDepBaseline({});
    setDayClosedDraft(false);
    setDayClosedBaseline(false);
    setDiscardOpen(false);
    setSaveNote(null);
    setScheduleSaving(false);
  }, []);

  const requestCloseDaySheet = useCallback(() => {
    if (isDaySheetDirty()) {
      setDiscardOpen(true);
      return;
    }
    forceCloseDaySheet();
  }, [isDaySheetDirty, forceCloseDaySheet]);

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

  const persistListingExtras = async (
    nextExtras: NonNullable<TourPackage['listingExtras']>
  ): Promise<{ success: boolean; error?: string }> => {
    if (!listing || !listingId) return { success: false, error: 'Select a listing.' };
    const res = await updateListing(listingId, {
      ...listing,
      listingExtras: nextExtras,
    });
    if (!res.ok) return { success: false, error: res.error ?? 'Could not update listing.' };
    if (res.tour) {
      setListings((prev) => prev.map((l) => (l.id === listingId ? res.tour! : l)));
    }
    return { success: true };
  };

  const persistDayClosed = async (iso: string, closed: boolean): Promise<boolean> => {
    if (!listingId || !canEditCalendar) return false;
    if (closed) {
      const res = await upsertAvailability(listingId, [{ available_date: iso, capacity: 0 }]);
      if (!res.success) {
        setError(userFacingError(res.error, 'Could not close that date. Try again.'));
        return false;
      }
      mergeCapRows([{ available_date: iso, capacity: 0 }]);
      return true;
    }
    const res = await deleteAvailability(listingId, iso);
    if (!res.success) {
      setError(userFacingError(res.error, 'Could not reopen that date. Try again.'));
      return false;
    }
    removeCapRows([iso]);
    return true;
  };

  const saveDayChanges = async () => {
    if (!listing || !canEditCalendar || !editing) return;
    if (scheduleSaving || savingIso === editing.iso) return;
    setScheduleSaving(true);
    setSavingIso(editing.iso);
    setError(null);
    setSaveNote(null);
    try {
      if (dayClosedDraft !== dayClosedBaseline) {
        const ok = await persistDayClosed(editing.iso, dayClosedDraft);
        if (!ok) return;
      }

      if (!stayCalendar) {
        let overrides = [...(listing.listingExtras?.slotOverrides ?? [])];
        let overridesChanged = false;

        for (const d of daySellingDepartures) {
          const rowKey = `${d.optionId}-${d.scheduleId}-${d.startTime}`;
          const draft = depEdits[rowKey];
          const base = depBaseline[rowKey];
          if (!draft || !base) continue;
          if (draft.spots === base.spots && draft.cutoffHours === base.cutoffHours) continue;

          const hm = normalizeTourStartTimeHm(d.startTime) || (d.startTime || '').slice(0, 5);
          const scheduleCap = Math.max(0, Math.floor(d.maxSpotsPerSlot));
          const baselineCutoff = resolveOptionCutoffHours(listing, d.optionId);
          const nextSpots = Math.min(
            SLOT_OVERRIDE_CAPACITY_MAX,
            Math.max(1, Math.floor(Number(draft.spots) || 0))
          );
          const nextCutoff = Math.max(0, Math.min(168, Math.floor(Number(draft.cutoffHours) || 0)));
          const occupying = tourCheckoutOccupiedGuests(
            dayBookings,
            editing.iso,
            null,
            Date.now(),
            d.startTime || null
          );
          if (nextSpots < occupying) {
            setSaveNote(
              `Cannot set ${d.optionName || 'departure'} capacity below ${occupying} confirmed guest${
                occupying === 1 ? '' : 's'
              }.`
            );
            return;
          }

          overrides = overrides.filter((o) => !(o.date === editing.iso && o.startTimeHm === hm));
          const entry: ListingSlotOverride = { date: editing.iso, startTimeHm: hm };
          if (nextSpots !== scheduleCap) entry.capacity = nextSpots;
          if (nextCutoff !== baselineCutoff) entry.cutoffHours = nextCutoff;
          if (entry.capacity != null || entry.cutoffHours != null) {
            overrides = upsertSlotOverride(overrides, entry);
          }
          overridesChanged = true;
        }

        if (overridesChanged) {
          const res = await persistListingExtras({
            ...listing.listingExtras,
            slotOverrides: overrides,
          });
          if (!res.success) {
            setSaveNote(res.error ?? 'Could not save date overrides.');
            return;
          }
        }
      }

      setSaveNote('Availability updated.');
      if (monthFromIso && monthToIso && listingId) await loadCaps(listingId, monthFromIso, monthToIso);
      forceCloseDaySheet();
    } finally {
      setScheduleSaving(false);
      setSavingIso(null);
    }
  };

  const bulkDates = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bulkFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(bulkTo) || bulkFrom > bulkTo) {
      return [] as string[];
    }
    return enumerateIsoDates(bulkFrom, bulkTo, bulkWeekdays);
  }, [bulkFrom, bulkTo, bulkWeekdays]);

  const bulkOptionLabel = useMemo(() => {
    if (!bulkTargetOptionId || !listing) return '';
    const opt = materializedBookingOptions(listing.listingExtras?.bookingOptions).find(
      (o) => o.id === bulkTargetOptionId
    );
    return opt?.name?.trim() || 'Option';
  }, [listing, bulkTargetOptionId]);

  const syncBulkFieldsForOption = useCallback(
    (optionId: string, dates: string[]) => {
      if (!listing || !optionId) {
        setBulkCapacityMixed(false);
        setBulkCutoffMixed(false);
        return;
      }
      const caps = resolveOptionCapacitiesAcrossDates({ listing, optionId, dates });
      setBulkCapacityMixed(caps.mixed);
      if (caps.displayValue != null) setBulkCapacity(String(caps.displayValue));
      else if (caps.mixed) setBulkCapacity('');
      const cuts = resolveOptionCutoffsAcrossDates({ listing, optionId, dates });
      setBulkCutoffMixed(cuts.mixed);
      if (cuts.displayValue != null) setBulkCutoffHours(String(cuts.displayValue));
      else if (cuts.mixed) setBulkCutoffHours('');
    },
    [listing]
  );

  useEffect(() => {
    if (!bulkOpen || !listing || !bulkTargetOptionId) return;
    if (bulkAction !== 'change_capacity' && bulkAction !== 'change_cutoff') return;
    syncBulkFieldsForOption(bulkTargetOptionId, bulkDates);
  }, [bulkOpen, bulkDates, bulkTargetOptionId, bulkAction, listing, syncBulkFieldsForOption]);

  const applyBulk = async () => {
    if (!listingId || !canEditCalendar || !listing) return;
    if (bulkSaving) return;
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

    if (
      !stayCalendar &&
      (bulkAction === 'change_capacity' || bulkAction === 'change_cutoff') &&
      !bulkTargetOptionId.trim()
    ) {
      setBulkError('Select the option you want to change.');
      return;
    }

    if (bulkAction === 'change_capacity') {
      const capacity = Math.floor(Number(bulkCapacity));
      if (!Number.isFinite(capacity) || capacity < 1) {
        setBulkError('Enter a capacity between 1 and 99.');
        return;
      }
      if (capacity > SLOT_OVERRIDE_CAPACITY_MAX) {
        setBulkError(`Capacity cannot exceed ${SLOT_OVERRIDE_CAPACITY_MAX}.`);
        return;
      }
    }

    if (bulkAction === 'change_cutoff') {
      const cutoffHours = Math.floor(Number(bulkCutoffHours));
      if (!Number.isFinite(cutoffHours) || cutoffHours < 0 || cutoffHours > 168) {
        setBulkError('Select a valid booking cutoff.');
        return;
      }
    }

    if (!bulkConfirm && bulkAction === 'close') {
      setBulkConfirm(true);
      return;
    }

    setBulkSaving(true);
    setBulkError(null);
    try {
      if (bulkAction === 'close') {
        const res = await upsertAvailability(
          listingId,
          dates.map((available_date) => ({ available_date, capacity: 0 }))
        );
        if (!res.success) {
          setBulkError(userFacingError(res.error, 'Could not close those dates. Try again.'));
          return;
        }
        mergeCapRows(dates.map((available_date) => ({ available_date, capacity: 0 })));
      } else if (bulkAction === 'reopen') {
        // Reopen day closes only — do not clear capacity/cutoff overrides.
        const res = await deleteAvailabilityRange(listingId, dates);
        if (!res.success) {
          setBulkError(userFacingError(res.error, 'Could not reopen those dates. Try again.'));
          return;
        }
        removeCapRows(dates);
      } else if (bulkAction === 'change_capacity') {
        const capacity = Math.min(
          SLOT_OVERRIDE_CAPACITY_MAX,
          Math.max(1, Math.floor(Number(bulkCapacity) || 0))
        );
        if (stayCalendar) {
          const res = await upsertAvailability(
            listingId,
            dates.map((available_date) => ({ available_date, capacity }))
          );
          if (!res.success) {
            setBulkError(userFacingError(res.error, 'Could not update those nights. Try again.'));
            return;
          }
          mergeCapRows(dates.map((available_date) => ({ available_date, capacity })));
        } else {
          let overrides = [...(listing.listingExtras?.slotOverrides ?? [])];
          const opts = materializedBookingOptions(listing.listingExtras?.bookingOptions);
          let touched = 0;
          for (const iso of dates) {
            const deps = tourSellingDeparturesOnDate(opts, iso).filter(
              (d) => d.optionId === bulkTargetOptionId
            );
            for (const d of deps) {
              const hm = (d.startTime || '').trim().slice(0, 5);
              const occupying = tourCheckoutOccupiedGuests(
                bookings.filter((b) => b.listing_id === listingId),
                iso,
                null,
                Date.now(),
                d.startTime || null
              );
              if (capacity < occupying) {
                setBulkError(
                  `Cannot set capacity below ${occupying} booked guests on ${iso} (${d.optionName || 'departure'}).`
                );
                return;
              }
              overrides = upsertSlotOverride(overrides, {
                date: iso,
                startTimeHm: hm,
                capacity,
              });
              touched += 1;
            }
          }
          if (touched === 0) {
            setBulkError('No departures for that option in the selected dates.');
            return;
          }
          const res = await persistListingExtras({
            ...listing.listingExtras,
            slotOverrides: overrides,
          });
          if (!res.success) {
            setBulkError(res.error ?? 'Could not update capacity overrides.');
            return;
          }
        }
      } else if (bulkAction === 'change_cutoff') {
        const cutoffHours = Math.max(0, Math.min(168, Math.floor(Number(bulkCutoffHours) || 0)));
        let overrides = [...(listing.listingExtras?.slotOverrides ?? [])];
        const opts = materializedBookingOptions(listing.listingExtras?.bookingOptions);
        let touched = 0;
        for (const iso of dates) {
          const deps = tourSellingDeparturesOnDate(opts, iso).filter(
            (d) => d.optionId === bulkTargetOptionId
          );
          for (const d of deps) {
            const hm = (d.startTime || '').trim().slice(0, 5);
            overrides = upsertSlotOverride(overrides, {
              date: iso,
              startTimeHm: hm,
              cutoffHours,
            });
            touched += 1;
          }
        }
        if (touched === 0) {
          setBulkError('No departures for that option in the selected dates.');
          return;
        }
        const res = await persistListingExtras({
          ...listing.listingExtras,
          slotOverrides: overrides,
        });
        if (!res.success) {
          setBulkError(res.error ?? 'Could not update cutoff overrides.');
          return;
        }
      }

      const depCount =
        !stayCalendar && bulkTargetOptionId
          ? countDeparturesForOption({ listing, optionId: bulkTargetOptionId, dates })
          : dates.length;
      setSaveNote(
        bulkActionSummary({
          action: bulkAction,
          dateCount: dates.length,
          capacity: Math.floor(Number(bulkCapacity) || 0),
          cutoffHours: Math.floor(Number(bulkCutoffHours) || 0),
          stay: stayCalendar,
          optionName: bulkOptionLabel || undefined,
          departureCount: depCount,
        })
      );
      setBulkOpen(false);
      setBulkConfirm(false);
      setBulkDirty(false);
      setBulkFrom('');
      setBulkTo('');
      setBulkCapacity('16');
      setBulkCutoffHours('0');
      setBulkAction('close');
      setBulkWeekdays([...WEEKDAY_FILTER_DEFAULT]);
      setBulkTargetOptionId('');
      setBulkCapacityMixed(false);
      setBulkCutoffMixed(false);
      if (monthFromIso && monthToIso) await loadCaps(listingId, monthFromIso, monthToIso);
    } finally {
      setBulkSaving(false);
    }
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

  const seedDayDepartureEdits = useCallback((iso: string, targetListing: TourPackage | null) => {
    if (!targetListing) {
      setDepEdits({});
      setDepBaseline({});
      return;
    }
    const opts = materializedBookingOptions(targetListing.listingExtras?.bookingOptions);
    const deps = tourSellingDeparturesOnDate(opts, iso);
    const next: Record<string, { spots: string; cutoffHours: string }> = {};
    for (const d of deps) {
      const rowKey = `${d.optionId}-${d.scheduleId}-${d.startTime}`;
      const hm = (d.startTime || '').trim().slice(0, 5);
      const ov = findSlotOverride(targetListing.listingExtras?.slotOverrides, iso, hm);
      const capacity =
        ov?.capacity != null ? ov.capacity : Math.max(0, Math.floor(d.maxSpotsPerSlot));
      const baselineCutoff = resolveOptionCutoffHours(targetListing, d.optionId);
      const cutoff = ov?.cutoffHours != null ? ov.cutoffHours : baselineCutoff;
      next[rowKey] = { spots: String(capacity), cutoffHours: String(cutoff) };
    }
    setDepEdits(next);
    setDepBaseline(next);
  }, []);

  const openManageDate = useCallback(
    (iso: string, forListingId: string) => {
      if (forListingId && forListingId !== listingId) {
        setListingIdAndUrl(forListingId);
      }
      const targetListing =
        listings.find((l) => l.id === (forListingId || listingId)) ?? listing;
      const lid = forListingId || listingId;
      const cap = lid ? dayCapsMap.get(lid)?.get(iso) : undefined;
      const closed = typeof cap === 'number' && cap < 1;
      setDayClosedDraft(closed);
      setDayClosedBaseline(closed);
      seedDayDepartureEdits(iso, targetListing ?? null);
      setSaveNote(null);
      setDiscardOpen(false);
      setEditing({
        iso,
        capacity: closed ? '0' : String(cap ?? defaultSpots(targetListing ?? null) ?? ''),
      });
    },
    [listingId, listings, listing, dayCapsMap, setListingIdAndUrl, seedDayDepartureEdits]
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

  const activeFilterCount = [
    listingId,
    optionId,
    statusFilter !== 'all' ? statusFilter : '',
    view !== 'month' && filterFrom && filterTo ? 'range' : '',
  ].filter(Boolean).length;

  const resetWorkspaceFilters = () => {
    setListingIdAndUrl('');
    setOptionId('');
    setStatusFilter('all');
    if (view === 'week') {
      const w = weekRangeContaining(localTodayIso);
      setFilterFrom(w.from);
      setFilterTo(w.to);
      syncWorkspaceUrl({ listing: '', option: '', status: 'all', from: w.from, to: w.to });
    } else if (view === 'agenda') {
      const r = nextDaysRange(localTodayIso, 14);
      setFilterFrom(r.from);
      setFilterTo(r.to);
      syncWorkspaceUrl({ listing: '', option: '', status: 'all', from: r.from, to: r.to });
    } else {
      syncWorkspaceUrl({ listing: '', option: '', status: 'all' });
    }
  };

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} partner-avail-page min-h-[70vh]`}>
      <SupplierPageHero
        badge={null}
        sansTitle
        title="Departures & Availability"
        description="Manage your departures, bookings, and available capacity."
        actions={
          listings.length > 0 && listingId ? (
            <button
              type="button"
              disabled={!canEditCalendar}
              onClick={() => {
                if (!canEditCalendar) return;
                setBulkError(null);
                setBulkConfirm(false);
                setBulkDiscardOpen(false);
                setBulkDirty(false);
                setSaveNote(null);
                setBulkFrom(filterFrom || localTodayIso);
                setBulkTo(filterTo || addCalendarDays(localTodayIso, 6));
                setBulkCapacity('16');
                setBulkCutoffHours('0');
                setBulkAction('close');
                setBulkTargetOptionId('');
                setBulkCapacityMixed(false);
                setBulkCutoffMixed(false);
                setBulkWeekdays([...WEEKDAY_FILTER_DEFAULT]);
                setBulkOpen(true);
              }}
              className="tv-btn-primary inline-flex h-10 shrink-0 items-center gap-1.5 !px-3 text-[13px] disabled:opacity-40"
            >
              <Layers className="h-3.5 w-3.5" aria-hidden />
              Bulk edit
            </button>
          ) : undefined
        }
      />

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

          <div className="partner-avail-workspace">
          <div className="partner-avail-workspace__toolbar">
          <div className="partner-avail-workspace__toolbar-row">
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

            {view === 'week' ? (
              <div className="partner-avail-nav" aria-label="Week navigation">
                <button
                  type="button"
                  className="tv-btn-ghost h-9 !px-2"
                  aria-label="Previous week"
                  onClick={() => {
                    const base = filterFrom || weekRangeContaining(localTodayIso).from;
                    const w = shiftWeekRange(base, -1);
                    setFilterFrom(w.from);
                    setFilterTo(w.to);
                    syncWorkspaceUrl({ from: w.from, to: w.to });
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <p className="partner-avail-nav__label">
                  {formatWeekRangeLabel(
                    filterFrom || weekRangeContaining(localTodayIso).from,
                    filterTo || weekRangeContaining(localTodayIso).to
                  )}
                </p>
                <button
                  type="button"
                  className="tv-btn-ghost h-9 !px-2"
                  aria-label="Next week"
                  onClick={() => {
                    const base = filterFrom || weekRangeContaining(localTodayIso).from;
                    const w = shiftWeekRange(base, 1);
                    setFilterFrom(w.from);
                    setFilterTo(w.to);
                    syncWorkspaceUrl({ from: w.from, to: w.to });
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="tv-btn-ghost h-9 !px-2.5 text-[13px]"
                  onClick={() => {
                    const w = weekRangeContaining(localTodayIso);
                    setFilterFrom(w.from);
                    setFilterTo(w.to);
                    syncWorkspaceUrl({ from: w.from, to: w.to });
                  }}
                >
                  Today
                </button>
              </div>
            ) : view === 'month' ? (
              <div className="partner-avail-nav" aria-label="Month navigation">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="tv-btn-ghost h-9 !px-2"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <p className="partner-avail-nav__label">{monthLabel}</p>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="tv-btn-ghost h-9 !px-2"
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
                  className="tv-btn-ghost h-9 !px-2.5 text-[13px]"
                >
                  Today
                </button>
              </div>
            ) : (
              <div className="partner-avail-nav partner-avail-nav--agenda" aria-label="Agenda date range">
                <div className="tv-avail-filters__field">
                  <TraverionSingleDateField
                    id="avail-from"
                    label="From"
                    value={filterFrom}
                    minIso=""
                    onChange={(iso) => {
                      setFilterFrom(iso);
                      syncWorkspaceUrl({ from: iso });
                    }}
                  />
                </div>
                <div className="tv-avail-filters__field">
                  <TraverionSingleDateField
                    id="avail-to"
                    label="To"
                    value={filterTo}
                    minIso=""
                    onChange={(iso) => {
                      setFilterTo(iso);
                      syncWorkspaceUrl({ to: iso });
                    }}
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
                      syncWorkspaceUrl({ from: r.from, to: r.to });
                    }}
                  >
                    Next 7 days
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="tv-avail-filters">
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
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="tv-btn-ghost h-10 !px-3 text-[13px]"
                onClick={resetWorkspaceFilters}
              >
                Reset filters
              </button>
            ) : null}
          </div>
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
            <div className="partner-avail-workspace__body">
            <AvailabilityAgendaView
              rows={workspaceDepartures}
              selectedKeys={selectedKeys}
              canEdit={canEditCalendar}
              hideProductTitle={Boolean(listingId)}
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
            </div>
          ) : null}

          {view === 'week' && !stayCalendar ? (
            <div className="partner-avail-workspace__body">
            <AvailabilityWeekView
              weekFromIso={filterFrom || weekRangeContaining(localTodayIso).from}
              todayIso={localTodayIso}
              rows={workspaceDepartures}
              onOpenDate={(iso, lid) => {
                if (!lid && listingId) openManageDate(iso, listingId);
                else if (lid) openManageDate(iso, lid);
                else if (listings[0]) openManageDate(iso, listings[0].id);
              }}
              onShowMoreDay={(iso) => {
                if (listingId) openManageDate(iso, listingId);
                else {
                  const first = workspaceDepartures.find((r) => r.iso === iso);
                  if (first) openManageDate(iso, first.listingId);
                  else if (listings[0]) openManageDate(iso, listings[0].id);
                }
              }}
            />
            </div>
          ) : null}

          {stayCalendar && view !== 'month' ? (
            <NoticeCallout tone="info" className="mb-3">
              Stay listings use the Month view for night inventory. Switch to Month to manage blocks.
            </NoticeCallout>
          ) : null}

          {view === 'month' || stayCalendar ? (
          <div className={`tv-cal-shell partner-avail-workspace__body${stayCalendar ? '' : ' partner-avail-month'}`}>
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
                const closed = typeof cap?.capacity === 'number' && cap.capacity < 1;
                setDayClosedDraft(closed);
                setDayClosedBaseline(closed);
                seedDayDepartureEdits(cell.iso, listing);
                setDiscardOpen(false);
                setEditing({
                  iso: cell.iso,
                  capacity: closed ? '0' : String(cap?.capacity ?? defaultSpots(listing) ?? ''),
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
                      ) : monthCapacityLabel.departuresCount === 1 ? (
                        <span className="tv-cal-day__meta">1 departure</span>
                      ) : null}
                      {occupying && occupying.guests > 0 ? (
                        <span className="tv-cal-day__meta tv-cal-day__meta--cap">
                          {occupying.guests} guest{occupying.guests === 1 ? '' : 's'}
                        </span>
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
                  ) : cell.inMonth && !stayCalendar && viewingAll ? (
                    (() => {
                      const tourListings = listings.filter(
                        (l) => inventoryFamilyFromListing(l) !== 'stay'
                      );
                      let depCount = 0;
                      for (const l of tourListings.slice(0, 48)) {
                        const opts = materializedBookingOptions(l.listingExtras?.bookingOptions);
                        depCount += tourSellingDeparturesOnDate(opts, cell.iso).length;
                      }
                      const guestCount = occupying?.guests ?? 0;
                      if (depCount === 0 && guestCount === 0) {
                        return (
                          <span className="tv-cal-day__meta tv-cal-day__meta--muted">—</span>
                        );
                      }
                      return (
                        <>
                          {depCount > 0 ? (
                            <span className="tv-cal-day__meta">
                              {depCount} departure{depCount === 1 ? '' : 's'}
                            </span>
                          ) : null}
                          {guestCount > 0 ? (
                            <span className="tv-cal-day__meta tv-cal-day__meta--cap">
                              {guestCount} guest{guestCount === 1 ? '' : 's'}
                            </span>
                          ) : null}
                        </>
                      );
                    })()
                  ) : cell.inMonth && !stayCalendar && open && occupying?.guests ? (
                    <span className="tv-cal-day__meta tv-cal-day__meta--cap">
                      {occupying.guests} guest{occupying.guests === 1 ? '' : 's'}
                    </span>
                  ) : cell.inMonth && !stayCalendar ? (
                    <span className="tv-cal-day__meta tv-cal-day__meta--muted">
                      {cap && typeof cap.capacity === 'number' && cap.capacity < 1
                        ? 'Closed'
                        : open
                          ? 'No schedule'
                          : '—'}
                    </span>
                  ) : cell.inMonth && stayCalendar && open ? (
                    <span className="tv-cal-day__meta">
                      <span className="tv-cal-day__dot" aria-hidden />
                      Open
                    </span>
                  ) : cell.inMonth ? (
                    <span className="tv-cal-day__meta">—</span>
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
                        const closed = typeof cap?.capacity === 'number' && cap.capacity < 1;
                        setDayClosedDraft(closed);
                        setDayClosedBaseline(closed);
                        seedDayDepartureEdits(cell.iso, listing);
                        setDiscardOpen(false);
                        setEditing({
                          iso: cell.iso,
                          capacity: closed ? '0' : String(cap?.capacity ?? defaultSpots(listing) ?? ''),
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
                            ? `${Math.max(0, label.capacity - label.remaining)}/${label.capacity}`
                            : label.short ?? '—'}
                      </span>
                    </button>
                  );
                })}
            </div>
          ) : null}
          </div>
          ) : null}
          </div>

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
                                    onClick={() =>
                                      openSupplierBooking(b.id, {
                                        isStay:
                                          stayCalendar ||
                                          partnerAvailabilityTreatAsStay(
                                            listings.find((l) => l.id === b.listing_id),
                                            b
                                          ),
                                      })
                                    }
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
                                  onClick={() =>
                                    openSupplierBooking(b.id, {
                                      isStay:
                                        stayCalendar ||
                                        partnerAvailabilityTreatAsStay(
                                          listings.find((l) => l.id === b.listing_id),
                                          b
                                        ),
                                    })
                                  }
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
                          <div className="tv-avail-close-row">
                            <div>
                              <p className="tv-avail-close-row__label">
                                {stayCalendar ? 'Block night' : 'Close date'}
                              </p>
                              <p className="tv-avail-close-row__hint">
                                {dayClosedDraft
                                  ? stayCalendar
                                    ? 'Blocked for new stays'
                                    : 'Closed for new bookings'
                                  : stayCalendar
                                    ? 'Open for stays'
                                    : 'Open for bookings'}
                              </p>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={dayClosedDraft}
                              aria-label={stayCalendar ? 'Block night' : 'Close date'}
                              disabled={!canEditCalendar || savingIso === editing.iso}
                              onClick={() => {
                                setSaveNote(null);
                                setDayClosedDraft((v) => !v);
                              }}
                              className={`tv-switch ${dayClosedDraft ? 'is-on' : ''}`}
                            >
                              <span className="tv-switch__thumb" />
                            </button>
                          </div>
                        </section>
                      )}

                      {!stayCalendar && !viewingAll && listing ? (
                        <section className="tv-cal-drawer__section">
                          <h3>Departures</h3>
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
                                const optionLabel =
                                  d.optionName.trim() ||
                                  d.scheduleName.trim() ||
                                  'Departure';
                                const draft = depEdits[rowKey] ?? {
                                  spots: String(d.maxSpotsPerSlot),
                                  cutoffHours: String(resolveOptionCutoffHours(listing, d.optionId)),
                                };
                                const capN = Math.max(0, Math.floor(Number(draft.spots) || 0));
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
                                    <p className="tv-cal-dep-row__meta" title="Booked / Capacity">
                                      {occupying}/{capN}
                                      {dayClosedDraft ? ' · Closed' : occupying >= capN && capN > 0 ? ' · Sold out' : ''}
                                    </p>
                                    {canEditCalendar ? (
                                      <div className="tv-cal-dep-row__fields">
                                        <label className="tv-cal-dep-row__field">
                                          <span>Capacity</span>
                                          <input
                                            type="number"
                                            min={Math.max(1, occupying)}
                                            max={SLOT_OVERRIDE_CAPACITY_MAX}
                                            value={draft.spots}
                                            disabled={scheduleSaving || dayClosedDraft}
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
                                        <div className="tv-cal-dep-row__field tv-cal-dep-row__field--wide">
                                          <AvailabilityCutoffField
                                            id={`cutoff-${rowKey}`}
                                            value={draft.cutoffHours}
                                            disabled={scheduleSaving || dayClosedDraft}
                                            onChange={(hours) =>
                                              setDepEdits((prev) => ({
                                                ...prev,
                                                [rowKey]: {
                                                  ...draft,
                                                  cutoffHours: hours,
                                                },
                                              }))
                                            }
                                          />
                                        </div>
                                      </div>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="tv-cal-drawer__hint">
                              {weekdayOpen(editing.iso)
                                ? 'No ready departures for this date.'
                                : 'No schedule on this weekday.'}
                            </p>
                          )}
                        </section>
                      ) : null}

                    </div>

                    {saveNote ? (
                      <div key={saveNote} className="tv-avail-modal-error" role="alert">
                        {saveNote}
                      </div>
                    ) : null}

                    {!viewingAll ? (
                      <footer className="tv-cal-drawer__foot">
                        <button
                          type="button"
                          onClick={requestCloseDaySheet}
                          className="tv-btn-ghost !min-h-10 !px-3 text-[13px]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!canEditCalendar || savingIso === editing.iso || scheduleSaving}
                          onClick={() => void saveDayChanges()}
                          className="tv-btn-primary !min-h-10 !px-3 text-[13px] disabled:opacity-40"
                        >
                          {savingIso === editing.iso || scheduleSaving ? 'Saving…' : 'Save changes'}
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
                    {discardOpen ? (
                      <div className="tv-avail-discard">
                        <div
                          className="tv-avail-discard__panel"
                          role="alertdialog"
                          aria-labelledby="avail-discard-title"
                          aria-describedby="avail-discard-desc"
                        >
                          <p id="avail-discard-title" className="tv-avail-discard__title">
                            Discard unsaved changes?
                          </p>
                          <p id="avail-discard-desc" className="tv-avail-discard__body">
                            Your changes haven&apos;t been saved. Leaving now will discard them.
                          </p>
                          <div className="tv-avail-discard__actions">
                            <button
                              type="button"
                              className="tv-btn-ghost !min-h-10"
                              onClick={() => setDiscardOpen(false)}
                            >
                              Keep editing
                            </button>
                            <button
                              type="button"
                              className="tv-btn-primary !min-h-10"
                              onClick={() => forceCloseDaySheet()}
                            >
                              Discard changes
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </aside>
                </div>,
                document.body
              )
            : null}
        </div>
      )}

      {bulkOpen ? (
        <SupplierModalShell
          framed
          maxWidth="2xl"
            onClose={
            bulkSaving
              ? undefined
              : () => {
                  if (bulkDirty) {
                    setBulkDiscardOpen(true);
                    return;
                  }
                  setBulkError(null);
                  setBulkOpen(false);
                  setBulkConfirm(false);
                }
          }
        >
          <SupplierModalHeader
            icon={Layers}
            title="Bulk edit availability"
            subtitle={listing?.title}
            onClose={
              bulkSaving
                ? undefined
                : () => {
                    if (bulkDirty) {
                      setBulkDiscardOpen(true);
                      return;
                    }
                    setBulkError(null);
                    setBulkOpen(false);
                    setBulkConfirm(false);
                  }
            }
          />
          <div className="tv-avail-modal-body space-y-4 px-4 py-3 sm:px-5">
            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-ink">Select dates</h3>
              <div className="grid grid-cols-2 gap-3">
                <TraverionSingleDateField
                  id="bulk-from"
                  label="From"
                  value={bulkFrom}
                  minIso=""
                  onChange={(iso) => {
                    setBulkError(null);
                    setBulkConfirm(false);
                    setBulkDirty(true);
                    setBulkFrom(iso);
                  }}
                />
                <TraverionSingleDateField
                  id="bulk-to"
                  label="To"
                  value={bulkTo}
                  minIso=""
                  onChange={(iso) => {
                    setBulkError(null);
                    setBulkConfirm(false);
                    setBulkDirty(true);
                    setBulkTo(iso);
                  }}
                />
              </div>
              <p className="mb-1.5 mt-3 text-[12px] font-medium text-ink">Repeat on</p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={bulkWeekdays[i]}
                    onClick={() => {
                      setBulkConfirm(false);
                      setBulkDirty(true);
                      setBulkWeekdays((prev) => {
                        const next = [...prev];
                        next[i] = !next[i];
                        return next;
                      });
                    }}
                    className={`tv-avail-wd ${bulkWeekdays[i] ? 'is-on' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                <button
                  type="button"
                  className="lux-flat font-medium text-finland hover:underline"
                  onClick={() => {
                    setBulkDirty(true);
                    setBulkWeekdays([true, true, true, true, true, false, false]);
                  }}
                >
                  Weekdays
                </button>
                <button
                  type="button"
                  className="lux-flat font-medium text-finland hover:underline"
                  onClick={() => {
                    setBulkDirty(true);
                    setBulkWeekdays([false, false, false, false, false, true, true]);
                  }}
                >
                  Weekends
                </button>
                <button
                  type="button"
                  className="lux-flat font-medium text-finland hover:underline"
                  onClick={() => {
                    setBulkDirty(true);
                    setBulkWeekdays([...WEEKDAY_FILTER_DEFAULT]);
                  }}
                >
                  Every day
                </button>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-ink">What would you like to change?</h3>
              <PartnerSelect
                id="bulk-action"
                aria-label="Bulk action"
                value={bulkAction}
                onChange={(v) => {
                  setBulkError(null);
                  setBulkConfirm(false);
                  setBulkDirty(true);
                  const next = parseBulkAction(v);
                  setBulkAction(next);
                  if (
                    (next === 'change_capacity' || next === 'change_cutoff') &&
                    bulkTargetOptionId &&
                    listing
                  ) {
                    syncBulkFieldsForOption(bulkTargetOptionId, bulkDates);
                  }
                }}
                options={
                  stayCalendar
                    ? [
                        { value: 'close', label: 'Block nights' },
                        { value: 'reopen', label: 'Clear blocks' },
                        { value: 'change_capacity', label: 'Set night value' },
                      ]
                    : [
                        { value: 'close', label: 'Close bookings' },
                        { value: 'reopen', label: 'Open bookings' },
                        { value: 'change_capacity', label: 'Change capacity' },
                        { value: 'change_cutoff', label: 'Change booking cutoff' },
                      ]
                }
              />
              {!stayCalendar &&
              (bulkAction === 'change_capacity' || bulkAction === 'change_cutoff') ? (
                <div className="mt-3">
                  <label className="mb-1 block text-[12px] font-medium text-ink" htmlFor="bulk-option">
                    Option
                  </label>
                  <PartnerSelect
                    id="bulk-option"
                    aria-label="Option to change"
                    value={bulkTargetOptionId}
                    placeholder="Select an option…"
                    onChange={(id) => {
                      setBulkError(null);
                      setBulkDirty(true);
                      setBulkConfirm(false);
                      setBulkTargetOptionId(id);
                      syncBulkFieldsForOption(id, bulkDates);
                    }}
                    options={optionSelectOptions.filter((o) => o.value !== '')}
                  />
                </div>
              ) : null}
              {bulkAction === 'change_capacity' ? (
                <div className="mt-3">
                  <label className="mb-1 block text-[12px] font-medium text-ink" htmlFor="bulk-capacity">
                    Capacity
                  </label>
                  {bulkCapacityMixed ? (
                    <p className="mb-1.5 text-[12px] text-amber-800">Mixed values across selected dates</p>
                  ) : null}
                  <input
                    id="bulk-capacity"
                    type="number"
                    min={1}
                    max={SLOT_OVERRIDE_CAPACITY_MAX}
                    value={bulkCapacity}
                    placeholder={bulkCapacityMixed ? 'Enter capacity' : undefined}
                    onChange={(e) => {
                      setBulkDirty(true);
                      setBulkCapacityMixed(false);
                      const raw = e.target.value;
                      if (raw === '') {
                        setBulkCapacity('');
                        return;
                      }
                      const n = Math.floor(Number(raw));
                      if (!Number.isFinite(n)) return;
                      setBulkCapacity(String(Math.min(SLOT_OVERRIDE_CAPACITY_MAX, Math.max(0, n))));
                    }}
                    className="tv-input w-28 tabular-nums"
                  />
                </div>
              ) : null}
              {bulkAction === 'change_cutoff' && !stayCalendar ? (
                <div className="mt-3">
                  {bulkCutoffMixed ? (
                    <p className="mb-1.5 text-[12px] text-amber-800">Mixed values across selected dates</p>
                  ) : null}
                  <AvailabilityCutoffField
                    id="bulk-cutoff"
                    value={bulkCutoffHours}
                    onChange={(h) => {
                      setBulkDirty(true);
                      setBulkCutoffMixed(false);
                      setBulkCutoffHours(h);
                    }}
                  />
                </div>
              ) : null}
            </section>

            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-ink">Review</h3>
              {bulkDates.length > 0 ? (
                (() => {
                  const depCount =
                    !stayCalendar &&
                    bulkTargetOptionId &&
                    (bulkAction === 'change_capacity' || bulkAction === 'change_cutoff') &&
                    listing
                      ? countDeparturesForOption({
                          listing,
                          optionId: bulkTargetOptionId,
                          dates: bulkDates,
                        })
                      : bulkDates.length;
                  const title =
                    bulkAction === 'close'
                      ? stayCalendar
                        ? 'Block nights'
                        : 'Close bookings'
                      : bulkAction === 'reopen'
                        ? stayCalendar
                          ? 'Clear blocks'
                          : 'Open bookings'
                        : bulkAction === 'change_capacity'
                          ? 'Change capacity'
                          : 'Change booking cutoff';
                  return (
                    <div className="rounded-lg border border-[#e5e7eb] bg-[#fafafa] px-3 py-3 text-[13px] text-ink">
                      <p className="font-semibold text-ink">{title}</p>
                      <p className="mt-1.5 text-[12px] text-ink-muted truncate" title={listing?.title}>
                        Product: {listing?.title?.trim() || 'Listing'}
                      </p>
                      {bulkOptionLabel ? (
                        <p className="mt-0.5 text-[12px] text-ink-muted">Option: {bulkOptionLabel}</p>
                      ) : null}
                      <p className="mt-0.5 text-[12px] text-ink-muted">
                        Dates affected: {bulkDates.length}
                        {!stayCalendar &&
                        (bulkAction === 'change_capacity' || bulkAction === 'change_cutoff')
                          ? ` · Departures: ${depCount}`
                          : ''}
                      </p>
                      {bulkAction === 'change_capacity' ? (
                        <p className="mt-0.5 text-[12px] text-ink-muted">
                          {bulkCapacityMixed
                            ? 'Current capacity: Mixed values'
                            : null}
                          {bulkCapacityMixed ? ' · ' : ''}
                          New capacity: {bulkCapacity || '—'} guests
                        </p>
                      ) : null}
                      {bulkAction === 'change_cutoff' ? (
                        <p className="mt-0.5 text-[12px] text-ink-muted">
                          {bulkCutoffMixed ? 'Current cutoff: Mixed values · ' : ''}
                          New cutoff:{' '}
                          {bulkCutoffHours === ''
                            ? '—'
                            : bookingCutoffSelectLabel(Number(bulkCutoffHours) || 0)}
                        </p>
                      ) : null}
                      {bulkAction === 'close' ? (
                        <p className="mt-0.5 text-[12px] text-ink-muted">
                          Bookings will be closed for the selected scope.
                        </p>
                      ) : null}
                      {bulkAction === 'reopen' ? (
                        <p className="mt-0.5 text-[12px] text-ink-muted">
                          Day closes will be cleared. Capacity and cutoff overrides stay intact.
                        </p>
                      ) : null}
                      {bulkConfirm ? (
                        <NoticeCallout title="Confirm closing dates" tone="warn" className="mt-3">
                          Existing bookings stay intact. Click Apply again to confirm.
                        </NoticeCallout>
                      ) : null}
                    </div>
                  );
                })()
              ) : (
                <p className="text-[13px] text-ink-muted">Choose a valid date range.</p>
              )}
            </section>

          </div>
          {bulkError ? (
            <div key={bulkError} className="tv-avail-modal-error" role="alert">
              {bulkError}
            </div>
          ) : null}
          <div className="tv-avail-modal-foot">
            <button
              type="button"
              onClick={() => {
                if (bulkDirty) {
                  setBulkDiscardOpen(true);
                  return;
                }
                setBulkError(null);
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
          {bulkDiscardOpen ? (
            <div className="tv-avail-discard tv-avail-discard--modal">
              <div
                className="tv-avail-discard__panel"
                role="alertdialog"
                aria-labelledby="bulk-discard-title"
                aria-describedby="bulk-discard-desc"
              >
                <p id="bulk-discard-title" className="tv-avail-discard__title">
                  Discard unsaved changes?
                </p>
                <p id="bulk-discard-desc" className="tv-avail-discard__body">
                  Your changes haven&apos;t been saved. Leaving now will discard them.
                </p>
                <div className="tv-avail-discard__actions">
                  <button
                    type="button"
                    className="tv-btn-ghost !min-h-10"
                    onClick={() => setBulkDiscardOpen(false)}
                  >
                    Keep editing
                  </button>
                  <button
                    type="button"
                    className="tv-btn-primary !min-h-10"
                    onClick={() => {
                      setBulkDiscardOpen(false);
                      setBulkDirty(false);
                      setBulkError(null);
                      setBulkOpen(false);
                      setBulkConfirm(false);
                    }}
                  >
                    Discard changes
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </SupplierModalShell>
      ) : null}
    </div>
  );
}
