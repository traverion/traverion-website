/**
 * Mission 05.1–05.5 — Unified Partner Calendar.
 * Agenda + Month, single-date editing, bulk edits, and operational visibility.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BedDouble,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Compass,
  KeyRound,
} from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings } from '../../lib/supplierTeamRoles';
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import { fetchAvailabilityByListingId } from '../../data/supabase-availability';
import {
  fetchRentalAvailabilityBlocks,
  fetchRentalInventoryHolds,
  rentalVariantsFromListingExtras,
  type RentalAvailabilityBlockRow,
  type RentalInventoryHoldRow,
} from '../../data/supabase-rental-availability';
import type { TourPackage } from '../../types/tour';
import { experienceTodayIsoForListing } from '../../lib/booking-quote';
import { buildMonthCells } from '../../lib/availability-ops';
import { localYmd } from '../../lib/local-ymd';
import { addCalendarDaysYmd } from '../../lib/booking-lifecycle-calendar';
import { inventoryFamilyFromListing } from '../../lib/inventory';
import { materializedBookingOptions } from '../../types/listingExtras';
import {
  buildPartnerUnifiedCalendarEvents,
  filterPartnerUnifiedCalendarEvents,
  groupPartnerUnifiedEventsByDate,
  listingsForUnifiedCategoryFilter,
  parsePartnerUnifiedCalendarView,
  parsePartnerUnifiedCategoryFilter,
  partnerUnifiedAgendaRange,
  partnerUnifiedCategoryLabel,
  partnerUnifiedEventKindLabel,
  partnerUnifiedMonthRange,
  partnerUnifiedOptionChoices,
  summarizePartnerUnifiedMonthDays,
  type PartnerUnifiedCalendarEvent,
  type PartnerUnifiedCalendarView,
  type PartnerUnifiedCategoryFilter,
} from '../../lib/partner-unified-calendar';
import {
  annotateStayMonthSummaries,
  buildPartnerUnifiedRentalBlockEvents,
  buildPartnerUnifiedRentalOngoingEvents,
  buildPartnerUnifiedStayBlockedEvents,
  buildPartnerUnifiedTourDepartureEvents,
  mergePartnerUnifiedVisibilityEvents,
  partnerUnifiedRentalDayStockSummary,
} from '../../lib/partner-unified-calendar-visibility';
import { partnerUnifiedDayBoundsUtc } from '../../lib/partner-unified-day-edits';
import { openSupplierBooking } from '../../lib/supplierPortalNavigation';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierEmptyState,
  SupplierPageHero,
} from '../../components/supplier/supplierUi';
import PartnerSelect from '../../components/supplier/PartnerSelect';
import PartnerUnifiedDayAvailabilityPanel from '../../components/supplier/PartnerUnifiedDayAvailabilityPanel';
import PartnerUnifiedBulkEditPanel from '../../components/supplier/PartnerUnifiedBulkEditPanel';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function readSearch(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function formatDayHeading(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatDayShort(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function formatMonthLabel(year: number, monthIndex0: number): string {
  return new Date(Date.UTC(year, monthIndex0, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function CategoryGlyph({ category }: { category: PartnerUnifiedCalendarEvent['category'] }) {
  if (category === 'stay') return <BedDouble className="h-3.5 w-3.5 shrink-0" aria-hidden />;
  if (category === 'rental') return <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden />;
  return <Compass className="h-3.5 w-3.5 shrink-0" aria-hidden />;
}

function EventRow({
  event,
  onOpenOperational,
}: {
  event: PartnerUnifiedCalendarEvent;
  onOpenOperational: (event: PartnerUnifiedCalendarEvent) => void;
}) {
  const meta = [event.optionLabel, event.guestName, event.metaLine, event.reference]
    .filter(Boolean)
    .join(' · ');
  const statusClass = event.departureStatus
    ? ` partner-unified-cal__row--${event.departureStatus}`
    : event.kind === 'stay_blocked' || event.kind === 'rental_block'
      ? ' partner-unified-cal__row--closed'
      : '';
  const opensBooking =
    Boolean(event.bookingId) &&
    (event.source === 'booking' || event.source == null) &&
    event.kind !== 'tour_departure' &&
    event.kind !== 'stay_blocked' &&
    event.kind !== 'rental_block';

  return (
    <button
      type="button"
      className={`partner-unified-cal__row${statusClass}`}
      onClick={() => {
        if (opensBooking && event.bookingId) {
          openSupplierBooking(event.bookingId, { family: event.category });
          return;
        }
        onOpenOperational(event);
      }}
    >
      <span className="partner-unified-cal__time" aria-hidden={!event.timeHm}>
        {event.timeHm ?? '—'}
      </span>
      <span className="partner-unified-cal__body">
        <span className="partner-unified-cal__title-row">
          <span className={`partner-unified-cal__kind partner-unified-cal__kind--${event.category}`}>
            <CategoryGlyph category={event.category} />
            {partnerUnifiedEventKindLabel(event.kind)}
          </span>
          <span className="partner-unified-cal__cat">{partnerUnifiedCategoryLabel(event.category)}</span>
        </span>
        <span className="partner-unified-cal__title">{event.listingTitle}</span>
        {meta ? <span className="partner-unified-cal__meta">{meta}</span> : null}
      </span>
    </button>
  );
}

export default function SupplierUnifiedCalendar() {
  const { user, isSupabase } = useSupplierAuth();
  const { role } = useSupplierRole();
  const canEdit = canManageBookings(role);
  const todayIso = useMemo(() => experienceTodayIsoForListing(undefined) || localYmd(new Date()), []);

  const initial = useMemo(() => {
    const q = readSearch();
    return {
      view: parsePartnerUnifiedCalendarView(q.get('view')),
      category: parsePartnerUnifiedCategoryFilter(q.get('category')),
      listingId: (q.get('listing') ?? '').trim(),
      optionKey: (q.get('option') ?? '').trim(),
      includePast: q.get('history') === '1',
      anchorYmd: /^\d{4}-\d{2}-\d{2}$/.test((q.get('date') ?? '').trim())
        ? (q.get('date') as string).trim()
        : todayIso,
      selectedYmd: /^\d{4}-\d{2}-\d{2}$/.test((q.get('day') ?? '').trim())
        ? (q.get('day') as string).trim()
        : todayIso,
    };
  }, [todayIso]);

  const [view, setView] = useState<PartnerUnifiedCalendarView>(initial.view);
  const [category, setCategory] = useState<PartnerUnifiedCategoryFilter>(initial.category);
  const [listingId, setListingId] = useState(initial.listingId);
  const [optionKey, setOptionKey] = useState(initial.optionKey);
  const [includePast, setIncludePast] = useState(initial.includePast);
  const [anchorYmd, setAnchorYmd] = useState(initial.anchorYmd);
  const [selectedYmd, setSelectedYmd] = useState(initial.selectedYmd);
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [calendarEpoch, setCalendarEpoch] = useState(0);
  const [dayCapsByListing, setDayCapsByListing] = useState<Map<string, Map<string, number>>>(
    () => new Map()
  );
  const [stayCaps, setStayCaps] = useState<
    Array<{ listing_id: string; available_date: string; capacity: number }>
  >([]);
  const [rentalBlocks, setRentalBlocks] = useState<RentalAvailabilityBlockRow[]>([]);
  const [rentalHolds, setRentalHolds] = useState<RentalInventoryHoldRow[]>([]);
  const [visibilityNote, setVisibilityNote] = useState<string | null>(null);

  const anchorDate = useMemo(() => new Date(`${anchorYmd}T12:00:00Z`), [anchorYmd]);
  const year = anchorDate.getUTCFullYear();
  const monthIndex0 = anchorDate.getUTCMonth();

  const load = useCallback(async () => {
    if (!user?.id || !isSupabase) {
      setListings([]);
      setBookings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [mine, rows] = await Promise.all([
        fetchMyListings(user.id),
        fetchBookingsForSupplier(user.id),
      ]);
      setListings(mine);
      setBookings(rows);
    } catch (e) {
      setError(userFacingError(e, USER_ERROR.calendar));
    } finally {
      setLoading(false);
    }
  }, [user?.id, isSupabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const q = url.searchParams;
    if (view === 'agenda') q.delete('view');
    else q.set('view', view);
    if (category === 'all') q.delete('category');
    else q.set('category', category);
    if (listingId) q.set('listing', listingId);
    else q.delete('listing');
    if (optionKey) q.set('option', optionKey);
    else q.delete('option');
    if (includePast) q.set('history', '1');
    else q.delete('history');
    if (anchorYmd !== todayIso) q.set('date', anchorYmd);
    else q.delete('date');
    if (selectedYmd && selectedYmd !== todayIso) q.set('day', selectedYmd);
    else if (selectedYmd === todayIso) q.delete('day');
    else q.delete('day');
    const qs = q.toString();
    window.history.replaceState({}, '', qs ? `${url.pathname}?${qs}` : url.pathname);
  }, [view, category, listingId, optionKey, includePast, anchorYmd, selectedYmd, todayIso]);

  const titlesByListingId = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of listings) map.set(l.id, l.title || 'Listing');
    return map;
  }, [listings]);

  const range = useMemo(() => {
    if (view === 'month') return partnerUnifiedMonthRange(year, monthIndex0);
    return partnerUnifiedAgendaRange(anchorYmd);
  }, [view, year, monthIndex0, anchorYmd]);

  const selectedListing = useMemo(
    () => (listingId ? listings.find((l) => l.id === listingId) ?? null : null),
    [listings, listingId]
  );
  const selectedFamily = selectedListing
    ? inventoryFamilyFromListing(selectedListing)
    : null;

  const scopedListings = useMemo(
    () => listingsForUnifiedCategoryFilter(listings, category),
    [listings, category]
  );

  const tourListingsInScope = useMemo(
    () => scopedListings.filter((l) => inventoryFamilyFromListing(l) === 'tour'),
    [scopedListings]
  );

  // Load day caps for tour schedules (+ stay caps / rental blocks when a listing is selected).
  useEffect(() => {
    if (!isSupabase || listings.length === 0) {
      setDayCapsByListing(new Map());
      setStayCaps([]);
      setRentalBlocks([]);
      setRentalHolds([]);
      setVisibilityNote(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const notes: string[] = [];
      try {
        const needTourCaps = category === 'all' || category === 'tour';
        const nextCaps = new Map<string, Map<string, number>>();
        if (needTourCaps && tourListingsInScope.length > 0) {
          const results = await Promise.all(
            tourListingsInScope.map(async (l) => {
              try {
                const rows = await fetchAvailabilityByListingId(l.id, {
                  fromDate: range.fromYmd,
                  toDate: range.toYmd,
                });
                return { id: l.id, rows, ok: true as const };
              } catch {
                return { id: l.id, rows: [], ok: false as const };
              }
            })
          );
          let failed = 0;
          for (const r of results) {
            if (!r.ok) failed += 1;
            const m = new Map<string, number>();
            for (const row of r.rows) {
              m.set(row.available_date, Number(row.capacity));
            }
            nextCaps.set(r.id, m);
          }
          if (failed > 0) {
            notes.push(
              `Could not load closed-day overrides for ${failed} tour listing${
                failed === 1 ? '' : 's'
              }. Open/full/cutoff still use schedule + bookings.`
            );
          }
        }
        if (!cancelled) setDayCapsByListing(nextCaps);

        if (selectedListing && selectedFamily === 'stay') {
          try {
            const rows = await fetchAvailabilityByListingId(selectedListing.id, {
              fromDate: range.fromYmd,
              toDate: range.toYmd,
            });
            if (!cancelled) {
              setStayCaps(
                rows.map((r) => ({
                  listing_id: r.listing_id,
                  available_date: r.available_date,
                  capacity: Number(r.capacity),
                }))
              );
            }
          } catch {
            if (!cancelled) {
              setStayCaps([]);
              notes.push('Stay blocked nights unavailable — caps could not be loaded.');
            }
          }
        } else if (!cancelled) {
          setStayCaps([]);
        }

        if (selectedListing && selectedFamily === 'rental') {
          try {
            const start = partnerUnifiedDayBoundsUtc(range.fromYmd);
            const endExclusive = addCalendarDaysYmd(range.toYmd, 1) ?? range.toYmd;
            const endIso = `${endExclusive}T00:00:00.000Z`;
            const [blocks, holds] = await Promise.all([
              fetchRentalAvailabilityBlocks(selectedListing.id, start.startIso, endIso),
              fetchRentalInventoryHolds(selectedListing.id, start.startIso, endIso),
            ]);
            if (!cancelled) {
              setRentalBlocks(blocks);
              setRentalHolds(holds);
            }
          } catch {
            if (!cancelled) {
              setRentalBlocks([]);
              setRentalHolds([]);
              notes.push('Rental blocks/stock unavailable for this range.');
            }
          }
        } else if (!cancelled) {
          setRentalBlocks([]);
          setRentalHolds([]);
        }

        if (!cancelled) setVisibilityNote(notes[0] ?? null);
      } catch (e) {
        if (!cancelled) {
          setVisibilityNote(userFacingError(e, USER_ERROR.calendar));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isSupabase,
    listings,
    tourListingsInScope,
    category,
    range.fromYmd,
    range.toYmd,
    selectedListing,
    selectedFamily,
    calendarEpoch,
  ]);

  const bookingEvents = useMemo(
    () =>
      buildPartnerUnifiedCalendarEvents({
        bookings,
        fromYmd: range.fromYmd,
        toYmd: range.toYmd,
        titlesByListingId,
        includeOccupiedNights: view === 'agenda' || Boolean(listingId && selectedFamily === 'stay'),
      }),
    // calendarEpoch forces rebuild after bulk/day edits refresh bookings/listings
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional refresh bump
    [bookings, range.fromYmd, range.toYmd, titlesByListingId, view, listingId, selectedFamily, calendarEpoch]
  );

  const allEvents = useMemo(() => {
    const needTours = category === 'all' || category === 'tour';
    const tourDepartures = needTours
      ? buildPartnerUnifiedTourDepartureEvents({
          listings: tourListingsInScope,
          bookings,
          dayCaps: dayCapsByListing,
          fromYmd: range.fromYmd,
          toYmd: range.toYmd,
          listingIdFilter: listingId || null,
        })
      : [];

    const stayBlocked =
      selectedListing && selectedFamily === 'stay'
        ? buildPartnerUnifiedStayBlockedEvents({
            listing: selectedListing,
            bookings,
            caps: stayCaps,
            fromYmd: range.fromYmd,
            toYmd: range.toYmd,
          })
        : [];

    const rentalOngoing =
      selectedListing && selectedFamily === 'rental'
        ? buildPartnerUnifiedRentalOngoingEvents({
            listing: selectedListing,
            bookings,
            fromYmd: range.fromYmd,
            toYmd: range.toYmd,
          })
        : [];

    const rentalBlockEvents =
      selectedListing && selectedFamily === 'rental'
        ? buildPartnerUnifiedRentalBlockEvents({
            listing: selectedListing,
            blocks: rentalBlocks,
            fromYmd: range.fromYmd,
            toYmd: range.toYmd,
          })
        : [];

    return mergePartnerUnifiedVisibilityEvents({
      bookingEvents,
      tourDepartures,
      stayBlocked,
      rentalOngoing,
      rentalBlocks: rentalBlockEvents,
    });
  }, [
    bookingEvents,
    category,
    tourListingsInScope,
    bookings,
    dayCapsByListing,
    range.fromYmd,
    range.toYmd,
    listingId,
    selectedListing,
    selectedFamily,
    stayCaps,
    rentalBlocks,
  ]);

  const filteredEvents = useMemo(
    () =>
      filterPartnerUnifiedCalendarEvents(allEvents, {
        category,
        listingId: listingId || null,
        optionKey: optionKey || null,
        includePast,
      }),
    [allEvents, category, listingId, optionKey, includePast]
  );

  const agendaGroups = useMemo(
    () => groupPartnerUnifiedEventsByDate(filteredEvents),
    [filteredEvents]
  );

  const monthCells = useMemo(() => buildMonthCells(year, monthIndex0), [year, monthIndex0]);
  const monthSummaries = useMemo(() => {
    const base = summarizePartnerUnifiedMonthDays(filteredEvents, year, monthIndex0);
    if (selectedListing && selectedFamily === 'stay') {
      return annotateStayMonthSummaries({
        summaries: base,
        listingId: selectedListing.id,
        bookings,
        caps: stayCaps,
      });
    }
    return base;
  }, [
    filteredEvents,
    year,
    monthIndex0,
    selectedListing,
    selectedFamily,
    bookings,
    stayCaps,
  ]);

  const rentalStockForSelectedDay = useMemo(() => {
    if (!selectedListing || selectedFamily !== 'rental' || !selectedYmd) return [];
    return partnerUnifiedRentalDayStockSummary({
      listing: selectedListing,
      iso: selectedYmd,
      blocks: rentalBlocks,
      holds: rentalHolds,
    });
  }, [selectedListing, selectedFamily, selectedYmd, rentalBlocks, rentalHolds]);

  const openOperationalEvent = useCallback((event: PartnerUnifiedCalendarEvent) => {
    setSelectedYmd(event.ymd);
    setListingId(event.listingId);
    if (event.bookingId && (event.kind === 'rental_ongoing' || event.kind === 'rental_collection' || event.kind === 'rental_return')) {
      openSupplierBooking(event.bookingId, { family: event.category });
    }
  }, []);

  const selectedDayEvents = useMemo(
    () => filteredEvents.filter((e) => e.ymd === selectedYmd),
    [filteredEvents, selectedYmd]
  );

  const listingOptions = useMemo(() => {
    const scoped = listingsForUnifiedCategoryFilter(listings, category);
    return [
      { value: '', label: 'All listings' },
      ...scoped.map((l) => ({ value: l.id, label: l.title || 'Untitled' })),
    ];
  }, [listings, category]);

  const optionChoices = useMemo(() => {
    const fromEvents = partnerUnifiedOptionChoices(
      filterPartnerUnifiedCalendarEvents(allEvents, {
        category,
        listingId: listingId || null,
        optionKey: null,
        includePast: true,
      })
    );
    const seen = new Map(fromEvents.map((o) => [o.value, o]));
    const pool = listingId
      ? listings.filter((l) => l.id === listingId)
      : listingsForUnifiedCategoryFilter(listings, category);
    for (const l of pool) {
      if (inventoryFamilyFromListing(l) === 'tour') {
        for (const o of materializedBookingOptions(l.listingExtras?.bookingOptions)) {
          const label = (o.name ?? '').trim();
          if (label && !seen.has(label)) seen.set(label, { value: label, label });
        }
      }
      if (inventoryFamilyFromListing(l) === 'rental') {
        for (const v of rentalVariantsFromListingExtras(l.listingExtras)) {
          const label = (v.name ?? '').trim();
          if (label && !seen.has(label)) seen.set(label, { value: label, label });
        }
      }
    }
    return [
      { value: '', label: 'All options' },
      ...[...seen.values()].sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [allEvents, category, listingId, listings]);

  useEffect(() => {
    if (listingId && !listingOptions.some((o) => o.value === listingId)) {
      setListingId('');
    }
  }, [listingId, listingOptions]);

  useEffect(() => {
    if (optionKey && !optionChoices.some((o) => o.value === optionKey)) {
      setOptionKey('');
    }
  }, [optionKey, optionChoices]);

  const shiftAgenda = (deltaDays: number) => {
    const next = addCalendarDaysYmd(anchorYmd, deltaDays);
    if (next) setAnchorYmd(next);
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, monthIndex0 + delta, 1));
    const iso = d.toISOString().slice(0, 10);
    setAnchorYmd(iso);
    setSelectedYmd(iso);
  };

  const goToday = () => {
    setAnchorYmd(todayIso);
    setSelectedYmd(todayIso);
  };

  const emptyPastHint =
    !includePast &&
    ((view === 'agenda' && range.toYmd < todayIso) ||
      (view === 'month' && selectedYmd < todayIso && selectedDayEvents.length === 0));

  if (!isSupabase) {
    return (
      <div className={SUPPLIER_PAGE_CLASS}>
        <ErrorState title="Unavailable" body="Calendar requires a connected account." />
      </div>
    );
  }

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} partner-unified-cal`}>
      <SupplierPageHero
        badge="Overview"
        title="Calendar"
        description="Tours, stays, and rentals in one place."
        actions={
          canEdit && listings.length > 0 ? (
            <button
              type="button"
              className="tv-btn-secondary inline-flex min-h-10 items-center px-3 text-sm font-semibold"
              onClick={() => setBulkOpen(true)}
            >
              Bulk edit
            </button>
          ) : null
        }
      />

      {error ? (
        <ErrorState title="Could not load" body={error} retry={{ onClick: () => void load() }} />
      ) : null}
      {visibilityNote ? (
        <p className="partner-unified-cal__visibility-note" role="status">
          {visibilityNote}
        </p>
      ) : null}

      <div className="partner-unified-cal__toolbar">
        <div className="tv-avail-switch" role="tablist" aria-label="Calendar view">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'agenda'}
            className={`tv-avail-switch__btn${view === 'agenda' ? ' is-active' : ''}`}
            onClick={() => setView('agenda')}
          >
            Agenda
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'month'}
            className={`tv-avail-switch__btn${view === 'month' ? ' is-active' : ''}`}
            onClick={() => setView('month')}
          >
            Month
          </button>
        </div>

        <div className="partner-unified-cal__nav">
          <button
            type="button"
            className="tv-btn-secondary inline-flex min-h-9 items-center gap-1 px-2"
            onClick={() => (view === 'month' ? shiftMonth(-1) : shiftAgenda(-7))}
            aria-label={view === 'month' ? 'Previous month' : 'Previous week'}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            className="tv-btn-secondary inline-flex min-h-9 items-center px-2.5 text-sm font-semibold"
            onClick={goToday}
          >
            Today
          </button>
          <button
            type="button"
            className="tv-btn-secondary inline-flex min-h-9 items-center gap-1 px-2"
            onClick={() => (view === 'month' ? shiftMonth(1) : shiftAgenda(7))}
            aria-label={view === 'month' ? 'Next month' : 'Next week'}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <p className="partner-unified-cal__period">
            {view === 'month'
              ? formatMonthLabel(year, monthIndex0)
              : `${formatDayShort(range.fromYmd)} – ${formatDayShort(range.toYmd)}`}
          </p>
        </div>
      </div>

      <div className="partner-unified-cal__filters">
        <div className="partner-unified-cal__filter">
          <label htmlFor="unified-cal-category">Category</label>
          <PartnerSelect
            id="unified-cal-category"
            aria-label="Category"
            value={category}
            onChange={(v) => setCategory(parsePartnerUnifiedCategoryFilter(v))}
            options={[
              { value: 'all', label: 'All' },
              { value: 'tour', label: 'Tours' },
              { value: 'stay', label: 'Stays' },
              { value: 'rental', label: 'Rentals' },
            ]}
          />
        </div>
        <div className="partner-unified-cal__filter partner-unified-cal__filter--grow">
          <label htmlFor="unified-cal-listing">Listing</label>
          <PartnerSelect
            id="unified-cal-listing"
            aria-label="Listing"
            value={listingId}
            onChange={setListingId}
            options={listingOptions}
          />
        </div>
        <div className="partner-unified-cal__filter">
          <label htmlFor="unified-cal-option">Option</label>
          <PartnerSelect
            id="unified-cal-option"
            aria-label="Option"
            value={optionKey}
            onChange={setOptionKey}
            options={optionChoices}
            disabled={optionChoices.length <= 1}
          />
        </div>
        <div className="partner-unified-cal__history">
          <button
            type="button"
            className={`partner-unified-cal__history-btn${includePast ? ' is-active' : ''}`}
            aria-pressed={includePast}
            onClick={() => setIncludePast((v) => !v)}
          >
            {includePast ? 'Showing past' : 'Show past'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="partner-unified-cal__loading">Loading calendar…</p>
      ) : listings.length === 0 ? (
        <SupplierEmptyState
          icon={CalendarDays}
          title="No listings yet"
          body="Create a tour, stay, or rental to see bookings on this calendar."
        />
      ) : view === 'agenda' ? (
        agendaGroups.length === 0 ? (
          <SupplierEmptyState
            icon={CalendarDays}
            title={emptyPastHint ? 'Past window' : 'Nothing upcoming'}
            body={
              emptyPastHint
                ? 'Past booking events are hidden by default. Turn on Show past, or jump to Today.'
                : 'No upcoming departures, stays, or rentals in this range. Try another filter or Show past.'
            }
            action={
              !includePast ? (
                <button
                  type="button"
                  className="tv-btn-secondary inline-flex min-h-10 items-center px-3 text-sm font-semibold"
                  onClick={() => setIncludePast(true)}
                >
                  Show past events
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="partner-unified-cal__agenda-layout">
            <div className="partner-unified-cal__agenda">
              {agendaGroups.map((group) => (
                <section
                  key={group.iso}
                  className={`partner-unified-cal__day${
                    group.iso === selectedYmd ? ' is-selected' : ''
                  }`}
                >
                  <header className="partner-unified-cal__day-head">
                    <button
                      type="button"
                      className="partner-unified-cal__day-select"
                      onClick={() => setSelectedYmd(group.iso)}
                    >
                      <h2>
                        {formatDayHeading(group.iso)}
                        {group.iso === todayIso ? (
                          <span className="partner-unified-cal__today-pill">Today</span>
                        ) : null}
                      </h2>
                      <span className="partner-unified-cal__day-count">
                        {group.events.length} event{group.events.length === 1 ? '' : 's'} · Edit
                      </span>
                    </button>
                  </header>
                  <div className="partner-unified-cal__day-list">
                    {group.events.map((event) => (
                      <EventRow
                        key={event.key}
                        event={event}
                        onOpenOperational={openOperationalEvent}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <PartnerUnifiedDayAvailabilityPanel
              iso={selectedYmd}
              listings={listingsForUnifiedCategoryFilter(listings, category)}
              bookings={bookings}
              dayEvents={selectedDayEvents}
              initialListingId={listingId}
              canEdit={canEdit}
              userId={user?.id}
              onListingsChange={setListings}
            />
          </div>
        )
      ) : (
        <div className="partner-unified-cal__month-layout">
          <div className="partner-unified-cal__month" role="grid" aria-label="Month">
            <div className="partner-unified-cal__weekdays" role="row">
              {WEEKDAYS.map((d) => (
                <div key={d} className="partner-unified-cal__weekday" role="columnheader">
                  {d}
                </div>
              ))}
            </div>
            <div className="partner-unified-cal__grid">
              {monthCells.map((cell) => {
                const summary = monthSummaries.get(cell.iso);
                const isToday = cell.iso === todayIso;
                const isSelected = cell.iso === selectedYmd;
                const isPast = cell.iso < todayIso;
                const count = summary?.total ?? 0;
                const nightKind = summary?.stayNightKind;
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    role="gridcell"
                    className={[
                      'partner-unified-cal__cell',
                      cell.inMonth ? '' : 'is-outside',
                      isToday ? 'is-today' : '',
                      isSelected ? 'is-selected' : '',
                      isPast ? 'is-past' : '',
                      count > 0 ? 'has-events' : '',
                      nightKind === 'blocked' ? 'is-blocked' : '',
                      nightKind === 'available' && selectedFamily === 'stay' ? 'is-available' : '',
                      nightKind === 'booked' ? 'is-booked-night' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setSelectedYmd(cell.iso)}
                    aria-label={`${cell.iso}${count ? `, ${count} events` : ''}${
                      nightKind ? `, ${nightKind}` : ''
                    }`}
                    aria-pressed={isSelected}
                  >
                    <span className="partner-unified-cal__cell-top">
                      <span className="partner-unified-cal__cell-num">{cell.day}</span>
                      {count > 0 ? (
                        <span className="partner-unified-cal__cell-count">{count}</span>
                      ) : null}
                    </span>
                    <span className="partner-unified-cal__dots" aria-hidden>
                      {(summary?.tour ?? 0) > 0 ? <i className="is-tour" /> : null}
                      {(summary?.stay ?? 0) > 0 || nightKind === 'booked' ? (
                        <i className="is-stay" />
                      ) : null}
                      {(summary?.rental ?? 0) > 0 ? <i className="is-rental" /> : null}
                      {nightKind === 'blocked' ? <i className="is-blocked" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="partner-unified-cal__side partner-unified-cal__side--edit">
            {rentalStockForSelectedDay.length > 0 ? (
              <div className="partner-unified-cal__stock" aria-label="Rental stock">
                <p className="partner-unified-cal__stock-title">Stock today</p>
                <ul>
                  {rentalStockForSelectedDay.map((row) => (
                    <li key={row.optionName}>
                      <span>{row.optionName}</span>
                      <span>
                        {row.blocked
                          ? 'Blocked'
                          : `${row.available} free · ${row.reserved} reserved · ${row.stock} stock`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {selectedDayEvents.length > 0 ? (
              <div className="partner-unified-cal__day-list partner-unified-cal__side-bookings">
                {selectedDayEvents.map((event) => (
                  <EventRow
                    key={event.key}
                    event={event}
                    onOpenOperational={openOperationalEvent}
                  />
                ))}
              </div>
            ) : selectedYmd < todayIso && !includePast ? (
              <div className="partner-unified-cal__side-empty">
                <p>Past booking events are hidden. Availability can still be edited below.</p>
                <button
                  type="button"
                  className="partner-unified-cal__history-btn"
                  onClick={() => setIncludePast(true)}
                >
                  Show past
                </button>
              </div>
            ) : null}
            <PartnerUnifiedDayAvailabilityPanel
              iso={selectedYmd}
              listings={listingsForUnifiedCategoryFilter(listings, category)}
              bookings={bookings}
              dayEvents={selectedDayEvents}
              initialListingId={listingId}
              canEdit={canEdit}
              userId={user?.id}
              onListingsChange={setListings}
            />
          </aside>
        </div>
      )}

      {view === 'agenda' && agendaGroups.length === 0 && listings.length > 0 ? (
        <PartnerUnifiedDayAvailabilityPanel
          iso={selectedYmd}
          listings={listingsForUnifiedCategoryFilter(listings, category)}
          bookings={bookings}
          dayEvents={selectedDayEvents}
          initialListingId={listingId}
          canEdit={canEdit}
          userId={user?.id}
          onListingsChange={setListings}
        />
      ) : null}

      <PartnerUnifiedBulkEditPanel
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        listings={listings}
        bookings={bookings}
        initialCategory={category}
        initialListingId={listingId}
        initialFromIso={selectedYmd || todayIso}
        canEdit={canEdit}
        userId={user?.id}
        onListingsChange={setListings}
        onApplied={() => {
          void load().then(() => setCalendarEpoch((n) => n + 1));
        }}
      />
    </div>
  );
}
