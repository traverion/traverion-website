import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import {
  deleteAvailability,
  fetchAvailabilityByListingId,
  upsertAvailability,
  type AvailabilityRow,
} from '../../data/supabase-availability';
import { inventoryFamilyFromListing } from '../../lib/inventory';
import type { TourPackage } from '../../types/tour';
import { listingHeroImageSrc } from '../../lib/listingPhotoGrid';
import { experienceTodayIsoForListing } from '../../lib/booking-quote';
import { parseListingExtras } from '../../types/listingExtras';
import { localYmd } from '../../lib/local-ymd';
import { buildMonthCells } from '../../lib/availability-ops';
import { addCalendarDays as addStayDays } from '../../lib/stayOccupancy';
import {
  buildStayCalendarAgenda,
  buildStayCalendarWeekSpans,
  eachIsoInRange,
  groupStayAgendaByDate,
  parseStayCalendarStatusFilter,
  parseStayCalendarView,
  stayCalendarCanBlockNight,
  stayCalendarCanUnblockNight,
  stayCalendarCapacityOnNight,
  stayCalendarNightKind,
  stayCalendarNightKindLabel,
  stayCalendarOccupyingOnNight,
  stayWeekSpanStyle,
  weekRangeContaining,
  type StayCalendarAgendaRow,
  type StayCalendarCap,
  type StayCalendarNightKind,
  type StayCalendarStatusFilter,
  type StayCalendarViewMode,
} from '../../lib/stay-calendar-workspace';
import {
  applyStayDateTap,
  formatStayRangeLabel,
  planStayRangeActions,
  stayDateRangeEdge,
  stayDateRangeFromDrag,
  type StayDateRange,
} from '../../lib/stay-calendar-selection';
import { openSupplierBooking, navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_CREATE_PATH } from '../../lib/partnerPortalPaths';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierEmptyState,
} from '../../components/supplier/supplierUi';
import { StayOpsSegmentedControl } from '../../components/supplier/StayOpsPrimitives';
import PartnerSelect from '../../components/supplier/PartnerSelect';
import ErrorState from '../../components/ErrorState';
import NoticeCallout from '../../components/NoticeCallout';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { travelerPublicBookingReference } from '../../lib/public-booking-reference';
import { formatStayNightHuman } from '../../lib/stay-calendar';
import { TraverionSingleDateField } from '../../components/calendar/TraverionSingleDateField';

const WEEK_PROP_PAGE = 24;

function listingTodayIso(listing: TourPackage | null | undefined): string {
  const extras = listing ? parseListingExtras(listing.listingExtras as unknown) : null;
  const tz = extras?.departureTimezone?.trim() || null;
  return experienceTodayIsoForListing(tz);
}

