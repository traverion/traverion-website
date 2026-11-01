/**
 * Unified Calendar — Monday–Sunday week grid with compact event tiles.
 */
import { useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { addCalendarDaysYmd } from '../../lib/booking-lifecycle-calendar';
import {
  partnerUnifiedEventKindLabel,
  type PartnerUnifiedCalendarEvent,
} from '../../lib/partner-unified-calendar';
import type { TourPackage } from '../../types/tour';
import type { BookingRow } from '../../data/supabase-bookings';
import PartnerUnifiedEventEditPopover from './PartnerUnifiedEventEditPopover';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEK_TILE_LIMIT = 6;

type Props = {
  weekFromYmd: string;
  todayIso: string;
  selectedYmd: string;
  eventsByDay: Map<string, PartnerUnifiedCalendarEvent[]>;
  expandedKey: string | null;
  listings: TourPackage[];
  bookings: BookingRow[];
  canEdit: boolean;
  userId?: string;
  onSelectDay: (iso: string) => void;
  onToggleEvent: (event: PartnerUnifiedCalendarEvent) => void;
  onCloseExpand: () => void;
  onShowMoreDay: (iso: string) => void;
  onListingsChange: Dispatch<SetStateAction<TourPackage[]>>;
  /** Local availability refresh — must not remount / scroll-reset the calendar. */
  onSaved: () => void;
};

function truncateLabel(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

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

function weekTilePrimary(event: PartnerUnifiedCalendarEvent): string {
  if (event.timeHm) return event.timeHm;
  if (event.kind === 'stay_listing') return 'Stay';
  if (event.kind === 'rental_listing') return 'Rent';
  if (event.kind === 'stay_check_in') return 'In';
  if (event.kind === 'stay_check_out') return 'Out';
  if (event.kind === 'stay_occupied') return 'Stay';
  if (event.kind === 'rental_ongoing') return 'Rent';
  return partnerUnifiedEventKindLabel(event.kind).slice(0, 4);
}

function weekTileTitle(event: PartnerUnifiedCalendarEvent): string {
  const listing = (event.listingTitle ?? '').trim();
  const option = (event.optionLabel ?? '').trim();
  if (event.category === 'tour') {
    return truncateLabel(option || listing || partnerUnifiedEventKindLabel(event.kind), 28);
  }
  if (event.category === 'stay') {
    return truncateLabel(listing || option || partnerUnifiedEventKindLabel(event.kind), 28);
  }
  const kind = partnerUnifiedEventKindLabel(event.kind);
  if (option) return truncateLabel(`${kind} · ${option}`, 28);
  return truncateLabel(listing || kind, 28);
}

function weekTileMeta(event: PartnerUnifiedCalendarEvent): string | null {
  if (event.category === 'tour' && event.bookedCount != null && event.capacityCount != null) {
    return `${event.bookedCount}/${event.capacityCount}`;
  }
  if (event.category === 'stay') {
    const guest = (event.guestName ?? '').trim();
    if (guest) return truncateLabel(guest, 18);
    const kind = partnerUnifiedEventKindLabel(event.kind);
    return kind !== weekTileTitle(event) ? kind : null;
  }
  if (event.category === 'rental') {
    const qty = (event.quantityLabel ?? '').trim();
    if (qty && !/^(Blocked|On rent)$/i.test(qty)) return truncateLabel(qty, 16);
    const guest = (event.guestName ?? '').trim();
    if (guest) return truncateLabel(guest, 16);
  }
  return statusText(event);
}

function weekTileTitleAttr(event: PartnerUnifiedCalendarEvent): string {
  return [
    event.timeHm,
    event.listingTitle?.trim(),
    event.optionLabel?.trim(),
    partnerUnifiedEventKindLabel(event.kind),
    event.guestName?.trim(),
    event.bookedCount != null && event.capacityCount != null
      ? `${event.bookedCount}/${event.capacityCount}`
      : null,
    statusText(event),
  ]
    .filter(Boolean)
    .join(' · ');
}

function WeekEventTile({
  event,
  expanded,
  listing,
  bookings,
  canEdit,
  userId,
  onToggleEvent,
  onCloseExpand,
  onListingsChange,
  onSaved,
}: {
  event: PartnerUnifiedCalendarEvent;
  expanded: boolean;
  listing: TourPackage | null;
  bookings: BookingRow[];
  canEdit: boolean;
  userId?: string;
  onToggleEvent: (event: PartnerUnifiedCalendarEvent) => void;
  onCloseExpand: () => void;
  onListingsChange: Dispatch<SetStateAction<TourPackage[]>>;
  onSaved: () => void;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const status = statusText(event);
  const meta = weekTileMeta(event);
  const blocked = status === 'Blocked' || event.departureStatus === 'closed';

  return (
    <div className="partner-unified-cal__week-tile-wrap">
      <button
        ref={anchorRef}
        type="button"
        className={`partner-unified-cal__week-tile is-${event.category}${
          expanded ? ' is-active' : ''
        }${blocked ? ' is-blocked' : ''}${
          event.departureStatus === 'sold_out' ? ' is-full' : ''
        }${event.departureStatus === 'cutoff' ? ' is-cutoff' : ''}`}
        title={weekTileTitleAttr(event)}
        aria-expanded={expanded}
        onClick={() => onToggleEvent(event)}
      >
        <span className="partner-unified-cal__week-tile-top">
          <span className="partner-unified-cal__week-tile-time">{weekTilePrimary(event)}</span>
          {status ? <span className="partner-unified-cal__week-tile-status">{status}</span> : null}
        </span>
        <span className="partner-unified-cal__week-tile-title">{weekTileTitle(event)}</span>
        {meta ? <span className="partner-unified-cal__week-tile-meta">{meta}</span> : null}
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
          onClose={onCloseExpand}
          onListingsChange={onListingsChange}
          onSaved={onSaved}
          panelClassName="partner-unified-cal__week-popover"
        />
      ) : null}
    </div>
  );
}

export default function PartnerUnifiedWeekView({
  weekFromYmd,
  todayIso,
  selectedYmd,
  eventsByDay,
  expandedKey,
  listings,
  bookings,
  canEdit,
  userId,
  onSelectDay,
  onToggleEvent,
  onCloseExpand,
  onShowMoreDay,
  onListingsChange,
  onSaved,
}: Props) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addCalendarDaysYmd(weekFromYmd, i) ?? weekFromYmd),
    [weekFromYmd]
  );

  return (
    <div className="partner-unified-cal__week" role="grid" aria-label="Week">
      <div className="partner-unified-cal__week-head" role="row">
        {days.map((iso, i) => {
          const isToday = iso === todayIso;
          const isSelected = iso === selectedYmd;
          const list = eventsByDay.get(iso) ?? [];
          const d = new Date(`${iso}T12:00:00Z`);
          return (
            <button
              key={iso}
              type="button"
              role="columnheader"
              className={`partner-unified-cal__week-day-label${isToday ? ' is-today' : ''}${
                isSelected ? ' is-selected' : ''
              }`}
              onClick={() => onSelectDay(iso)}
            >
              <span className="partner-unified-cal__week-wd">{WEEKDAYS[i]}</span>
              <span className="partner-unified-cal__week-num tabular-nums">{d.getUTCDate()}</span>
              <span
                className={`partner-unified-cal__week-count${list.length === 0 ? ' is-empty' : ''}`}
              >
                {list.length > 0 ? `${list.length}` : '—'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="partner-unified-cal__week-grid">
        {days.map((iso) => {
          const list = eventsByDay.get(iso) ?? [];
          const isToday = iso === todayIso;
          const isSelected = iso === selectedYmd;
          const visible = list.slice(0, WEEK_TILE_LIMIT);
          const overflow = list.length - visible.length;
          return (
            <div
              key={iso}
              role="gridcell"
              className={`partner-unified-cal__week-col${isToday ? ' is-today' : ''}${
                isSelected ? ' is-selected' : ''
              }${list.length === 0 ? ' is-empty' : ''}${iso < todayIso ? ' is-past' : ''}`}
            >
              {list.length === 0 ? (
                <button
                  type="button"
                  className="partner-unified-cal__week-empty lux-flat"
                  onClick={() => onSelectDay(iso)}
                >
                  No events
                </button>
              ) : (
                visible.map((event) => {
                  const listing = listings.find((l) => l.id === event.listingId) ?? null;
                  return (
                    <WeekEventTile
                      key={event.key}
                      event={event}
                      expanded={expandedKey === event.key}
                      listing={listing}
                      bookings={bookings}
                      canEdit={canEdit}
                      userId={userId}
                      onToggleEvent={onToggleEvent}
                      onCloseExpand={onCloseExpand}
                      onListingsChange={onListingsChange}
                      onSaved={onSaved}
                    />
                  );
                })
              )}
              {overflow > 0 ? (
                <button
                  type="button"
                  className="partner-unified-cal__more"
                  onClick={() => onShowMoreDay(iso)}
                >
                  +{overflow} more
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
