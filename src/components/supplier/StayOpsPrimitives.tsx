/**
 * Shared Stay Ops visual primitives — compact hospitality UI building blocks.
 * Used by Reservations, reservation details, Inbox booking context, and Stay Calendar.
 */
import type { ReactNode } from 'react';

export function StayOpsPanel({
  title,
  children,
  span,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  span?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`stay-ops-detail__panel${span ? ' stay-ops-detail__panel--span' : ''}${className ? ` ${className}` : ''}`}
    >
      {title ? <h3 className="stay-ops-detail__panel-title">{title}</h3> : null}
      {children}
    </section>
  );
}

export function StayOpsFact({
  label,
  children,
  emphasize,
}: {
  label: string;
  children: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div className="stay-ops-detail__fact">
      <dt>{label}</dt>
      <dd className={emphasize ? 'tabular-nums font-semibold' : undefined}>{children}</dd>
    </div>
  );
}

export function StayOpsMoneyStack({
  rows,
}: {
  rows: Array<{ label: string; value: string; tone?: 'default' | 'muted' | 'earn' }>;
}) {
  return (
    <ul className="stay-ops-money" aria-label="Payment breakdown">
      {rows.map((row) => (
        <li
          key={row.label}
          className={`stay-ops-money__row${row.tone === 'earn' ? ' stay-ops-money__row--earn' : ''}${row.tone === 'muted' ? ' stay-ops-money__row--muted' : ''}`}
        >
          <span className="stay-ops-money__label">{row.label}</span>
          <span className="stay-ops-money__value">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function StayOpsInOut({
  checkInLabel,
  checkInValue,
  checkInMeta,
  checkOutLabel,
  checkOutValue,
  checkOutMeta,
}: {
  checkInLabel?: string;
  checkInValue: string;
  checkInMeta?: string | null;
  checkOutLabel?: string;
  checkOutValue: string;
  checkOutMeta?: string | null;
}) {
  return (
    <div className="stay-ops-detail__inout">
      <div className="stay-ops-detail__inout-block">
        <p className="stay-ops-detail__inout-label">{checkInLabel ?? 'Arrival'}</p>
        <p className="stay-ops-detail__inout-value">{checkInValue}</p>
        {checkInMeta ? <p className="stay-ops-detail__inout-time">{checkInMeta}</p> : null}
      </div>
      <div className="stay-ops-detail__inout-block">
        <p className="stay-ops-detail__inout-label">{checkOutLabel ?? 'Departure'}</p>
        <p className="stay-ops-detail__inout-value">{checkOutValue}</p>
        {checkOutMeta ? <p className="stay-ops-detail__inout-time">{checkOutMeta}</p> : null}
      </div>
    </div>
  );
}

export function StayOpsSegmentedControl({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="stay-ops-segment" role="tablist" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          className={`stay-ops-segment__btn${value === opt.id ? ' is-active' : ''}`}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function StayOpsBookingSummary({
  guestName,
  propertyTitle,
  whenLabel,
  referenceLabel,
  statusLabel,
  actions,
  /** When true, omit guest/property (already shown in the conversation header). */
  compact = false,
}: {
  guestName?: string | null;
  propertyTitle?: string | null;
  whenLabel?: string | null;
  referenceLabel?: string | null;
  statusLabel?: string | null;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <aside className={`stay-ops-booking-summary${compact ? ' stay-ops-booking-summary--compact' : ''}`} aria-label="Booking summary">
      <div className="stay-ops-booking-summary__main">
        {!compact && guestName ? <p className="stay-ops-booking-summary__guest">{guestName}</p> : null}
        {!compact && propertyTitle ? (
          <p className="stay-ops-booking-summary__property" title={propertyTitle}>
            {propertyTitle}
          </p>
        ) : null}
        <div className="stay-ops-booking-summary__meta">
          {compact && propertyTitle ? <span className="stay-ops-booking-summary__property-inline">{propertyTitle}</span> : null}
          {whenLabel ? <span>{whenLabel}</span> : null}
          {referenceLabel ? <span className="stay-ops-booking-summary__ref">{referenceLabel}</span> : null}
          {statusLabel ? <span>{statusLabel}</span> : null}
        </div>
      </div>
      {actions ? <div className="stay-ops-booking-summary__actions">{actions}</div> : null}
    </aside>
  );
}

export type StayOpsTimelineItem = {
  id: string;
  label: string;
  detail?: string | null;
  at: string | null;
};

/** Compact chronological booking activity strip. */
export function StayOpsTimeline({ items }: { items: StayOpsTimelineItem[] }) {
  if (items.length === 0) {
    return <p className="stay-ops-timeline__empty">No activity recorded yet.</p>;
  }
  return (
    <ol className="stay-ops-timeline">
      {items.map((item) => (
        <li key={item.id} className="stay-ops-timeline__item">
          <span className="stay-ops-timeline__dot" aria-hidden />
          <div className="stay-ops-timeline__body">
            <p className="stay-ops-timeline__label">
              {item.label}
              {item.detail ? <span className="stay-ops-timeline__detail"> · {item.detail}</span> : null}
            </p>
            {item.at ? (
              <time className="stay-ops-timeline__time" dateTime={item.at}>
                {new Date(item.at).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </time>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