function formatDayHeading(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatMonthLabel(year: number, monthIndex0: number): string {
  return new Date(Date.UTC(year, monthIndex0, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function kindClass(kind: StayCalendarNightKind): string {
  return `tv-stay-cal-kind tv-stay-cal-kind--${kind}`;
}

export default function SupplierStayCalendar() {
  const { user, isSupabase } = useSupplierAuth();
  const { role, roleStatus } = useSupplierRole();
  const canEdit =
    (roleStatus === 'ready' || roleStatus === 'error') && canManageBookings(role);

  const [listings, setListings] = useState<TourPackage[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [caps, setCaps] = useState<StayCalendarCap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'error' | 'warn' } | null>(null);
  const [saving, setSaving] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, tone: 'ok' | 'error' | 'warn' = 'ok') => {
    if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
    setToast({ message, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  const [view, setView] = useState<StayCalendarViewMode>(() => {
    if (typeof window === 'undefined') return 'agenda';
    return parseStayCalendarView(new URLSearchParams(window.location.search).get('view'));
  });
  const [listingId, setListingId] = useState(() => {
    if (typeof window === 'undefined') return '';
    return (new URLSearchParams(window.location.search).get('listing') ?? '').trim();
  });
  const [statusFilter, setStatusFilter] = useState<StayCalendarStatusFilter>(() => {
    if (typeof window === 'undefined') return 'all';
    return parseStayCalendarStatusFilter(new URLSearchParams(window.location.search).get('status'));
  });
  const [filterFrom, setFilterFrom] = useState(() => {
    if (typeof window === 'undefined') return localYmd();
    const d = (new URLSearchParams(window.location.search).get('from') ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : localYmd();
  });
  const [filterTo, setFilterTo] = useState(() => {
    if (typeof window === 'undefined') return addStayDays(localYmd(), 13);
    const d = (new URLSearchParams(window.location.search).get('to') ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : addStayDays(localYmd(), 13);
  });

  const [monthCursor, setMonthCursor] = useState(() => {
    const t = localYmd();
    const [y, m] = t.split('-').map(Number);
    return { year: y, monthIndex0: m - 1 };
  });
  const [weekPropPage, setWeekPropPage] = useState(0);
  const [rangeSelect, setRangeSelect] = useState<StayDateRange | null>(null);

  const loadGenRef = useRef(0);
  const userIdRef = useRef<string | null>(null);

  const selectedListing = useMemo(
    () => listings.find((l) => l.id === listingId) ?? null,
    [listings, listingId]
  );
  const todayIso = useMemo(() => listingTodayIso(selectedListing), [selectedListing]);

  const syncUrl = useCallback(
    (patch: {
      view?: StayCalendarViewMode;
      listing?: string;
      status?: StayCalendarStatusFilter;
      from?: string;
      to?: string;
    }) => {
      const url = new URL(window.location.href);
      const nextView = patch.view ?? view;
      if (nextView === 'agenda') url.searchParams.delete('view');
      else url.searchParams.set('view', nextView);
      const nextListing = patch.listing !== undefined ? patch.listing : listingId;
      if (nextListing) url.searchParams.set('listing', nextListing);
      else url.searchParams.delete('listing');
      const nextStatus = patch.status ?? statusFilter;
      if (nextStatus === 'all') url.searchParams.delete('status');
      else url.searchParams.set('status', nextStatus);
      if (nextView === 'month') {
        url.searchParams.delete('from');
        url.searchParams.delete('to');
      } else {
        const from = patch.from ?? filterFrom;
        const to = patch.to ?? filterTo;
        if (from) url.searchParams.set('from', from);
        if (to) url.searchParams.set('to', to);
      }
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    },
    [view, listingId, statusFilter, filterFrom, filterTo]
  );

  const load = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setLoading(false);
      return;
    }
    const gen = ++loadGenRef.current;
      setLoading(true);
      setError(null);
      try {
      const [mine, allBookings] = await Promise.all([
        fetchMyListings(uid),
        fetchBookingsForSupplier(uid),
      ]);
      if (gen !== loadGenRef.current) return;
      const stays = mine.filter((l) => inventoryFamilyFromListing(l) === 'stay');
      setListings(stays);
      setBookings(allBookings);
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      setError(userFacingError(e, USER_ERROR.calendar));
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [isSupabase, user?.id]);

  useLayoutEffect(() => {
    if (!user?.id) {
      userIdRef.current = null;
      loadGenRef.current += 1;
      setListings([]);
      setBookings([]);
      setCaps([]);
      setLoading(false);
      return;
    }
    if (userIdRef.current !== user.id) {
      userIdRef.current = user.id;
      loadGenRef.current += 1;
      setListings([]);
      setBookings([]);
      setCaps([]);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-select the only Stay so Month view is immediately useful.
  useEffect(() => {
    if (listings.length !== 1 || listingId) return;
    const id = listings[0]!.id;
    setListingId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('listing', id);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, [listings, listingId]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Load availability caps for visible window / selected properties.
  useEffect(() => {
    if (!listings.length) {
      setCaps([]);
      return;
    }
    let cancelled = false;
    const ids = listingId ? [listingId] : listings.map((l) => l.id);
    const from =
      view === 'month'
        ? `${monthCursor.year}-${String(monthCursor.monthIndex0 + 1).padStart(2, '0')}-01`
        : filterFrom;
    const to =
      view === 'month'
        ? addStayDays(
            `${monthCursor.year}-${String(monthCursor.monthIndex0 + 1).padStart(2, '0')}-01`,
            40
          )
        : filterTo;
    // Cap multi-property fetches to avoid unbounded work.
    const fetchIds = ids.slice(0, listingId ? 1 : 40);
    void Promise.all(
      fetchIds.map((id) => fetchAvailabilityByListingId(id, { fromDate: from, toDate: to }))
    ).then((batches) => {
      if (cancelled) return;
      const next: StayCalendarCap[] = [];
      batches.forEach((rows, i) => {
        const id = fetchIds[i]!;
        for (const r of rows as AvailabilityRow[]) {
          next.push({
            listing_id: id,
            available_date: r.available_date,
            capacity: r.capacity,
          });
        }
      });
      setCaps(next);
    });
    return () => {
      cancelled = true;
    };
  }, [listings, listingId, view, filterFrom, filterTo, monthCursor]);

  const listingOptions = useMemo(
    () => [
      { value: '', label: 'All stays' },
      ...listings.map((l) => ({ value: l.id, label: l.title })),
    ],
    [listings]
  );

  const listingMeta = useMemo(
    () =>
      listings.map((l) => ({
        id: l.id,
        title: l.title,
        image: listingHeroImageSrc(l.image) ?? l.image ?? null,
      })),
    [listings]
  );

  const agendaRows = useMemo(
    () =>
      buildStayCalendarAgenda({
        fromIso: filterFrom,
        toIso: filterTo,
        bookings,
        caps,
        listings: listingMeta,
        listingIdFilter: listingId || null,
        statusFilter,
      }),
    [filterFrom, filterTo, bookings, caps, listingMeta, listingId, statusFilter]
  );
  const agendaGroups = useMemo(() => groupStayAgendaByDate(agendaRows), [agendaRows]);

  const weekFrom = useMemo(() => weekRangeContaining(filterFrom).from, [filterFrom]);
  const weekDays = useMemo(() => eachIsoInRange(weekFrom, addStayDays(weekFrom, 6)), [weekFrom]);

  const weekListings = useMemo(() => {
    const filtered = listingId ? listings.filter((l) => l.id === listingId) : listings;
    return filtered;
  }, [listings, listingId]);

  const weekPageListings = useMemo(() => {
    const start = weekPropPage * WEEK_PROP_PAGE;
    return weekListings.slice(start, start + WEEK_PROP_PAGE);
  }, [weekListings, weekPropPage]);

  const monthCells = useMemo(
    () => buildMonthCells(monthCursor.year, monthCursor.monthIndex0),
    [monthCursor]
  );

  const openReservation = useCallback((bookingId: string) => {
    openSupplierBooking(bookingId, { isStay: true });
  }, []);

  const refreshCapsForListing = useCallback(async (id: string, from: string, to: string) => {
    const rows = await fetchAvailabilityByListingId(id, { fromDate: from, toDate: to });
    setCaps((prev) => [
      ...prev.filter((c) => c.listing_id !== id || c.available_date < from || c.available_date > to),
      ...rows.map((r) => ({
        listing_id: id,
        available_date: r.available_date,
        capacity: r.capacity,
      })),
    ]);
  }, []);

  const blockDates = useCallback(
    async (id: string, dates: string[]) => {
      if (!canEdit || !id || dates.length === 0) return;
      setSaving(true);
      const allowed = dates.filter((iso) =>
        stayCalendarCanBlockNight({ bookings, listingId: id, iso })
      );
      const skipped = dates.length - allowed.length;
      if (allowed.length === 0) {
        showToast(
          skipped
            ? 'Those nights are occupied and cannot be blocked.'
            : 'Nothing to block.',
          'warn'
        );
        setSaving(false);
        return;
      }
      const res = await upsertAvailability(
        id,
        allowed.map((available_date) => ({ available_date, capacity: 0 }))
      );
      if (!res.success) {
        showToast(res.error || 'Could not block nights.', 'error');
        setSaving(false);
        return;
      }
      setCaps((prev) => {
        const drop = new Set(allowed.map((d) => `${id}:${d}`));
        const kept = prev.filter((c) => !drop.has(`${c.listing_id}:${c.available_date}`));
        return [
          ...kept,
          ...allowed.map((available_date) => ({
            listing_id: id,
            available_date,
            capacity: 0,
          })),
        ];
      });
      showToast(
        skipped
          ? `Blocked ${allowed.length} · skipped ${skipped} occupied`
          : `Blocked ${allowed.length} night${allowed.length === 1 ? '' : 's'}`
      );
      setRangeSelect(null);
      setSaving(false);
    },
    [bookings, canEdit, showToast]
  );

  const unblockDates = useCallback(
    async (id: string, dates: string[]) => {
      if (!canEdit || !id || dates.length === 0) return;
      setSaving(true);
      const allowed = dates.filter((iso) =>
        stayCalendarCanUnblockNight({ bookings, caps, listingId: id, iso })
      );
      if (allowed.length === 0) {
        showToast('No removable blocks on those nights.', 'warn');
        setSaving(false);
        return;
      }
      for (const iso of allowed) {
        const res = await deleteAvailability(id, iso);
        if (!res.success) {
          showToast(res.error || 'Could not unblock night.', 'error');
          setSaving(false);
          await refreshCapsForListing(id, allowed[0]!, allowed[allowed.length - 1]!);
          return;
        }
      }
      setCaps((prev) =>
        prev.filter((c) => !(c.listing_id === id && allowed.includes(c.available_date)))
      );
      showToast(`Unblocked ${allowed.length} night${allowed.length === 1 ? '' : 's'}`);
      setRangeSelect(null);
      setSaving(false);
    },
    [bookings, caps, canEdit, refreshCapsForListing, showToast]
  );

  const onNightClick = useCallback(
    (id: string, iso: string, kind: StayCalendarNightKind, occupyingIds: string[]) => {
      if (kind === 'booked' || kind === 'pending') {
        if (occupyingIds[0]) openReservation(occupyingIds[0]);
        return;
      }
      if (!canEdit) return;
      if (!listingId) {
        setListingId(id);
        syncUrl({ listing: id });
      }
      setRangeSelect((prev) => applyStayDateTap(prev, iso));
    },
    [canEdit, listingId, openReservation, syncUrl]
  );

  const onCommitRange = useCallback(
    (id: string, range: StayDateRange) => {
      if (!canEdit) return;
      if (!listingId) {
        setListingId(id);
        syncUrl({ listing: id });
      }
      setRangeSelect(range);
    },
    [canEdit, listingId, syncUrl]
  );

  const rangePlan = useMemo(() => {
    if (!rangeSelect || !listingId) return null;
    return planStayRangeActions({
      range: rangeSelect,
      canBlock: (iso) => stayCalendarCanBlockNight({ bookings, listingId, iso }),
      canUnblock: (iso) =>
        stayCalendarCanUnblockNight({ bookings, caps, listingId, iso }),
    });
  }, [rangeSelect, listingId, bookings, caps]);

  const applyRangeBlock = useCallback(
    async (mode: 'block' | 'unblock') => {
      if (!rangeSelect || !listingId || !rangePlan) {
        showToast('Select a property, then choose nights.', 'warn');
        return;
      }
      if (mode === 'block') {
        if (rangePlan.blockable.length === 0) {
          showToast(rangePlan.note || 'No nights can be blocked.', 'warn');
          return;
        }
        await blockDates(listingId, rangePlan.blockable);
      } else {
        if (rangePlan.unblockable.length === 0) {
          showToast(rangePlan.note || 'No nights can be unblocked.', 'warn');
          return;
        }
        await unblockDates(listingId, rangePlan.unblockable);
      }
    },
    [listingId, rangeSelect, rangePlan, blockDates, unblockDates, showToast]
  );

  if (!isSupabase || !user) {
    return (
      <div className={SUPPLIER_PAGE_CLASS}>
        <p className="text-sm text-ink-muted">Sign in to manage the Stay Calendar.</p>
      </div>
    );
  }

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} tv-stay-cal-page min-h-[70vh]`}>
      {toast ? (
        <div
          className={`tv-stay-cal-toast${toast.tone === 'error' ? ' tv-stay-cal-toast--error' : toast.tone === 'warn' ? ' tv-stay-cal-toast--warn' : ''}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      ) : null}
      <header className="tv-avail-page-head stay-ops-cal-head">
        <div className="tv-avail-page-head__text">
          <h1>Stay Calendar</h1>
          <p>Occupancy, arrivals and availability across your properties.</p>
        </div>
      </header>

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading Stay Calendar">
          <div className="h-10 animate-pulse rounded-lg bg-black/[0.05]" />
          <div className="h-40 animate-pulse rounded-xl bg-black/[0.04]" />
        </div>
      ) : error ? (
        <ErrorState
          className="py-6"
          title="Stay Calendar unavailable"
          body={error}
          retry={{ onClick: () => void load() }}
        />
      ) : listings.length === 0 ? (
        <SupplierEmptyState
          icon={CalendarDays}
          title="No stay listings yet"
          body="Publish a Stay listing to manage nights, blocks and reservations here."
          action={
            <button type="button" className="tv-btn-primary" onClick={() => navigateSupplierUrl(PARTNER_CREATE_PATH)}>
              Create Stay listing
            </button>
          }
        />
      ) : (
        <>
          {!canEdit ? (
            <NoticeCallout tone="info" className="mb-3">
              Your role can view this calendar but cannot change blocks. Ask an owner, manager, or ops teammate.
            </NoticeCallout>
          ) : null}

          {canEdit && rangeSelect && listingId && rangePlan ? (
            <div className="tv-stay-cal-rangebar" role="region" aria-label="Selected nights">
              <p className="tv-stay-cal-rangebar__meta">
                <strong>{formatStayRangeLabel(rangeSelect)}</strong>
                {rangePlan.note ? (
                  <span className="tv-stay-cal-rangebar__note">{rangePlan.note}</span>
                ) : null}
              </p>
              {rangePlan.blockable.length > 0 ? (
                <button
                  type="button"
                  disabled={saving}
                  className="tv-btn-primary inline-flex h-8 items-center gap-1.5 !px-2.5 text-[12.5px] disabled:opacity-40"
                  onClick={() => void applyRangeBlock('block')}
                >
                  <Layers className="h-3.5 w-3.5" aria-hidden />
                  {saving ? 'Saving…' : 'Block dates'}
                </button>
              ) : null}
              {rangePlan.unblockable.length > 0 ? (
                <button
                  type="button"
                  disabled={saving}
                  className="tv-btn-secondary inline-flex h-8 items-center gap-1.5 !px-2.5 text-[12.5px] disabled:opacity-40"
                  onClick={() => void applyRangeBlock('unblock')}
                >
                  {saving ? 'Saving…' : 'Unblock dates'}
                </button>
              ) : null}
              <button
                type="button"
                className="tv-btn-ghost h-8 px-2 text-[12.5px]"
                onClick={() => setRangeSelect(null)}
              >
                Clear selection
              </button>
            </div>
          ) : null}

          <div className="stay-ops-cal-chrome">
            <div className="stay-ops-cal-chrome__primary">
              <StayOpsSegmentedControl
                label="Stay Calendar views"
                value={view}
                options={[
                  { id: 'agenda', label: 'Agenda' },
                  { id: 'week', label: 'Week' },
                  { id: 'month', label: 'Month' },
                ]}
                onChange={(next) => {
                  const tab = next as StayCalendarViewMode;
                  setView(tab);
                  if (tab === 'week') {
                    const w = weekRangeContaining(filterFrom || todayIso);
                    setFilterFrom(w.from);
                    setFilterTo(w.to);
                    syncUrl({ view: tab, from: w.from, to: w.to });
                  } else {
                    syncUrl({ view: tab });
                  }
                }}
              />
              <div className="stay-ops-cal-chrome__nav" role="group" aria-label="Calendar navigation">
                <button
                  type="button"
                  className="stay-ops-cal-nav-btn lux-flat"
                  aria-label={
                    view === 'month' ? 'Previous month' : view === 'week' ? 'Previous week' : 'Previous period'
                  }
                  onClick={() => {
                    if (view === 'month') {
                      setMonthCursor((c) => {
                        const m = c.monthIndex0 - 1;
                        return m < 0
                          ? { year: c.year - 1, monthIndex0: 11 }
                          : { year: c.year, monthIndex0: m };
                      });
                      return;
                    }
                    if (view === 'week') {
                      const from = addStayDays(weekFrom, -7);
                      const to = addStayDays(from, 6);
                      setFilterFrom(from);
                      setFilterTo(to);
                      syncUrl({ from, to });
                      return;
                    }
                    const span = Math.max(1, eachIsoInRange(filterFrom, filterTo).length);
                    const from = addStayDays(filterFrom, -span);
                    const to = addStayDays(filterTo, -span);
                    setFilterFrom(from);
                    setFilterTo(to);
                    syncUrl({ from, to });
                  }}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className="stay-ops-cal-nav-btn stay-ops-cal-nav-btn--today lux-flat"
                  onClick={() => {
                    if (view === 'month') {
                      const [y, m] = todayIso.split('-').map(Number);
                      setMonthCursor({ year: y, monthIndex0: m - 1 });
                      return;
                    }
                    if (view === 'week') {
                      const w = weekRangeContaining(todayIso);
                      setFilterFrom(w.from);
                      setFilterTo(w.to);
                      syncUrl({ from: w.from, to: w.to });
                      return;
                    }
                    const from = todayIso;
                    const to = addStayDays(todayIso, 13);
                    setFilterFrom(from);
                    setFilterTo(to);
                    syncUrl({ from, to });
                  }}
                >
                  Today
                </button>
                <button
                  type="button"
                  className="stay-ops-cal-nav-btn lux-flat"
                  aria-label={
                    view === 'month' ? 'Next month' : view === 'week' ? 'Next week' : 'Next period'
                  }
                  onClick={() => {
                    if (view === 'month') {
                      setMonthCursor((c) => {
                        const m = c.monthIndex0 + 1;
                        return m > 11
                          ? { year: c.year + 1, monthIndex0: 0 }
                          : { year: c.year, monthIndex0: m };
                      });
                      return;
                    }
                    if (view === 'week') {
                      const from = addStayDays(weekFrom, 7);
                      const to = addStayDays(from, 6);
                      setFilterFrom(from);
                      setFilterTo(to);
                      syncUrl({ from, to });
                      return;
                    }
                    const span = Math.max(1, eachIsoInRange(filterFrom, filterTo).length);
                    const from = addStayDays(filterFrom, span);
                    const to = addStayDays(filterTo, span);
                    setFilterFrom(from);
                    setFilterTo(to);
                    syncUrl({ from, to });
                  }}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
                <p className="stay-ops-cal-chrome__range">
                  {view === 'month'
                    ? formatMonthLabel(monthCursor.year, monthCursor.monthIndex0)
                    : view === 'week'
                      ? `${formatStayNightHuman(weekFrom)} – ${formatStayNightHuman(addStayDays(weekFrom, 6))}`
                      : `${formatStayNightHuman(filterFrom)} – ${formatStayNightHuman(filterTo)}`}
                </p>
              </div>
            </div>
            <div className="stay-ops-cal-chrome__filters">
              {view === 'agenda' ? (
                <>
                  <div className="stay-ops-cal-field">
                    <TraverionSingleDateField
                      id="stay-cal-from"
                      label="From"
                      value={filterFrom}
                      minIso=""
                      onChange={(iso) => {
                        setFilterFrom(iso);
                        syncUrl({ from: iso });
                      }}
                    />
                  </div>
                  <div className="stay-ops-cal-field">
                    <TraverionSingleDateField
                      id="stay-cal-to"
                      label="To"
                      value={filterTo}
                      minIso=""
                      onChange={(iso) => {
                        setFilterTo(iso);
                        syncUrl({ to: iso });
                      }}
                    />
                  </div>
                  <div className="stay-ops-cal-field">
                    <label htmlFor="stay-cal-status">Status</label>
                    <PartnerSelect
                      id="stay-cal-status"
                      aria-label="Status"
                      value={statusFilter}
                      onChange={(v) => {
                        const next = parseStayCalendarStatusFilter(v);
                        setStatusFilter(next);
                        syncUrl({ status: next });
                      }}
                      options={[
                        { value: 'all', label: 'All' },
                        { value: 'booked', label: 'Booked' },
                        { value: 'pending', label: 'Pending approval' },
                        { value: 'blocked', label: 'Blocked' },
                      ]}
                    />
                  </div>
                </>
              ) : null}
              <div className="stay-ops-cal-field stay-ops-cal-field--grow">
                <label htmlFor="stay-cal-listing">Property</label>
                <PartnerSelect
                  id="stay-cal-listing"
                  aria-label="Property"
                  value={listingId}
                  onChange={(id) => {
                    setListingId(id);
                    setWeekPropPage(0);
                    setRangeSelect(null);
                    syncUrl({ listing: id });
                  }}
                  options={listingOptions}
                />
              </div>
            </div>
          </div>

          {view === 'agenda' ? (
            <StayAgenda
              groups={agendaGroups}
              onOpenReservation={openReservation}
              onOpenBlocked={(listing, iso) => {
                setListingId(listing);
                setRangeSelect({ start: iso, end: iso });
                syncUrl({ listing });
              }}
            />
          ) : null}

          {view === 'week' ? (
            <StayWeek
              weekDays={weekDays}
              weekFrom={weekFrom}
              listings={weekPageListings}
              totalListings={weekListings.length}
              page={weekPropPage}
              pageSize={WEEK_PROP_PAGE}
              onPage={setWeekPropPage}
              bookings={bookings}
              caps={caps}
              rangeSelect={rangeSelect}
              onNightClick={onNightClick}
              onOpenReservation={openReservation}
            />
          ) : null}

          {view === 'month' ? (
            <StayMonth
              cells={monthCells}
              todayIso={todayIso}
              listingId={listingId}
              listings={listings}
              bookings={bookings}
              caps={caps}
              rangeSelect={rangeSelect}
              canEdit={canEdit}
              onRequireListing={() => showToast('Select a property for Month view.', 'warn')}
              onNightClick={onNightClick}
              onCommitRange={onCommitRange}
              onPickListing={(id) => {
                setListingId(id);
                syncUrl({ listing: id });
              }}
            />
          ) : null}

        </>
      )}
    </div>
  );
}

function StayAgenda({
  groups,
  onOpenReservation,
  onOpenBlocked,
}: {
  groups: Array<{ iso: string; rows: StayCalendarAgendaRow[] }>;
  onOpenReservation: (id: string) => void;
  onOpenBlocked: (listingId: string, iso: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="stay-ops-cal-empty">
        <p className="stay-ops-cal-empty__title">No arrivals, departures or blocks</p>
        <p className="stay-ops-cal-empty__body">
          Adjust the date range, or open Week / Month to manage availability.
        </p>
      </div>
    );
  }
  return (
    <div className="stay-ops-agenda">
      {groups.map((g) => (
        <section key={g.iso} className="stay-ops-agenda__day">
          <header className="stay-ops-agenda__day-head">
            <h2 className="stay-ops-agenda__day-title">{formatDayHeading(g.iso)}</h2>
            <span className="stay-ops-agenda__count">{g.rows.length}</span>
          </header>
          <ul className="stay-ops-agenda__list">
            {g.rows.map((r) => {
              const kindChip =
                r.kind === 'blocked' ? 'Blocked' : r.kind === 'check_in' ? 'Arrival' : 'Departure';
              const guestLine = r.kind === 'blocked' ? 'Manual block' : r.guestName || 'Guest';
              return (
                <li
                  key={r.key}
                  className={`stay-ops-agenda__row stay-ops-agenda__row--${r.kind}`}
                >
                  <button
                    type="button"
                    className="stay-ops-agenda__hit lux-flat"
                    onClick={() => {
                      if (r.bookingId) onOpenReservation(r.bookingId);
                      else onOpenBlocked(r.listingId, r.iso);
                    }}
                  >
                    <span className={`stay-ops-agenda-chip stay-ops-agenda-chip--${r.kind}`} aria-hidden>
                      {r.kind === 'check_in' ? 'In' : r.kind === 'check_out' ? 'Out' : 'Bl'}
                    </span>
                    <span className="stay-ops-agenda__main">
                      <span className="stay-ops-agenda__guest">{guestLine}</span>
                      <span className="stay-ops-agenda__sub">
                        {kindChip} · {r.listingTitle}
                        {r.guests > 0 ? ` · ${r.guests}` : ''}
                      </span>
                    </span>
                    <span className="stay-ops-agenda__side">
                      {r.timeLabel ? <span className="stay-ops-agenda__time">{r.timeLabel}</span> : null}
                      {r.reference ? (
                        <span className="stay-ops-agenda-ref">
                          {travelerPublicBookingReference(r.reference) ?? r.reference}
                        </span>
                      ) : null}
                      {r.nightKind && r.kind !== 'blocked' ? (
                        <span className={`stay-ops-agenda__pill ${kindClass(r.nightKind)}`}>
                          {stayCalendarNightKindLabel(r.nightKind)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function StayWeek({
  weekDays,
  weekFrom,
  listings,
  totalListings,
  page,
  pageSize,
  onPage,
  bookings,
  caps,
  rangeSelect,
  onNightClick,
  onOpenReservation,
}: {
  weekDays: string[];
  weekFrom: string;
  listings: TourPackage[];
  totalListings: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  bookings: BookingRow[];
  caps: StayCalendarCap[];
  rangeSelect: { start: string; end: string } | null;
  onNightClick: (listingId: string, iso: string, kind: StayCalendarNightKind, occupyingIds: string[]) => void;
  onOpenReservation: (id: string) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(totalListings / pageSize));
  if (listings.length === 0) {
    return (
      <div className="stay-ops-cal-empty">
        <p className="stay-ops-cal-empty__title">No properties to show</p>
      </div>
    );
  }
  return (
    <div className="stay-ops-week">
      <div className="stay-ops-week__scroll">
        <div className="stay-ops-week__board">
          <div className="stay-ops-week__head" role="row">
            <div className="stay-ops-week__prop-h">Property</div>
            <div className="stay-ops-week__days-h">
              {weekDays.map((iso) => (
                <div key={iso} className="stay-ops-week__day-h">
                  <span className="stay-ops-week__dow">
                    {new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })}
                  </span>
                  <span className="stay-ops-week__dom">{iso.slice(8)}</span>
                </div>
              ))}
            </div>
          </div>
          {listings.map((listing) => {
            const spans = buildStayCalendarWeekSpans({
              weekFromIso: weekFrom,
              listingId: listing.id,
              bookings,
            });
            const laneCount = spans[0]?.laneCount ?? 1;
            const rowH = Math.max(3.15, 1.35 + laneCount * 1.55);
            return (
              <div key={listing.id} className="stay-ops-week__row" role="row">
                <div className="stay-ops-week__prop" title={listing.title}>
                  {listing.title}
                </div>
                <div className="stay-ops-week__track" style={{ minHeight: `${rowH}rem` }}>
                  <div className="stay-ops-week__cells">
                    {weekDays.map((iso) => {
                      const occupying = stayCalendarOccupyingOnNight(bookings, listing.id, iso);
                      const cap = stayCalendarCapacityOnNight(caps, listing.id, iso);
                      const kind = stayCalendarNightKind({ occupying, capacity: cap });
                      const edge = stayDateRangeEdge(iso, rangeSelect);
                      return (
                        <button
                          key={iso}
                          type="button"
                          className={`stay-ops-week__cell ${kindClass(kind)}${
                            edge ? ` is-in-range is-range-${edge}` : ''
                          }`}
                          onClick={() =>
                            onNightClick(
                              listing.id,
                              iso,
                              kind,
                              occupying.map((b) => b.id)
                            )
                          }
                          aria-label={`${listing.title} ${iso} ${stayCalendarNightKindLabel(kind)}`}
                        />
                      );
                    })}
                  </div>
                  <div className="stay-ops-week__spans" aria-hidden={spans.length === 0}>
                    {spans.map((span) => {
                      const geo = stayWeekSpanStyle(span);
                      return (
                        <button
                          key={span.bookingId}
                          type="button"
                          className={`stay-ops-week__span${span.pending ? ' is-pending' : ' is-booked'}${
                            span.startsAtCheckIn ? ' is-arrival' : ''
                          }${span.endsAtCheckout ? ' is-departure' : ''}`}
                          style={{ left: geo.left, width: geo.width, top: geo.top }}
                          onClick={() => onOpenReservation(span.bookingId)}
                          title={`${span.guestName}${span.pending ? ' · Pending' : ''} · ${span.startIso} → ${span.endIso}`}
                          aria-label={`${span.guestName}, ${span.colSpan} night${span.colSpan === 1 ? '' : 's'}${span.pending ? ', pending' : ''}`}
                        >
                          <span className="stay-ops-week__span-label truncate">{span.guestName}</span>
                          {span.colSpan > 1 ? (
                            <span className="stay-ops-week__span-nights" aria-hidden>
                              {span.colSpan}n
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {pageCount > 1 ? (
        <div className="stay-ops-week__pager">
          <span>
            Properties {page * pageSize + 1}–{Math.min(totalListings, (page + 1) * pageSize)} of{' '}
            {totalListings}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="tv-btn-ghost h-8 px-2"
              disabled={page <= 0}
              onClick={() => onPage(page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="tv-btn-ghost h-8 px-2"
              disabled={page >= pageCount - 1}
              onClick={() => onPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StayMonth({
  cells,
  todayIso,
  listingId,
  listings,
  bookings,
  caps,
  rangeSelect,
  canEdit,
  onNightClick,
  onCommitRange,
  onRequireListing,
  onPickListing,
}: {
  cells: Array<{ iso: string; inMonth: boolean }>;
  todayIso: string;
  listingId: string;
  listings: TourPackage[];
  bookings: BookingRow[];
  caps: StayCalendarCap[];
  rangeSelect: StayDateRange | null;
  canEdit: boolean;
  onNightClick: (listingId: string, iso: string, kind: StayCalendarNightKind, occupyingIds: string[]) => void;
  onCommitRange: (listingId: string, range: StayDateRange) => void;
  onRequireListing: () => void;
  onPickListing: (id: string) => void;
}) {
  const dragAnchorRef = useRef<string | null>(null);
  const dragMovedRef = useRef(false);
  const previewRef = useRef<StayDateRange | null>(null);
  const [preview, setPreview] = useState<StayDateRange | null>(null);
  const activeRange = preview ?? rangeSelect;
  const selecting = preview != null;

  const setPreviewRange = useCallback((next: StayDateRange | null) => {
    previewRef.current = next;
    setPreview(next);
  }, []);

  const endDrag = useCallback(() => {
    const anchor = dragAnchorRef.current;
    if (!anchor || !listingId) {
      dragAnchorRef.current = null;
      dragMovedRef.current = false;
      setPreviewRange(null);
      return;
    }
    const current = previewRef.current ?? { start: anchor, end: anchor };
    const moved = dragMovedRef.current;
    dragAnchorRef.current = null;
    dragMovedRef.current = false;
    setPreviewRange(null);
    if (moved && current.start !== current.end) {
      onCommitRange(listingId, current);
      return;
    }
    const iso = current.start;
    const occupying = stayCalendarOccupyingOnNight(bookings, listingId, iso);
    const cap = stayCalendarCapacityOnNight(caps, listingId, iso);
    const kind = stayCalendarNightKind({ occupying, capacity: cap });
    onNightClick(
      listingId,
      iso,
      kind,
      occupying.map((b) => b.id)
    );
  }, [bookings, caps, listingId, onCommitRange, onNightClick, setPreviewRange]);

  useEffect(() => {
    const onUp = () => {
      if (!dragAnchorRef.current) return;
      endDrag();
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [endDrag]);

  if (!listingId) {
    return (
      <div className="stay-ops-cal-empty">
        <p className="stay-ops-cal-empty__title">Select a property</p>
        <p className="stay-ops-cal-empty__body">Month view shows one Stay at a time.</p>
        <ul className="stay-ops-month__pick">
          {listings.slice(0, 12).map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className="stay-ops-month__pick-btn lux-flat"
                onClick={() => onPickListing(l.id)}
              >
                {l.title}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={`stay-ops-month${selecting ? ' is-selecting' : ''}`}>
      <div className="stay-ops-month__legend" aria-label="Legend">
        <span>
          <i className="tv-stay-cal-swatch tv-stay-cal-kind--booked" aria-hidden /> Booked
        </span>
        <span>
          <i className="tv-stay-cal-swatch tv-stay-cal-kind--pending" aria-hidden /> Pending
        </span>
        <span>
          <i className="tv-stay-cal-swatch tv-stay-cal-kind--blocked" aria-hidden /> Blocked
        </span>
      </div>
      <div className="stay-ops-month__weekdays" aria-hidden>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div
        className="stay-ops-month__grid"
        onPointerMove={(e) => {
          if (!dragAnchorRef.current) return;
          const el = document.elementFromPoint(e.clientX, e.clientY);
          const btn = el?.closest('[data-stay-night]') as HTMLElement | null;
          const iso = btn?.dataset.stayNight;
          if (!iso) return;
          if (dragAnchorRef.current !== iso) dragMovedRef.current = true;
          setPreviewRange(stayDateRangeFromDrag(dragAnchorRef.current, iso));
        }}
      >
        {cells.map((cell) => {
          if (!cell.inMonth) {
            return <div key={cell.iso} className="stay-ops-month__cell stay-ops-month__cell--out" />;
          }
          const occupying = stayCalendarOccupyingOnNight(bookings, listingId, cell.iso);
          const cap = stayCalendarCapacityOnNight(caps, listingId, cell.iso);
          const kind = stayCalendarNightKind({ occupying, capacity: cap });
          const edge = stayDateRangeEdge(cell.iso, activeRange);
          const isToday = cell.iso === todayIso;
          const occupied = kind === 'booked' || kind === 'pending';
          const selectable = canEdit && !occupied;
          const guestHint =
            occupying[0]?.guest_name?.trim()?.split(/\s+/)[0] ??
            (kind === 'blocked' ? 'Block' : null);
          const meta = kind === 'available' ? null : stayCalendarNightKindLabel(kind);
          return (
            <button
              key={cell.iso}
              type="button"
              data-stay-night={cell.iso}
              aria-pressed={edge != null}
              aria-label={`${cell.iso}${meta ? `, ${meta}` : ''}${guestHint ? `, ${guestHint}` : ''}`}
              className={`stay-ops-month__cell lux-flat ${kindClass(kind)}${
                isToday ? ' is-today' : ''
              }${edge ? ` is-in-range is-range-${edge}` : ''}`}
              onPointerDown={(e) => {
                if (!listingId) {
                  onRequireListing();
                  return;
                }
                if (occupied) {
                  onNightClick(
                    listingId,
                    cell.iso,
                    kind,
                    occupying.map((b) => b.id)
                  );
                  return;
                }
                if (!selectable) return;
                if (e.button !== 0) return;
                e.preventDefault();
                dragAnchorRef.current = cell.iso;
                dragMovedRef.current = false;
                setPreviewRange({ start: cell.iso, end: cell.iso });
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                if (!listingId) {
                  onRequireListing();
                  return;
                }
                onNightClick(
                  listingId,
                  cell.iso,
                  kind,
                  occupying.map((b) => b.id)
                );
              }}
            >
              <span className="stay-ops-month__num">{Number(cell.iso.slice(8))}</span>
              {guestHint ? (
                <span className={`stay-ops-month__guest${kind === 'blocked' ? ' is-blocked' : ''}`}>
                  {guestHint}
                  {occupying.length > 1 ? ` +${occupying.length - 1}` : ''}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
