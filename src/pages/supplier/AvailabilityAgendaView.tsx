import AvailabilityOccupancyMeter from './AvailabilityOccupancyMeter';
import { statusLabel, type WorkspaceDeparture } from './availabilityWorkspaceModel';
import { groupDeparturesByDate } from './availabilityWorkspaceModel';

type Props = {
  rows: WorkspaceDeparture[];
  selectedKeys: Set<string>;
  onToggleKey: (key: string) => void;
  onToggleDate: (iso: string, keys: string[]) => void;
  onOpenDate: (iso: string, listingId: string) => void;
  canEdit: boolean;
  /** When a single product is selected, hide repeated product titles. */
  hideProductTitle?: boolean;
};

function formatDayHeading(iso: string): { weekday: string; date: string } {
  const d = new Date(`${iso}T12:00:00`);
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'long' }),
    date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

function guestsBookedInGroup(rows: WorkspaceDeparture[]): number {
  return rows.reduce((n, r) => n + Math.max(0, r.booked), 0);
}

export default function AvailabilityAgendaView({
  rows,
  selectedKeys,
  onToggleKey,
  onToggleDate,
  onOpenDate,
  canEdit,
  hideProductTitle = false,
}: Props) {
  const groups = groupDeparturesByDate(rows);

  if (groups.length === 0) {
    return (
      <div className="tv-avail-empty">
        <p className="tv-avail-empty__title">No departures in this range</p>
        <p className="tv-avail-empty__body">
          Adjust the date range, product, option, or status filters to see upcoming inventory.
        </p>
      </div>
    );
  }

  return (
    <div className="tv-avail-agenda">
      {groups.map((g) => {
        const keys = g.rows.map((r) => r.key);
        const allSelected = keys.length > 0 && keys.every((k) => selectedKeys.has(k));
        const someSelected = keys.some((k) => selectedKeys.has(k));
        const heading = formatDayHeading(g.iso);
        const guests = guestsBookedInGroup(g.rows);
        return (
          <section key={g.iso} className="tv-avail-agenda__day">
            <div className="tv-avail-agenda__day-head">
              {canEdit ? (
                <label className="tv-avail-check">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allSelected;
                    }}
                    onChange={() => onToggleDate(g.iso, keys)}
                    aria-label={`Select all departures on ${heading.weekday} ${heading.date}`}
                  />
                </label>
              ) : null}
              <div className="tv-avail-agenda__day-titles">
                <h3>
                  <span className="tv-avail-agenda__weekday">{heading.weekday}</span>
                  <span className="tv-avail-agenda__date">{heading.date}</span>
                </h3>
                <p className="tv-avail-agenda__count">
                  {g.rows.length} departure{g.rows.length === 1 ? '' : 's'}
                  {guests > 0 ? (
                    <span>
                      {' '}
                      · {guests} guest{guests === 1 ? '' : 's'} booked
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            <ul className="tv-avail-agenda__list">
              {g.rows.map((r) => {
                const bookable = r.status === 'available' || r.status === 'limited';
                return (
                  <li key={r.key} className="tv-avail-agenda__row" data-status={r.status}>
                    {canEdit ? (
                      <label className="tv-avail-check">
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(r.key)}
                          onChange={() => onToggleKey(r.key)}
                          aria-label={`Select ${r.startTimeHm} ${r.optionName}`}
                        />
                      </label>
                    ) : null}
                    <button
                      type="button"
                      className="tv-avail-agenda__main lux-flat"
                      onClick={() => onOpenDate(r.iso, r.listingId)}
                    >
                      <span className="tv-avail-agenda__time">{r.startTimeHm}</span>
                      <span className="tv-avail-agenda__names">
                        {!hideProductTitle ? (
                          <span className="tv-avail-agenda__product" title={r.listingTitle}>
                            {r.listingTitle}
                          </span>
                        ) : null}
                        <span className="tv-avail-agenda__option" title={r.optionName}>
                          {r.optionName}
                        </span>
                      </span>
                      <span className="tv-avail-agenda__meta">
                        <AvailabilityOccupancyMeter
                          booked={r.booked}
                          capacity={r.capacity}
                          bookable={bookable}
                        />
                        <span className="tv-avail-agenda__cutoff">{r.cutoffLabel}</span>
                        <span
                          className={`tv-avail-pill tv-avail-pill--${r.status}`}
                          data-status={r.status}
                        >
                          {statusLabel(r.status)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
