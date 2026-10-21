/**
 * Expandable Stay reservation row — same visual shell as TourOpsBookingCard,
 * with Stay-specific fields (property, nights, check-in/out).
 */
import { type MouseEvent, type ReactNode } from 'react';
import { CalendarDays, ChevronDown, Copy, Mail, Users } from 'lucide-react';

export type StayOpsCardModel = {
  id: string;
  listingTitle: string;
  imageUrl: string | null;
  guestName: string;
  dateLine: string;
  participantLabel: string;
  nightLabel: string;
  statusLabel: string;
  statusClass: string;
  referenceLabel: string;
  purchaseDateLabel: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  guestNotes: string | null;
  warning: string | null;
  checkInLabel: string;
  checkOutLabel: string;
  accessSummary: string | null;
  guestPaidLabel: string | null;
  commissionLabel: string | null;
  commissionRateLabel: string | null;
  earningsLabel: string | null;
  financeLoading: boolean;
  paymentLabel: string;
};

type Props = {
  model: StayOpsCardModel;
  expanded: boolean;
  selected: boolean;
  busy?: boolean;
  checkbox: ReactNode;
  onToggleExpand: () => void;
  onOpenDetails: () => void;
  onMessageGuest: () => void;
  onCopyReference: () => void;
  copied?: boolean;
};

