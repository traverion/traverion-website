/**
 * Mission 05.1 — Unified Partner Calendar (read-only).
 * Agenda (default) + Month across Tours, Stays, and Rentals.
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
import { fetchMyListings } from '../../data/supabase-listings';
import { fetchBookingsForSupplier, type BookingRow } from '../../data/supabase-bookings';
import type { TourPackage } from '../../types/tour';
import { experienceTodayIsoForListing } from '../../lib/booking-quote';
import { buildMonthCells } from '../../lib/availability-ops';
import { localYmd } from '../../lib/local-ymd';
import { addCalendarDaysYmd } from '../../lib/booking-lifecycle-calendar';
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
import { openSupplierBooking } from '../../lib/supplierPortalNavigation';
import {
  SUPPLIER_PAGE_CLASS,
  SupplierEmptyState,
  SupplierPageHero,
} from '../../components/supplier/supplierUi';
import PartnerSelect from '../../components/supplier/PartnerSelect';
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

function formatMonthLabel(year: number, monthIndex0: number): string {
  return new Date(Date.UTC(year, monthIndex0, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function CategoryGlyph({ category }: { category: PartnerUnifiedCalendarEvent['category'] }) {
  if (category === 'stay') return <BedDouble className="h-3.5 w-3.5" aria-hidden />;
  if (category === 'rental') return <KeyRound className="h-3.5 w-3.5" aria-hidden />;
  return <Compass className="h-3.5 w-3.5" aria-hidden />;
}

function EventRow({ event }: { event: PartnerUnifiedCalendarEvent }) {
  return (
    <button
      type="button"
      className="partner-unified-cal__row"
      onClick={() => openSupplierBooking(event.bookingId, { family: event.category })}
    >
      <span className={`partner-unified-cal__kind partner-unified-cal__kind--${event.category}`}>
        <CategoryGlyph category={event.category} />
        <span>{partnerUnifiedEventKindLabel(event.kind)}</span>
      </span>
      <span className="partner-unified-cal__time">{event.timeHm ?? '—'}</span>
      <span className="partner-unified-cal__body">
        <span className="partner-unified-cal__title">{event.listingTitle}</span>
        <span className="partner-unified-cal__meta">
          {[
            event.guestName,
            event.metaLine,
            event.reference,
            partnerUnifiedCategoryLabel(event.category),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
    </button>
  );
}

export default function SupplierUnifiedCalendar() {
  const { user, isSupabase } = useSupplierAuth();
  const todayIso = useMemo(() => experienceTodayIsoForListing(undefined) || localYmd(new Date()), []);

  const initial = useMemo(() => {
    const q = readSearch();
    return {
      view: parsePartnerUnifiedCalendarView(q.get('view')),
      category: parsePartnerUnifiedCategoryFilter(q.get('category')),
      listingId: (q.get('listing') ?? '').trim(),
      optionKey: (q.get('option') ?? '').trim(),
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
  const [anchorYmd, setAnchorYmd] = useState(initial.anchorYmd);
  const [selectedYmd, setSelectedYmd] = useState(initial.selectedYmd);
  const [listings, setListings] = useState<TourPackage[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    if (anchorYmd !== todayIso) q.set('date', anchorYmd);
    else q.delete('date');
    if (view === 'month' && selectedYmd) q.set('day', selectedYmd);
    else q.delete('day');
    const qs = q.toString();
    window.history.replaceState({}, '', qs ? `${url.pathname}?${qs}` : url.pathname);
  }, [view, category, listingId, optionKey, anchorYmd, selectedYmd, todayIso]);

  const titlesByListingId = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of listings) map.set(l.id, l.title || 'Listing');
    return map;
  }, [listings]);

  const range = useMemo(() => {
    if (view === 'month') return partnerUnifiedMonthRange(year, monthIndex0);
    return partnerUnifiedAgendaRange(anchorYmd);
  }, [view, year, monthIndex0, anchorYmd]);

  const allEvents = useMemo(
    () =>
      buildPartnerUnifiedCalendarEvents({
        bookings,
        fromYmd: range.fromYmd,
        toYmd: range.toYmd,
        titlesByListingId,
        includeOccupiedNights: view === 'agenda',
      }),
    [bookings, range.fromYmd, range.toYmd, titlesByListingId, view]
  );

  const filteredEvents = useMemo(
    () =>
      filterPartnerUnifiedCalendarEvents(allEvents, {
        category,
        listingId: listingId || null,
        optionKey: optionKey || null,
      }),
    [allEvents, category, listingId, optionKey]
  );

  const agendaGroups = useMemo(
    () => groupPartnerUnifiedEventsByDate(filteredEvents),
    [filteredEvents]
  );

  const monthCells = useMemo(() => buildMonthCells(year, monthIndex0), [year, monthIndex0]);
  const monthSummaries = useMemo(
    () => summarizePartnerUnifiedMonthDays(filteredEvents, year, monthIndex0),
    [filteredEvents, year, monthIndex0]
  );

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
    const base = partnerUnifiedOptionChoices(
      filterPartnerUnifiedCalendarEvents(allEvents, {
        category,
        listingId: listingId || null,
        optionKey: null,
      })
    );
    return [{ value: '', label: 'All options' }, ...base];
  }, [allEvents, category, listingId]);

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
        description="All tours, stays, and rentals in one place. Read-only — editing arrives next."
      />

      {error ? (
        <ErrorState title="Could not load" body={error} retry={{ onClick: () => void load() }} />
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
            className="tv-btn-secondary inline-flex min-h-10 items-center gap-1 px-2.5"
            onClick={() => (view === 'month' ? shiftMonth(-1) : shiftAgenda(-7))}
            aria-label={view === 'month' ? 'Previous month' : 'Previous week'}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            className="tv-btn-secondary inline-flex min-h-10 items-center px-3 text-sm font-semibold"
            onClick={goToday}
          >
            Today
          </button>
          <button
            type="button"
            className="tv-btn-secondary inline-flex min-h-10 items-center gap-1 px-2.5"
            onClick={() => (view === 'month' ? shiftMonth(1) : shiftAgenda(7))}
            aria-label={view === 'month' ? 'Next month' : 'Next week'}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <p className="partner-unified-cal__period">
            {view === 'month'
              ? formatMonthLabel(year, monthIndex0)
              : `${formatDayHeading(range.fromYmd).replace(/,.*/, '')} – ${formatDayHeading(range.toYmd)}`}
          </p>
        </div>
      </div>

      <div className="partner-unified-cal__filters tv-avail-filters">
        <div className="tv-avail-filters__field">
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
        <div className="tv-avail-filters__field tv-avail-filters__field--grow">
          <label htmlFor="unified-cal-listing">Listing</label>
          <PartnerSelect
            id="unified-cal-listing"
            aria-label="Listing"
            value={listingId}
            onChange={setListingId}
            options={listingOptions}
          />
        </div>
        <div className="tv-avail-filters__field">
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
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted">Loading calendar…</p>
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
            title="Nothing in this window"
            body="Try another date range or clear filters. Family calendars still manage availability."
          />
        ) : (
          <div className="partner-unified-cal__agenda">
            {agendaGroups.map((group) => (
              <section key={group.iso} className="partner-unified-cal__day">
                <header className="partner-unified-cal__day-head">
                  <h2>
                    {formatDayHeading(group.iso)}
                    {group.iso === todayIso ? (
                      <span className="partner-unified-cal__today-pill">Today</span>
                    ) : null}
                  </h2>
                </header>
                <div className="partner-unified-cal__day-list">
                  {group.events.map((event) => (
                    <EventRow key={event.key} event={event} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="partner-unified-cal__month-layout">
          <div className="partner-unified-cal__month partner-avail-month" role="grid" aria-label="Month">
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
                const count = summary?.total ?? 0;
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
                      count > 0 ? 'has-events' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setSelectedYmd(cell.iso)}
                    aria-label={`${cell.iso}${count ? `, ${count} events` : ''}`}
                    aria-pressed={isSelected}
                  >
                    <span className="partner-unified-cal__cell-num">{cell.day}</span>
                    {count > 0 ? (
                      <span className="partner-unified-cal__cell-count">{count}</span>
                    ) : null}
                    <span className="partner-unified-cal__dots" aria-hidden>
                      {(summary?.tour ?? 0) > 0 ? <i className="is-tour" /> : null}
                      {(summary?.stay ?? 0) > 0 ? <i className="is-stay" /> : null}
                      {(summary?.rental ?? 0) > 0 ? <i className="is-rental" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="partner-unified-cal__side">
            <header className="partner-unified-cal__day-head">
              <h2>
                {formatDayHeading(selectedYmd)}
                {selectedYmd === todayIso ? (
                  <span className="partner-unified-cal__today-pill">Today</span>
                ) : null}
              </h2>
            </header>
            {selectedDayEvents.length === 0 ? (
              <p className="text-sm text-ink-muted">No bookings on this day.</p>
            ) : (
              <div className="partner-unified-cal__day-list">
                {selectedDayEvents.map((event) => (
                  <EventRow key={event.key} event={event} />
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
