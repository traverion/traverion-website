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
}: {
  guestName: string;
  propertyTitle: string;
  whenLabel?: string | null;
  referenceLabel?: string | null;
  statusLabel?: string | null;
  actions?: ReactNode;
}) {
  return (
    <aside className="stay-ops-booking-summary" aria-label="Booking summary">
      <div className="stay-ops-booking-summary__main">
        <p className="stay-ops-booking-summary__guest">{guestName}</p>
        <p className="stay-ops-booking-summary__property" title={propertyTitle}>
          {propertyTitle}
        </p>
        <div className="stay-ops-booking-summary__meta">
          {whenLabel ? <span>{whenLabel}</span> : null}
          {referenceLabel ? <span className="stay-ops-booking-summary__ref">{referenceLabel}</span> : null}
          {statusLabel ? <span>{statusLabel}</span> : null}
        </div>
      </div>
      {actions ? <div className="stay-ops-booking-summary__actions">{actions}</div> : null}
    </aside>
  );
}
