/**
 * Mission 05.1–05.6.x — Unified Partner Calendar.
 * Full-width Agenda/Week/Month, rolling date ranges, inline expandable editing.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
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
import { localYmd } from '../../lib/local-ymd';
import { addCalendarDaysYmd } from '../../lib/booking-lifecycle-calendar';
import { inventoryFamilyFromListing } from '../../lib/inventory';
import { materializedBookingOptions } from '../../types/listingExtras';
import {
  buildPartnerUnifiedCalendarEvents,
  filterPartnerUnifiedCalendarEvents,
  formatPartnerUnifiedMonthLabel,
  formatPartnerUnifiedWeekLabel,
  groupPartnerUnifiedEventsByDate,
  listingsForUnifiedCategoryFilter,
  parsePartnerUnifiedCalendarView,
  parsePartnerUnifiedCategoryFilter,
  partnerUnifiedApplyShift,
  partnerUnifiedApplyViewChange,
  partnerUnifiedDisplayRangeForView,
  partnerUnifiedEventKindLabel,
  partnerUnifiedFocusInRange,
  partnerUnifiedNormalizeRange,
  partnerUnifiedOptionChoices,
  partnerUnifiedRollingRange,
  partnerUnifiedSharedFocusYmd,
  partnerUnifiedWeeksCoveringRange,
  type PartnerUnifiedCalendarEvent,
  type PartnerUnifiedCalendarView,
  type PartnerUnifiedCategoryFilter,
  type PartnerUnifiedMonthDaySummary,
} from '../../lib/partner-unified-calendar';
import { TraverionSingleDateField } from '../../components/calendar/TraverionSingleDateField';
import PartnerUnifiedAgendaTourControls, {
  type PartnerUnifiedAgendaTourPatch,
} from '../../components/supplier/PartnerUnifiedAgendaTourControls';
import PartnerUnifiedAgendaStayControls, {
  type PartnerUnifiedAgendaStayPatch,
} from '../../components/supplier/PartnerUnifiedAgendaStayControls';
import PartnerUnifiedAgendaRentalControls, {
  type PartnerUnifiedAgendaRentalPatch,
} from '../../components/supplier/PartnerUnifiedAgendaRentalControls';
import {
  annotateStayMonthSummaries,
  buildPartnerUnifiedRentalOngoingEvents,
  buildPartnerUnifiedRentalPresenceEvents,
  buildPartnerUnifiedStayPresenceEvents,
  buildPartnerUnifiedTourDepartureEvents,
  mergePartnerUnifiedVisibilityEvents,
} from '../../lib/partner-unified-calendar-visibility';
import {
  PARTNER_UNIFIED_MONTH_CELL_MAX,
  monthChipLabel,
  monthChipTitle,
  sortMonthCellEvents,
} from '../../lib/partner-unified-calendar-month';
import { partnerUnifiedDayBoundsUtc } from '../../lib/partner-unified-day-edits';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierEmptyState,
  SupplierPageHero,
} from '../../components/supplier/supplierUi';
import PartnerSelect from '../../components/supplier/PartnerSelect';
import PartnerUnifiedBulkEditPanel from '../../components/supplier/PartnerUnifiedBulkEditPanel';
import PartnerUnifiedInlineAvailabilityEdit from '../../components/supplier/PartnerUnifiedInlineAvailabilityEdit';
import PartnerUnifiedEventEditPopover from '../../components/supplier/PartnerUnifiedEventEditPopover';
import PartnerUnifiedWeekView from '../../components/supplier/PartnerUnifiedWeekView';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_CELL_MAX = PARTNER_UNIFIED_MONTH_CELL_MAX;

function readSearch(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function formatDayHeading(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
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

function truncateLabel(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

/** Operational badges only — skip routine Open/Limited noise. */
function statusText(event: PartnerUnifiedCalendarEvent): string | null {
  if (event.departureStatus === 'closed' || event.kind === 'stay_blocked' || event.kind === 'rental_block') {
    return 'Blocked';
  }
  if (event.kind === 'rental_collection') return 'Collection';
  if (event.kind === 'rental_return') return 'Return';
  if (event.kind === 'rental_ongoing') return 'On rent';
  if (event.departureStatus === 'sold_out') return 'Full';
  if (event.departureStatus === 'cutoff') return 'Cutoff';
  return null;
}

function badgeToneClass(event: PartnerUnifiedCalendarEvent, blocked: boolean): string {
  if (blocked) return ' is-blocked';
  if (event.departureStatus === 'sold_out') return ' is-full';
  if (event.departureStatus === 'cutoff') return ' is-cutoff';
  if (
    event.kind === 'rental_collection' ||
    event.kind === 'rental_return' ||
    event.kind === 'rental_ongoing'
  ) {
    return ' is-rental-kind';
  }
  return '';
}

/** Inventory / presence summary for the card aside — presentation only. */
function inventoryLine(event: PartnerUnifiedCalendarEvent): string | null {
  if (event.kind === 'stay_listing' || event.kind === 'rental_listing') {
    return (event.quantityLabel ?? event.metaLine ?? '').trim() || null;
  }
  if (event.bookedCount != null && event.remainingCount != null) {
    return `${event.bookedCount} booked · ${event.remainingCount} available`;
  }
  return null;
}

/** Presentation-only cutoff label for cards. */
function cutoffCardLabel(event: PartnerUnifiedCalendarEvent): string | null {
  const raw = (event.cutoffLabel ?? '').trim();
  if (!raw) return null;
  const closed = raw.match(/(?:Closed at|closes)\s+(\d{1,2}:\d{2})/i);
  if (closed?.[1]) return `Cutoff ${closed[1]}`;
  if (event.cutoffHours != null && event.cutoffHours > 0) {
    return `Cutoff ${event.cutoffHours}h`;
  }
  if (/until departure/i.test(raw)) return 'Until departure';
  if (/day blocked/i.test(raw)) return null;
  return raw.replace(/^Cutoff:\s*/i, 'Cutoff ').split('·')[0]?.trim() || null;
}