export default function StayOpsReservationCard({
  model,
  expanded,
  selected,
  checkbox,
  onToggleExpand,
  onOpenDetails,
  onMessageGuest,
  onCopyReference,
  copied,
}: Props) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  const secondaryLine = [model.guestName, model.nightLabel].filter(Boolean).join(' · ');

  return (
    <article
      id={`supplier-booking-row-${model.id}`}
      data-highlight={selected ? 'true' : 'false'}
      data-attention={model.warning ? 'true' : 'false'}
      data-expanded={expanded ? 'true' : 'false'}
      className={`tour-ops-card${expanded ? ' is-expanded' : ''}`}
    >
      <div className="tour-ops-card__main">
        <div className="tour-ops-card__check" onClick={stop}>
          {checkbox}
        </div>
        <button
          type="button"
          className="tour-ops-card__hit lux-flat"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} reservation for ${model.listingTitle}`}
          onClick={onToggleExpand}
        >
          {model.imageUrl ? (
            <img src={model.imageUrl} alt="" className="tour-ops-card__thumb" />
          ) : (
            <div className="tour-ops-card__thumb tour-ops-card__thumb--empty" aria-hidden />
          )}
          <div className="tour-ops-card__body">
            <div className="tour-ops-card__top">
              <div className="tour-ops-card__identity">
                <p className="tour-ops-card__title" title={model.listingTitle}>
                  {model.listingTitle}
                </p>
                {secondaryLine ? (
                  <p className="tour-ops-card__option" title={secondaryLine}>
                    {secondaryLine}
                  </p>
                ) : null}
              </div>
              <div className="tour-ops-card__rail">
                <div className="tour-ops-card__rail-stack">
                  <span className={`tour-ops-card__status ${model.statusClass}`}>{model.statusLabel}</span>
                </div>
                <ChevronDown
                  className={`tour-ops-card__chevron${expanded ? ' is-open' : ''}`}
                  aria-hidden
                />
              </div>
            </div>
            <div className="tour-ops-card__meta">
              <span className="tour-ops-card__meta-item tour-ops-card__meta-item--strong">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate" title={model.dateLine}>
                  {model.dateLine}
                </span>
              </span>
              <span
                className="tour-ops-card__meta-item tour-ops-card__meta-item--strong"
                title={model.participantLabel}
              >
                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  {model.participantLabel}
                  {model.nightLabel ? ` · ${model.nightLabel}` : ''}
                </span>
              </span>
              <button
                type="button"
                className="tour-ops-card__ref lux-flat"
                onClick={(e) => {
                  stop(e);
                  onCopyReference();
                }}
                title={copied ? 'Copied' : 'Copy booking reference'}
                aria-label={`Copy booking reference ${model.referenceLabel}`}
              >
                {copied ? (
                  <span className="tour-ops-card__ref-copied">Copied</span>
                ) : (
                  <>
                    <span className="tour-ops-card__ref-code">{model.referenceLabel}</span>
                    <Copy className="h-3 w-3 shrink-0 opacity-55" aria-hidden />
                  </>
                )}
              </button>
              {model.purchaseDateLabel ? (
                <span className="tour-ops-card__purchased" title="Purchase date">
                  Purchased {model.purchaseDateLabel}
                </span>
              ) : null}
            </div>
            {model.warning ? <p className="tour-ops-card__warn">{model.warning}</p> : null}
          </div>
        </button>
      </div>

      <div className="tour-ops-card__panel" hidden={!expanded} onClick={stop}>
        <div className="tour-ops-card__summary-grid">
          <section className="tour-ops-card__summary-block">
            <h3 className="tour-ops-card__summary-heading">Guest</h3>
            <p className="tour-ops-card__summary-name">{model.guestName}</p>
            {model.guestPhone ? (
              <a
                href={`tel:${model.guestPhone.replace(/[^\d+]/g, '')}`}
                className="tour-ops-card__summary-phone"
              >
                {model.guestPhone}
              </a>
            ) : null}
            {model.guestEmail ? (
              <p className="tour-ops-card__summary-meta">
                <a href={`mailto:${model.guestEmail}`} className="text-finland hover:underline">
                  {model.guestEmail}
                </a>
              </p>
            ) : null}
            <p className="tour-ops-card__summary-meta">{model.participantLabel}</p>
            {model.guestNotes ? (
              <p className="tour-ops-card__summary-note">{model.guestNotes}</p>
            ) : null}
          </section>

          <section className="tour-ops-card__summary-block">
            <h3 className="tour-ops-card__summary-heading">Arrival & departure</h3>
            <p className="tour-ops-card__summary-value">
              Check-in · {model.checkInLabel || '—'}
            </p>
            <p className="tour-ops-card__summary-meta">
              Check-out · {model.checkOutLabel || '—'}
            </p>
            {model.nightLabel ? (
              <p className="tour-ops-card__summary-meta">{model.nightLabel}</p>
            ) : null}
            {model.accessSummary ? (
              <p className="tour-ops-card__summary-note">{model.accessSummary}</p>
            ) : null}
          </section>

          <section className="tour-ops-card__summary-block tour-ops-card__summary-block--finance">
            <h3 className="tour-ops-card__summary-heading">Payment</h3>
            {model.financeLoading ? (
              <p className="tour-ops-card__summary-meta">Loading…</p>
            ) : (
              <dl className="tour-ops-card__finance">
                <div>
                  <dt>Customer paid</dt>
                  <dd className="tabular-nums">{model.guestPaidLabel || 'Unavailable'}</dd>
                </div>
                <div>
                  <dt>
                    Traverion commission
                    {model.commissionRateLabel ? ` (${model.commissionRateLabel})` : ''}
                  </dt>
                  <dd className="tabular-nums">
                    {model.commissionLabel ? `−${model.commissionLabel}` : 'Unavailable'}
                  </dd>
                </div>
                <div>
                  <dt>Supplier earnings</dt>
                  <dd className="tabular-nums tour-ops-card__finance-earn">
                    {model.earningsLabel || 'Unavailable'}
                  </dd>
                </div>
              </dl>
            )}
            <p className="tour-ops-card__summary-meta mt-1.5">{model.paymentLabel}</p>
          </section>
        </div>

        {model.warning ? <p className="tour-ops-card__summary-attention">{model.warning}</p> : null}

        <div className="tour-ops-card__actions">
          <button type="button" className="tv-btn-primary h-8 !px-3 text-[12.5px]" onClick={onMessageGuest}>
            <Mail className="h-3.5 w-3.5" aria-hidden />
            Message guest
          </button>
          <button type="button" className="tv-btn-secondary h-8 !px-3 text-[12.5px]" onClick={onOpenDetails}>
            View details
          </button>
        </div>
      </div>
    </article>
  );
}
