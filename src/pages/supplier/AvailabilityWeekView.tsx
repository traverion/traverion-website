import { addCalendarDays } from '../../lib/stayOccupancy';
import { statusLabel, type WorkspaceDeparture } from './availabilityWorkspaceModel';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Props = {
  weekFromIso: string;
  todayIso: string;
  rows: WorkspaceDeparture[];
  onOpenDate: (iso: string, listingId: string) => void;
};

export default function AvailabilityWeekView({
  weekFromIso,
  todayIso,
  rows,
  onOpenDate,
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
          return (
            <div key={iso} className={`tv-avail-week__day-label ${isToday ? 'is-today' : ''}`}>
              <span className="tv-avail-week__wd">{WEEKDAYS[i]}</span>
              <span className="tv-avail-week__num tabular-nums">{d.getUTCDate()}</span>
            </div>
          );
        })}
      </div>
      <div className="tv-avail-week__grid">
        {days.map((iso) => {
          const list = byDay.get(iso) ?? [];
          const isToday = iso === todayIso;
          return (
            <div
              key={iso}
              className={`tv-avail-week__col ${isToday ? 'is-today' : ''}`}
            >
              {list.length === 0 ? (
                <button
                  type="button"
                  className="tv-avail-week__empty lux-flat"
                  onClick={() => onOpenDate(iso, '')}
                >
                  —
                </button>
              ) : (
                list.slice(0, 12).map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    className={`tv-avail-week__tile tv-avail-week__tile--${r.status} lux-flat`}
                    title={`${r.startTimeHm} · ${r.listingTitle} · ${r.optionName} · ${r.remaining}/${r.capacity}`}
                    onClick={() => onOpenDate(r.iso, r.listingId)}
                  >
                    <span className="tv-avail-week__tile-time">{r.startTimeHm}</span>
                    <span className="tv-avail-week__tile-name">{r.optionName}</span>
                    <span className="tv-avail-week__tile-seats tabular-nums">
                      {r.remaining}/{r.capacity}
                    </span>
                    <span className="sr-only">{statusLabel(r.status)}</span>
                  </button>
                ))
              )}
              {list.length > 12 ? (
                <p className="tv-avail-week__more">+{list.length - 12} more</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