function agendaOptionLine(event: PartnerUnifiedCalendarEvent): string | null {
  const option = (event.optionLabel ?? '').trim();
  if (option) return option;
  if (event.category === 'rental') return null;
  return partnerUnifiedEventKindLabel(event.kind);
}

function parseIsoParam(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function MonthEventChip({
  event,
  expanded,
  listing,
  bookings,
  canEdit,
  userId,
  onToggle,
  onClose,
  onListingsChange,
  onSaved,
}: {
  event: PartnerUnifiedCalendarEvent;
  expanded: boolean;
  listing: TourPackage | null;
  bookings: BookingRow[];
  canEdit: boolean;
  userId?: string;
  onToggle: () => void;
  onClose: () => void;
  onListingsChange: Dispatch<SetStateAction<TourPackage[]>>;
  onSaved: () => void;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="partner-unified-cal__chip-wrap">
      <button
        ref={anchorRef}
        type="button"
        className={`partner-unified-cal__chip is-${event.category}${expanded ? ' is-active' : ''}`}
        title={monthChipTitle(event)}
        aria-expanded={expanded}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        {monthChipLabel(event)}
      </button>
      {expanded && listing ? (
        <PartnerUnifiedEventEditPopover
          open
          anchorRef={anchorRef}
          event={event}
          listing={listing}
          bookings={bookings}
          canEdit={canEdit}
          userId={userId}
          onClose={onClose}
          onListingsChange={onListingsChange}
          onSaved={onSaved}
        />
      ) : null}
    </div>
  );
}

export default function SupplierUnifiedCalendar() {
  const { user, isSupabase } = useSupplierAuth();
  const { role } = useSupplierRole();
  const canEdit = canManageBookings(role);
  const todayIso = useMemo(() => experienceTodayIsoForListing(undefined) || localYmd(new Date()), []);

  const initial = useMemo(() => {
    const q = readSearch();
    const rolling = partnerUnifiedRollingRange(todayIso);
    const view = parsePartnerUnifiedCalendarView(q.get('view'));
    const fromRaw = parseIsoParam(q.get('from')) ?? parseIsoParam(q.get('date'));
    const toRaw = parseIsoParam(q.get('to'));
    const selectedYmd = parseIsoParam(q.get('day')) ?? todayIso;
    const focus = partnerUnifiedSharedFocusYmd({
      selectedYmd,
      fromYmd: fromRaw,
      todayIso,
    });
    // Week/Month ignore URL from/to so stale week bounds never clip Month (or Agenda after refresh).
    const range = partnerUnifiedDisplayRangeForView({
      view,
      focusYmd: focus,
      fromYmd: view === 'agenda' ? fromRaw ?? rolling.fromYmd : null,
      toYmd:
        view === 'agenda'
          ? toRaw ??
            (fromRaw ? addCalendarDaysYmd(fromRaw, 29) ?? rolling.toYmd : rolling.toYmd)
          : null,
    });
    return {
      view,
      category: parsePartnerUnifiedCategoryFilter(q.get('category')),
      listingId: (q.get('listing') ?? '').trim(),
      optionKey: (q.get('option') ?? '').trim(),
      includePast: q.get('history') === '1',
      fromYmd: range.fromYmd,
      toYmd: range.toYmd,
      selectedYmd: focus,
    };
  }, [todayIso]);

  const [view, setView] = useState<PartnerUnifiedCalendarView>(initial.view);
  const [category, setCategory] = useState<PartnerUnifiedCategoryFilter>(initial.category);
  const [listingId, setListingId] = useState(initial.listingId);
  const [optionKey, setOptionKey] = useState(initial.optionKey);
  const [includePast, setIncludePast] = useState(initial.includePast);
  const [fromYmd, setFromYmd] = useState(initial.fromYmd);
  const [toYmd, setToYmd] = useState(initial.toYmd);
  const [selectedYmd, setSelectedYmd] = useState(initial.selectedYmd);
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [calendarEpoch, setCalendarEpoch] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  /** Month "+N more" day sheet — lists every event for that date without leaving Month. */
  const [monthDaySheetIso, setMonthDaySheetIso] = useState<string | null>(null);
  const [dayCapsByListing, setDayCapsByListing] = useState<Map<string, Map<string, number>>>(
    () => new Map()
  );
  const [stayCaps, setStayCaps] = useState<
    Array<{ listing_id: string; available_date: string; capacity: number }>
  >([]);
  const [rentalBlocks, setRentalBlocks] = useState<RentalAvailabilityBlockRow[]>([]);
  const [rentalHolds, setRentalHolds] = useState<RentalInventoryHoldRow[]>([]);
  const [visibilityNote, setVisibilityNote] = useState<string | null>(null);
  /** Last Agenda From/To so Week/Month switches can restore it when focus still falls inside. */
  const agendaRangeRef = useRef<{ fromYmd: string; toYmd: string } | null>(
    initial.view === 'agenda' ? { fromYmd: initial.fromYmd, toYmd: initial.toYmd } : null
  );

  /**
   * Focus never falls back to fromYmd here — on Week, fromYmd is Monday and may be the
   * prior month (Nov 1 focus → Oct 26 from). Falling back would make Month show October.
   */
  const focusYmd = useMemo(
    () =>
      partnerUnifiedSharedFocusYmd({
        selectedYmd,
        todayIso,
        allowFromFallback: false,
      }),
    [selectedYmd, todayIso]
  );

  /** Week/Month always derive from focus; Agenda uses explicit From/To. */
  const range = useMemo(() => {
    if (view === 'week' || view === 'month') {
      return partnerUnifiedDisplayRangeForView({ view, focusYmd });
    }
    return partnerUnifiedNormalizeRange(fromYmd, toYmd, todayIso);
  }, [view, focusYmd, fromYmd, toYmd, todayIso]);

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
    const rolling = partnerUnifiedRollingRange(todayIso);
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
    q.delete('date');
    // Week/Month ranges are derived from `day` — never persist from/to (avoids stale week windows).
    if (view === 'agenda') {
      if (range.fromYmd !== rolling.fromYmd || range.toYmd !== rolling.toYmd) {
        q.set('from', range.fromYmd);
        q.set('to', range.toYmd);
      } else {
        q.delete('from');
        q.delete('to');
      }
    } else {
      q.delete('from');
      q.delete('to');
    }
    // Always persist focus for Week/Month so cross-month weeks (Nov 1 → Oct 26–Nov 1)
    // still restore November after refresh. Agenda omits day when it equals today.
    if (view === 'week' || view === 'month') q.set('day', focusYmd);
    else if (focusYmd && focusYmd !== todayIso) q.set('day', focusYmd);
    else q.delete('day');
    const qs = q.toString();
    const next = qs ? `${url.pathname}?${qs}` : url.pathname;
    const cur = `${url.pathname}${url.search}`;
    if (next !== cur) window.history.replaceState({}, '', next);
  }, [view, category, listingId, optionKey, includePast, range.fromYmd, range.toYmd, focusYmd, todayIso]);

  useEffect(() => {
    setExpandedKey(null);
    setMonthDaySheetIso(null);
  }, [view, category, listingId, optionKey, range.fromYmd, range.toYmd]);

  useEffect(() => {
    // Keep agenda From/To state normalized; Week/Month ignore fromYmd/toYmd state.
    if (view !== 'agenda') return;
    if (fromYmd !== range.fromYmd || toYmd !== range.toYmd) {
      setFromYmd(range.fromYmd);
      setToYmd(range.toYmd);
    }
  }, [view, fromYmd, toYmd, range.fromYmd, range.toYmd]);

  useEffect(() => {
    // Week/Month edit popovers handle their own outside-click + Escape.
    // This only closes the Month "+N more" day sheet.
    if (!monthDaySheetIso || view !== 'month') return;
    const onDoc = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('.partner-unified-cal__day-sheet')) return;
      if (el?.closest?.('.partner-unified-cal__more')) return;
      setMonthDaySheetIso(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [monthDaySheetIso, view]);

  useEffect(() => {
    if (view !== 'agenda') return;
    agendaRangeRef.current = { fromYmd: range.fromYmd, toYmd: range.toYmd };
  }, [view, range.fromYmd, range.toYmd]);

  const titlesByListingId = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of listings) map.set(l.id, l.title || 'Listing');
    return map;
  }, [listings]);

  const selectedListing = useMemo(
    () => (listingId ? listings.find((l) => l.id === listingId) ?? null : null),
    [listings, listingId]
  );
  const selectedFamily = selectedListing ? inventoryFamilyFromListing(selectedListing) : null;

  const scopedListings = useMemo(
    () => listingsForUnifiedCategoryFilter(listings, category),
    [listings, category]
  );

  const tourListingsInScope = useMemo(
    () => scopedListings.filter((l) => inventoryFamilyFromListing(l) === 'tour'),
    [scopedListings]
  );
  const stayListingsInScope = useMemo(
    () =>
      scopedListings.filter(
        (l) => inventoryFamilyFromListing(l) === 'stay' && l.status !== 'draft'
      ),
    [scopedListings]
  );
  const rentalListingsInScope = useMemo(
    () =>
      scopedListings.filter(
        (l) => inventoryFamilyFromListing(l) === 'rental' && l.status !== 'draft'
      ),
    [scopedListings]
  );

  /** Stable id keys — slot-override edits must not refetch caps/blocks for every listing. */
  const tourListingIdsKey = useMemo(
    () =>
      tourListingsInScope
        .map((l) => l.id)
        .sort()
        .join(','),
    [tourListingsInScope]
  );
  const stayListingIdsKey = useMemo(
    () =>
      stayListingsInScope
        .map((l) => l.id)
        .sort()
        .join(','),
    [stayListingsInScope]
  );
  const rentalListingIdsKey = useMemo(
    () =>
      rentalListingsInScope
        .map((l) => l.id)
        .sort()
        .join(','),
    [rentalListingsInScope]
  );

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
    const tourIds = tourListingIdsKey ? tourListingIdsKey.split(',').filter(Boolean) : [];
    const stayIds = stayListingIdsKey ? stayListingIdsKey.split(',').filter(Boolean) : [];
    const rentalIds = rentalListingIdsKey ? rentalListingIdsKey.split(',').filter(Boolean) : [];
    void (async () => {
      const notes: string[] = [];
      try {
        const needTourCaps = category === 'all' || category === 'tour';
        if (needTourCaps) {
          const nextCaps = new Map<string, Map<string, number>>();
          if (tourIds.length > 0) {
            const results = await Promise.all(
              tourIds.map(async (id) => {
                try {
                  const rows = await fetchAvailabilityByListingId(id, {
                    fromDate: range.fromYmd,
                    toDate: range.toYmd,
                  });
                  return { id, rows, ok: true as const };
                } catch {
                  return { id, rows: [], ok: false as const };
                }
              })
            );
            let failed = 0;
            for (const r of results) {
              if (!r.ok) failed += 1;
              const m = new Map<string, number>();
              for (const row of r.rows) m.set(row.available_date, Number(row.capacity));
              nextCaps.set(r.id, m);
            }
            if (failed > 0) {
              notes.push(
                `Closed-day overrides unavailable for ${failed} tour listing${failed === 1 ? '' : 's'}.`
              );
            }
          }
          if (!cancelled) setDayCapsByListing(nextCaps);
        }

        const needStayCaps = category === 'all' || category === 'stay';
        if (needStayCaps) {
          if (stayIds.length > 0) {
            try {
              const results = await Promise.all(
                stayIds.map(async (id) => {
                  try {
                    const rows = await fetchAvailabilityByListingId(id, {
                      fromDate: range.fromYmd,
                      toDate: range.toYmd,
                    });
                    return rows.map((r) => ({
                      listing_id: r.listing_id,
                      available_date: r.available_date,
                      capacity: Number(r.capacity),
                    }));
                  } catch {
                    return [] as Array<{
                      listing_id: string;
                      available_date: string;
                      capacity: number;
                    }>;
                  }
                })
              );
              if (!cancelled) setStayCaps(results.flat());
            } catch {
              if (!cancelled) {
                setStayCaps([]);
                notes.push('Stay blocks unavailable.');
              }
            }
          } else if (!cancelled) {
            setStayCaps([]);
          }
        } else if (!cancelled) {
          setStayCaps([]);
        }

        const needRentalBlocks = category === 'all' || category === 'rental';
        if (needRentalBlocks) {
          if (rentalIds.length > 0) {
            try {
              const start = partnerUnifiedDayBoundsUtc(range.fromYmd);
              const endExclusive = addCalendarDaysYmd(range.toYmd, 1) ?? range.toYmd;
              const endIso = `${endExclusive}T00:00:00.000Z`;
              const results = await Promise.all(
                rentalIds.map(async (id) => {
                  try {
                    const [blocks, holds] = await Promise.all([
                      fetchRentalAvailabilityBlocks(id, start.startIso, endIso),
                      fetchRentalInventoryHolds(id, start.startIso, endIso),
                    ]);
                    return { blocks, holds, ok: true as const };
                  } catch {
                    return { blocks: [], holds: [], ok: false as const };
                  }
                })
              );
              if (!cancelled) {
                setRentalBlocks(results.flatMap((r) => r.blocks));
                setRentalHolds(results.flatMap((r) => r.holds));
                if (results.some((r) => !r.ok)) {
                  notes.push('Some rental availability overlays could not be loaded.');
                }
              }
            } catch {
              if (!cancelled) {
                setRentalBlocks([]);
                setRentalHolds([]);
                notes.push('Rental blocks unavailable.');
              }
            }
          } else if (!cancelled) {
            setRentalBlocks([]);
            setRentalHolds([]);
          }
        } else if (!cancelled) {
          setRentalBlocks([]);
          setRentalHolds([]);
        }

        if (!cancelled) setVisibilityNote(notes[0] ?? null);
      } catch (e) {
        if (!cancelled) setVisibilityNote(userFacingError(e, USER_ERROR.calendar));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isSupabase,
    listings.length,
    tourListingIdsKey,
    stayListingIdsKey,
    rentalListingIdsKey,
    category,
    range.fromYmd,
    range.toYmd,
    calendarEpoch,
  ]);

  const bookingEvents = useMemo(
    () =>
      buildPartnerUnifiedCalendarEvents({
        bookings,
        fromYmd: range.fromYmd,
        toYmd: range.toYmd,
        titlesByListingId,
        includeOccupiedNights:
          view === 'agenda' ||
          view === 'week' ||
          Boolean(listingId && selectedFamily === 'stay'),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- calendarEpoch refresh
    [bookings, range.fromYmd, range.toYmd, titlesByListingId, view, listingId, selectedFamily, calendarEpoch]
  );

  const allEvents = useMemo(() => {
    const needTours = category === 'all' || category === 'tour';
    const needStays = category === 'all' || category === 'stay';
    const needRentals = category === 'all' || category === 'rental';
    const listingFilter = listingId || null;

    const tourDepartures = needTours
      ? buildPartnerUnifiedTourDepartureEvents({
          listings: tourListingsInScope,
          bookings,
          dayCaps: dayCapsByListing,
          fromYmd: range.fromYmd,
          toYmd: range.toYmd,
          listingIdFilter: listingFilter,
        })
      : [];

    const stayListings = listingFilter
      ? stayListingsInScope.filter((l) => l.id === listingFilter)
      : stayListingsInScope;
    const rentalListings = listingFilter
      ? rentalListingsInScope.filter((l) => l.id === listingFilter)
      : rentalListingsInScope;

    // Per-day stay/rental presence covers Available/Blocked/Occupied — do not also emit
    // stay_blocked / rental_block markers (would duplicate cards on the same nights).
    const stayPresence = needStays
      ? buildPartnerUnifiedStayPresenceEvents({
          listings: stayListings,
          bookings,
          caps: stayCaps,
          fromYmd: range.fromYmd,
          toYmd: range.toYmd,
          listingIdFilter: listingFilter,
        })
      : [];

    const rentalPresence = needRentals
      ? buildPartnerUnifiedRentalPresenceEvents({
          listings: rentalListings,
          blocks: rentalBlocks,
          holds: rentalHolds,
          fromYmd: range.fromYmd,
          toYmd: range.toYmd,
          listingIdFilter: listingFilter,
        })
      : [];
    const rentalOngoing = needRentals
      ? rentalListings.flatMap((listing) =>
          buildPartnerUnifiedRentalOngoingEvents({
            listing,
            bookings,
            fromYmd: range.fromYmd,
            toYmd: range.toYmd,
          })
        )
      : [];

    return mergePartnerUnifiedVisibilityEvents({
      bookingEvents,
      tourDepartures,
      stayPresence,
      stayBlocked: [],
      rentalPresence,
      rentalOngoing,
      rentalBlocks: [],
    });
  }, [
    bookingEvents,
    category,
    tourListingsInScope,
    stayListingsInScope,
    rentalListingsInScope,
    bookings,
    dayCapsByListing,
    range.fromYmd,
    range.toYmd,
    listingId,
    stayCaps,
    rentalBlocks,
    rentalHolds,
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

  const monthCells = useMemo(
    () => partnerUnifiedWeeksCoveringRange(range.fromYmd, range.toYmd),
    [range.fromYmd, range.toYmd]
  );

  const monthSummaries = useMemo(() => {
    const base = new Map<string, PartnerUnifiedMonthDaySummary>(
      monthCells.map((cell) => [
        cell.iso,
        { iso: cell.iso, total: 0, tour: 0, stay: 0, rental: 0 },
      ])
    );
    for (const e of filteredEvents) {
      const row = base.get(e.ymd);
      if (!row) continue;
      row.total += 1;
      if (e.category === 'tour') row.tour += 1;
      else if (e.category === 'stay') row.stay += 1;
      else row.rental += 1;
    }
    if (selectedListing && selectedFamily === 'stay') {
      return annotateStayMonthSummaries({
        summaries: base,
        listingId: selectedListing.id,
        bookings,
        caps: stayCaps,
      });
    }
    return base;
  }, [filteredEvents, monthCells, selectedListing, selectedFamily, bookings, stayCaps]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, PartnerUnifiedCalendarEvent[]>();
    for (const e of filteredEvents) {
      const list = map.get(e.ymd);
      if (list) list.push(e);
      else map.set(e.ymd, [e]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const ta = a.timeHm ?? '99:99';
        const tb = b.timeHm ?? '99:99';
        if (ta !== tb) return ta.localeCompare(tb);
        return a.key.localeCompare(b.key);
      });
    }
    return map;
  }, [filteredEvents]);

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
    if (listingId && !listingOptions.some((o) => o.value === listingId)) setListingId('');
  }, [listingId, listingOptions]);

  useEffect(() => {
    if (optionKey && !optionChoices.some((o) => o.value === optionKey)) setOptionKey('');
  }, [optionKey, optionChoices]);

  /** Keep one shared focus date; Week/Month ranges re-derive from it automatically. */
  const focusOnDate = (iso: string) => {
    setSelectedYmd(iso);
  };

  const selectView = (next: PartnerUnifiedCalendarView) => {
    if (next === view) return;
    const applied = partnerUnifiedApplyViewChange(
      {
        view,
        focusYmd,
        fromYmd: range.fromYmd,
        toYmd: range.toYmd,
        agendaRange: agendaRangeRef.current,
      },
      next
    );
    setSelectedYmd(applied.focusYmd);
    setView(applied.view);
    setFromYmd(applied.fromYmd);
    setToYmd(applied.toYmd);
    agendaRangeRef.current = applied.agendaRange;
  };

  const shiftRange = (direction: 1 | -1) => {
    const applied = partnerUnifiedApplyShift(
      {
        view,
        focusYmd,
        fromYmd: range.fromYmd,
        toYmd: range.toYmd,
        agendaRange: agendaRangeRef.current,
      },
      direction
    );
    setSelectedYmd(applied.focusYmd);
    setFromYmd(applied.fromYmd);
    setToYmd(applied.toYmd);
    agendaRangeRef.current = applied.agendaRange;
  };

  const goToday = () => {
    const iso =
      experienceTodayIsoForListing(selectedListing ?? undefined) || todayIso;
    setSelectedYmd(iso);
    if (view === 'agenda') {
      const rolling = partnerUnifiedRollingRange(iso);
      setFromYmd(rolling.fromYmd);
      setToYmd(rolling.toYmd);
      agendaRangeRef.current = rolling;
    }
  };

  const setRangeFrom = (iso: string) => {
    setSelectedYmd(iso);
    if (view === 'week' || view === 'month') return;
    const next = partnerUnifiedNormalizeRange(iso, toYmd < iso ? iso : toYmd, todayIso);
    setFromYmd(next.fromYmd);
    setToYmd(next.toYmd);
  };

  const setRangeTo = (iso: string) => {
    if (view === 'week' || view === 'month') {
      setSelectedYmd(iso);
      return;
    }
    const next = partnerUnifiedNormalizeRange(fromYmd, iso, todayIso);
    setFromYmd(next.fromYmd);
    setToYmd(next.toYmd);
    if (!partnerUnifiedFocusInRange(focusYmd, next.fromYmd, next.toYmd)) {
      setSelectedYmd(next.fromYmd);
    }
  };

  const periodLabel =
    view === 'week'
      ? formatPartnerUnifiedWeekLabel(range.fromYmd, range.toYmd)
      : view === 'month'
        ? formatPartnerUnifiedMonthLabel(range.fromYmd)
        : `${formatDayShort(range.fromYmd)} – ${formatDayShort(range.toYmd)}`;

  const refreshAfterEdit = useCallback(() => {
    void load().then(() => setCalendarEpoch((n) => n + 1));
  }, [load]);

  /** Week/Month saves: refresh availability overlays only — keep scroll + selected day. */
  const refreshAvailabilityLocal = useCallback(() => {
    setCalendarEpoch((n) => n + 1);
  }, []);

  /** Agenda ops: patch local caches only — never full-list reload. */
  const applyTourAgendaPatch = useCallback((patch: PartnerUnifiedAgendaTourPatch) => {
    if (patch.type === 'dayClosed') {
      setDayCapsByListing((prev) => {
        const next = new Map(prev);
        const listingMap = new Map(next.get(patch.listingId) ?? []);
        if (patch.closed) listingMap.set(patch.iso, 0);
        else listingMap.delete(patch.iso);
        next.set(patch.listingId, listingMap);
        return next;
      });
      return;
    }
    setListings((prev) => prev.map((l) => (l.id === patch.listing.id ? patch.listing : l)));
  }, []);

  const applyStayAgendaPatch = useCallback((patch: PartnerUnifiedAgendaStayPatch) => {
    setStayCaps((prev) => {
      const without = prev.filter(
        (r) => !(r.listing_id === patch.listingId && r.available_date === patch.iso)
      );
      if (patch.capacity == null) return without;
      return [
        ...without,
        {
          listing_id: patch.listingId,
          available_date: patch.iso,
          capacity: patch.capacity,
        },
      ];
    });
  }, []);

  const applyRentalAgendaPatch = useCallback((patch: PartnerUnifiedAgendaRentalPatch) => {
    if (patch.type === 'listing') {
      setListings((prev) => prev.map((l) => (l.id === patch.listing.id ? patch.listing : l)));
      return;
    }
    if (patch.type === 'rentalBlockAdd') {
      setRentalBlocks((prev) => {
        if (prev.some((b) => b.id === patch.block.id)) return prev;
        return [...prev, patch.block];
      });
      return;
    }
    setRentalBlocks((prev) => prev.filter((b) => !patch.blockIds.includes(b.id)));
  }, []);

  const toggleExpand = (key: string, event?: PartnerUnifiedCalendarEvent) => {
    if (event) {
      if (view === 'week' || view === 'month') focusOnDate(event.ymd);
      else setSelectedYmd(event.ymd);
    }
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  const listingForEvent = (event: PartnerUnifiedCalendarEvent) =>
    listings.find((l) => l.id === event.listingId) ?? null;

  const emptyPastHint =
    !includePast && range.toYmd < todayIso;

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
        title="Calendar"
        description="Upcoming operations across tours, stays, and rentals."
        actions={
          canEdit && listings.length > 0 ? (
            <button
              type="button"
              className="tv-btn-primary inline-flex min-h-10 items-center gap-1.5 px-3.5 text-sm font-semibold"
              onClick={() => setBulkOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Bulk edit
            </button>
          ) : null
        }
      />

      {error ? (
        <ErrorState title="Could not load" body={error} retry={{ onClick: () => void load() }} />
      ) : null}
      {visibilityNote ? (
        <p className="partner-unified-cal__note" role="status">
          {visibilityNote}
        </p>
      ) : null}

      <div className="partner-unified-cal__chrome">
        <div className="partner-unified-cal__toolbar">
          <div className="partner-unified-cal__toolbar-lead">
            <div className="partner-unified-cal__switch" role="tablist" aria-label="Calendar view">
              <button
                type="button"
                role="tab"
                aria-selected={view === 'agenda'}
                className={view === 'agenda' ? 'is-active' : undefined}
                onClick={() => selectView('agenda')}
              >
                Agenda
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'week'}
                className={view === 'week' ? 'is-active' : undefined}
                onClick={() => selectView('week')}
              >
                Week
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'month'}
                className={view === 'month' ? 'is-active' : undefined}
                onClick={() => selectView('month')}
              >
                Month
              </button>
            </div>

            <div className="partner-unified-cal__nav">
              <button
                type="button"
                className="partner-unified-cal__nav-btn"
                onClick={() => shiftRange(-1)}
                aria-label={view === 'week' ? 'Previous week' : 'Previous range'}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" className="partner-unified-cal__today" onClick={goToday}>
                Today
              </button>
              <button
                type="button"
                className="partner-unified-cal__nav-btn"
                onClick={() => shiftRange(1)}
                aria-label={view === 'week' ? 'Next week' : 'Next range'}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
              <p className="partner-unified-cal__period">{periodLabel}</p>
            </div>
          </div>

          <div className="partner-unified-cal__toolbar-controls">
            <div className="partner-unified-cal__range">
              <TraverionSingleDateField
                id="unified-cal-from"
                label="From"
                value={range.fromYmd}
                onChange={setRangeFrom}
                minIso=""
                tone="premium"
              />
              <TraverionSingleDateField
                id="unified-cal-to"
                label="To"
                value={range.toYmd}
                onChange={setRangeTo}
                minIso=""
                tone="premium"
              />
            </div>

            <div className="partner-unified-cal__filters">
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
              <PartnerSelect
                id="unified-cal-listing"
                aria-label="Listing"
                value={listingId}
                onChange={setListingId}
                options={listingOptions}
              />
              <PartnerSelect
                id="unified-cal-option"
                aria-label="Option"
                value={optionKey}
                onChange={setOptionKey}
                options={optionChoices}
                disabled={optionChoices.length <= 1}
              />
              <button
                type="button"
                className={`partner-unified-cal__history${includePast ? ' is-active' : ''}`}
                aria-pressed={includePast}
                onClick={() => setIncludePast((v) => !v)}
              >
                {includePast ? 'Past on' : 'Show past'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="partner-unified-cal__loading" aria-busy="true">
          Loading calendar…
        </div>
      ) : listings.length === 0 ? (
        <SupplierEmptyState
          icon={CalendarDays}
          title="No listings yet"
          body="Create a tour, stay, or rental to see operations here."
        />
      ) : view === 'agenda' ? (
        agendaGroups.length === 0 ? (
          <SupplierEmptyState
            icon={CalendarDays}
            title={emptyPastHint ? 'Past window' : 'Nothing upcoming'}
            body={
              emptyPastHint
                ? 'Past events are hidden. Turn on Show past, or jump to Today.'
                : 'No departures, stays, or rentals in this range.'
            }
            action={
              !includePast ? (
                <button
                  type="button"
                  className="tv-btn-secondary inline-flex min-h-10 items-center px-3 text-sm font-semibold"
                  onClick={() => setIncludePast(true)}
                >
                  Show past
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="partner-unified-cal__agenda">
            {agendaGroups.map((group) => (
              <section
                key={group.iso}
                className={`partner-unified-cal__day${group.iso === todayIso ? ' is-today' : ''}${
                  group.iso === selectedYmd ? ' is-selected' : ''
                }`}
              >
                <header className="partner-unified-cal__day-head">
                  <h2>
                    {formatDayHeading(group.iso)}
                    {group.iso === todayIso ? (
                      <span className="partner-unified-cal__today-pill">Today</span>
                    ) : null}
                  </h2>
                  <span>{group.events.length}</span>
                </header>
                <div className="partner-unified-cal__cards">
                  {group.events.map((event) => {
                    const expanded = expandedKey === event.key;
                    const listing = listingForEvent(event);
                    const status = statusText(event);
                    const inventory = inventoryLine(event);
                    const cutoff = cutoffCardLabel(event);
                    const optionLine = agendaOptionLine(event);
                    const blocked =
                      status === 'Blocked' || event.departureStatus === 'closed';
                    const isTourDeparture = event.kind === 'tour_departure';
                    const isStayAvail =
                      event.kind === 'stay_listing' || event.kind === 'stay_blocked';
                    const isRentalAvail =
                      event.kind === 'rental_listing' || event.kind === 'rental_block';
                    const isInlineAvailOps = isTourDeparture || isStayAvail || isRentalAvail;
                    const dayCap = event.listingId
                      ? dayCapsByListing.get(event.listingId)?.get(event.ymd)
                      : undefined;
                    const dayClosed =
                      blocked ||
                      (typeof dayCap === 'number' && Number.isFinite(dayCap) && dayCap < 1);
                    const rentalQty =
                      event.category === 'rental' &&
                      event.quantityLabel &&
                      !/^(Blocked|On rent)$/i.test(event.quantityLabel)
                        ? event.quantityLabel
                        : null;
                    const showGuest =
                      (event.category === 'stay' || event.category === 'rental') &&
                      Boolean(event.guestName || event.reference || rentalQty);
                    return (
                      <article
                        key={event.key}
                        className={`partner-unified-cal__card partner-unified-cal__card--${event.category}${
                          isInlineAvailOps ? ' partner-unified-cal__card--tour-ops' : ''
                        }${expanded ? ' is-expanded' : ''}${dayClosed || blocked ? ' is-blocked' : ''}${
                          event.departureStatus === 'cutoff' ? ' is-cutoff' : ''
                        }${event.departureStatus === 'sold_out' ? ' is-sold_out' : ''}`}
                      >
                        {isTourDeparture && listing ? (
                          <div
                            className="partner-unified-cal__card-main partner-unified-cal__card-main--tour-ops"
                            title={[event.listingTitle, optionLine].filter(Boolean).join(' · ')}
                          >
                            <span className="partner-unified-cal__card-time">
                              {event.timeHm ?? '—'}
                            </span>
                            <span className="partner-unified-cal__card-body">
                              <span className="partner-unified-cal__card-title">
                                {event.listingTitle}
                              </span>
                              {optionLine ? (
                                <span className="partner-unified-cal__card-option">
                                  {optionLine}
                                </span>
                              ) : null}
                              {status && status !== 'Blocked' ? (
                                <span
                                  className={`partner-unified-cal__badge${badgeToneClass(event, false)}`}
                                >
                                  {status}
                                </span>
                              ) : null}
                            </span>
                            <PartnerUnifiedAgendaTourControls
                              event={event}
                              listing={listing}
                              bookings={bookings}
                              canEdit={canEdit}
                              dayClosed={dayClosed}
                              onPatch={applyTourAgendaPatch}
                            />
                          </div>
                        ) : isStayAvail && listing ? (
                          <div
                            className="partner-unified-cal__card-main partner-unified-cal__card-main--tour-ops"
                            title={[event.listingTitle, formatDayHeading(event.ymd)]
                              .filter(Boolean)
                              .join(' · ')}
                          >
                            <span className="partner-unified-cal__card-time partner-unified-cal__card-time--muted">
                              Stay
                            </span>
                            <span className="partner-unified-cal__card-body">
                              <span className="partner-unified-cal__card-title">
                                {event.listingTitle}
                              </span>
                              <span className="partner-unified-cal__card-option">
                                {formatDayShort(event.ymd)}
                              </span>
                            </span>
                            <PartnerUnifiedAgendaStayControls
                              event={event}
                              listing={listing}
                              bookings={bookings}
                              stayCaps={stayCaps}
                              canEdit={canEdit}
                              onPatch={applyStayAgendaPatch}
                            />
                          </div>
                        ) : isRentalAvail && listing ? (
                          <div
                            className="partner-unified-cal__card-main partner-unified-cal__card-main--tour-ops"
                            title={[event.listingTitle, optionLine].filter(Boolean).join(' · ')}
                          >
                            <span className="partner-unified-cal__card-time partner-unified-cal__card-time--muted">
                              Rent
                            </span>
                            <span className="partner-unified-cal__card-body">
                              <span className="partner-unified-cal__card-title">
                                {event.listingTitle}
                              </span>
                              <span className="partner-unified-cal__card-option">
                                {[
                                  optionLine &&
                                  optionLine !== 'Inventory availability' &&
                                  optionLine !== 'All options'
                                    ? optionLine
                                    : null,
                                  formatDayShort(event.ymd),
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || formatDayShort(event.ymd)}
                              </span>
                            </span>
                            <PartnerUnifiedAgendaRentalControls
                              event={event}
                              listing={listing}
                              blocks={rentalBlocks}
                              holds={rentalHolds}
                              canEdit={canEdit}
                              userId={user?.id}
                              onPatch={applyRentalAgendaPatch}
                            />
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="partner-unified-cal__card-main"
                              onClick={() => {
                                setSelectedYmd(event.ymd);
                                toggleExpand(event.key, event);
                              }}
                              aria-expanded={expanded}
                              title={[event.listingTitle, optionLine].filter(Boolean).join(' · ')}
                            >
                              <span className="partner-unified-cal__card-time">
                                {event.timeHm ?? '—'}
                              </span>
                              <span className="partner-unified-cal__card-body">
                                <span className="partner-unified-cal__card-title">
                                  {event.listingTitle}
                                </span>
                                {optionLine ? (
                                  <span className="partner-unified-cal__card-option">
                                    {optionLine}
                                  </span>
                                ) : null}
                                {cutoff ? (
                                  <span className="partner-unified-cal__card-cutoff">{cutoff}</span>
                                ) : null}
                                {showGuest ? (
                                  <span className="partner-unified-cal__card-guest">
                                    {[event.guestName, rentalQty, event.reference]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </span>
                                ) : null}
                              </span>
                              <span className="partner-unified-cal__card-aside">
                                {status ? (
                                  <span
                                    className={`partner-unified-cal__badge${badgeToneClass(event, blocked)}`}
                                  >
                                    {status}
                                  </span>
                                ) : null}
                                {inventory && event.category === 'tour' ? (
                                  <span className="partner-unified-cal__card-inventory">
                                    {inventory}
                                  </span>
                                ) : null}
                              </span>
                            </button>
                            {expanded && listing ? (
                              <div className="partner-unified-cal__card-expand">
                                <PartnerUnifiedInlineAvailabilityEdit
                                  iso={event.ymd}
                                  listing={listing}
                                  bookings={bookings}
                                  event={event}
                                  canEdit={canEdit}
                                  userId={user?.id}
                                  onListingsChange={setListings}
                                  onSaved={refreshAfterEdit}
                                />
                              </div>
                            ) : null}
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )
      ) : view === 'week' ? (
        <PartnerUnifiedWeekView
          weekFromYmd={range.fromYmd}
          todayIso={todayIso}
          selectedYmd={selectedYmd}
          eventsByDay={eventsByDay}
          expandedKey={expandedKey}
          listings={listings}
          bookings={bookings}
          canEdit={canEdit}
          userId={user?.id}
          onSelectDay={focusOnDate}
          onToggleEvent={(event) => toggleExpand(event.key, event)}
          onCloseExpand={() => setExpandedKey(null)}
          onShowMoreDay={(iso) => {
            setSelectedYmd(iso);
            setFromYmd(iso);
            setToYmd(iso);
            agendaRangeRef.current = { fromYmd: iso, toYmd: iso };
            setView('agenda');
          }}
          onListingsChange={setListings}
          onSaved={refreshAvailabilityLocal}
        />
      ) : (
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
              const dayEvents = sortMonthCellEvents(eventsByDay.get(cell.iso) ?? []);
              const summary = monthSummaries.get(cell.iso);
              const nightKind = summary?.stayNightKind;
              const isToday = cell.iso === todayIso;
              const isSelected = cell.iso === selectedYmd;
              const daySheetOpen = monthDaySheetIso === cell.iso;
              const shown = dayEvents.slice(0, MONTH_CELL_MAX);
              const more = dayEvents.length - shown.length;
              return (
                <div
                  key={cell.iso}
                  role="gridcell"
                  className={[
                    'partner-unified-cal__cell',
                    cell.inRange ? '' : 'is-outside-range',
                    isToday ? 'is-today' : '',
                    isSelected ? 'is-selected' : '',
                    cell.iso < todayIso ? 'is-past' : '',
                    nightKind === 'blocked' ? 'is-blocked' : '',
                    nightKind === 'booked' ? 'is-booked' : '',
                    nightKind === 'available' && selectedFamily === 'stay' ? 'is-free' : '',
                    dayEvents.some(
                      (e) =>
                        e.departureStatus === 'closed' ||
                        e.kind === 'stay_blocked' ||
                        e.kind === 'rental_block'
                    )
                      ? 'has-blocked'
                      : '',
                    daySheetOpen ? 'is-day-sheet-open' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <button
                    type="button"
                    className="partner-unified-cal__cell-num"
                    onClick={() => {
                      focusOnDate(cell.iso);
                      setMonthDaySheetIso(null);
                      if (dayEvents[0]) toggleExpand(dayEvents[0].key, dayEvents[0]);
                      else setExpandedKey(null);
                    }}
                    aria-label={cell.iso}
                  >
                    {cell.day}
                  </button>
                  <div className="partner-unified-cal__cell-events">
                    {shown.map((event) => (
                      <MonthEventChip
                        key={event.key}
                        event={event}
                        expanded={expandedKey === event.key}
                        listing={listingForEvent(event)}
                        bookings={bookings}
                        canEdit={canEdit}
                        userId={user?.id}
                        onToggle={() => {
                          setMonthDaySheetIso(null);
                          toggleExpand(event.key, event);
                        }}
                        onClose={() => setExpandedKey(null)}
                        onListingsChange={setListings}
                        onSaved={refreshAvailabilityLocal}
                      />
                    ))}
                    {more > 0 ? (
                      <button
                        type="button"
                        className="partner-unified-cal__more"
                        onClick={(e) => {
                          e.stopPropagation();
                          focusOnDate(cell.iso);
                          setExpandedKey(null);
                          setMonthDaySheetIso(daySheetOpen ? null : cell.iso);
                        }}
                      >
                        +{more} more
                      </button>
                    ) : null}
                  </div>
                  {daySheetOpen ? (
                    <div
                      className="partner-unified-cal__day-sheet"
                      role="dialog"
                      aria-label={`Events on ${cell.iso}`}
                    >
                      <div className="partner-unified-cal__day-sheet-head">
                        <strong>
                          {new Date(`${cell.iso}T12:00:00`).toLocaleDateString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </strong>
                        <button
                          type="button"
                          className="partner-unified-cal__popover-close"
                          onClick={() => setMonthDaySheetIso(null)}
                          aria-label="Close"
                        >
                          ×
                        </button>
                      </div>
                      <ul className="partner-unified-cal__day-sheet-list">
                        {dayEvents.map((event) => (
                          <li key={event.key}>
                            <button
                              type="button"
                              className={`partner-unified-cal__day-sheet-item is-${event.category}`}
                              title={monthChipTitle(event)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setMonthDaySheetIso(null);
                                toggleExpand(event.key, event);
                              }}
                            >
                              <span className="partner-unified-cal__day-sheet-dot" aria-hidden />
                              <span className="partner-unified-cal__day-sheet-label">
                                {monthChipLabel(event)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
        onApplied={refreshAfterEdit}
      />
    </div>
  );
}
