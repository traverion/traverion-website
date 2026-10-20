import { addCalendarDays } from '../../lib/stayOccupancy';
import AvailabilityOccupancyMeter from './AvailabilityOccupancyMeter';
import { statusLabel, type WorkspaceDeparture } from './availabilityWorkspaceModel';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEK_TILE_LIMIT = 8;

type Props = {
  weekFromIso: string;
  todayIso: string;
  rows: WorkspaceDeparture[];
  onOpenDate: (iso: string, listingId: string) => void;
  /** Optional: expand a day that overflowed the tile limit. */
  onShowMoreDay?: (iso: string) => void;
};

export default function AvailabilityWeekView({
  weekFromIso,
  todayIso,
  rows,
  onOpenDate,
  onShowMoreDay,
}: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addCalendarDays(weekFromIso, i));
  const byDay = new Map<string, WorkspaceDeparture[]>();
  for (const r of rows) {
    const list = byDay.get(r.iso);
    if (list) list.push(r);
    else byDay.set(r.iso, [r]);
  }

  return (
    <div className="tv-avail-week">
      <div className="tv-avail-week__head" aria-hidden>
        {days.map((iso, i) => {
          const d = new Date(`${iso}T12:00:00`);
          const isToday = iso === todayIso;
          const list = byDay.get(iso) ?? [];
          const guests = list.reduce((n, r) => n + Math.max(0, r.booked), 0);
          return (
            <div key={iso} className={`tv-avail-week__day-label ${isToday ? 'is-today' : ''}`}>
              <span className="tv-avail-week__wd">{WEEKDAYS[i]}</span>
              <span className="tv-avail-week__num tabular-nums">{d.getUTCDate()}</span>
              {list.length > 0 ? (
                <span className="tv-avail-week__summary">
                  {list.length} dep{guests > 0 ? ` · ${guests}g` : ''}
                </span>
              ) : (
                <span className="tv-avail-week__summary tv-avail-week__summary--empty">—</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="tv-avail-week__grid">
        {days.map((iso) => {
          const list = byDay.get(iso) ?? [];
          const isToday = iso === todayIso;
          const visible = list.slice(0, WEEK_TILE_LIMIT);
          const overflow = list.length - visible.length;
          return (
            <div
              key={iso}
              className={`tv-avail-week__col ${isToday ? 'is-today' : ''}${
                list.length === 0 ? ' is-empty' : ''
              }`}
            >
              {list.length === 0 ? (
                <button
                  type="button"
                  className="tv-avail-week__empty lux-flat"
                  onClick={() => onOpenDate(iso, '')}
                >
                  No departures
                </button>
              ) : (
                visible.map((r) => {
                  const bookable = r.status === 'available' || r.status === 'limited';
                  return (
                    <button
                      key={r.key}
                      type="button"
                      className={`tv-avail-week__tile tv-avail-week__tile--${r.status} lux-flat`}
                      title={`${r.startTimeHm} · ${r.listingTitle} · ${r.optionName} · Booked / Capacity ${r.booked}/${r.capacity} · ${statusLabel(r.status)}`}
                      onClick={() => onOpenDate(r.iso, r.listingId)}
                    >
                      <span className="tv-avail-week__tile-top">
                        <span className="tv-avail-week__tile-time">{r.startTimeHm}</span>
                        <span
                          className={`tv-avail-week__tile-dot tv-avail-week__tile-dot--${r.status}`}
                          aria-hidden
                        />
                      </span>
                      <span className="tv-avail-week__tile-name" title={r.optionName}>
                        {r.optionName}
                      </span>
                      <AvailabilityOccupancyMeter
                        booked={r.booked}
                        capacity={r.capacity}
                        bookable={bookable}
                        size="sm"
                      />
                      <span className="sr-only">{statusLabel(r.status)}</span>
                    </button>
                  );
                })
              )}
              {overflow > 0 ? (
                <button
                  type="button"
                  className="tv-avail-week__more lux-flat"
                  onClick={() => {
                    if (onShowMoreDay) onShowMoreDay(iso);
                    else onOpenDate(iso, list[0]?.listingId ?? '');
                  }}
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
