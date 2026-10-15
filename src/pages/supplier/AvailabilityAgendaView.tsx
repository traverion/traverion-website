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

function formatDayHeading(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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
                    aria-label={`Select all departures on ${formatDayHeading(g.iso)}`}
                  />
                </label>
              ) : null}
              <h3>{formatDayHeading(g.iso)}</h3>
              <span className="tv-avail-agenda__count">
                {g.rows.length} departure{g.rows.length === 1 ? '' : 's'}
              </span>
            </div>
            <ul className="tv-avail-agenda__list">
              {g.rows.map((r) => (
                <li key={r.key} className="tv-avail-agenda__row">
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
                        <span className="tv-avail-agenda__product">{r.listingTitle}</span>
                      ) : null}
                      <span className="tv-avail-agenda__option">{r.optionName}</span>
                    </span>
                    <span className="tv-avail-agenda__meta">
                      <span
                        className="tv-avail-agenda__seats tabular-nums"
                        title="Booked / Capacity"
                      >
                        {r.booked}/{r.capacity}
                      </span>
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
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
