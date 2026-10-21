/**
 * Expandable tour booking row — scan row + minimal inline ops details.
 */
import { type MouseEvent, type ReactNode } from 'react';
import { CalendarDays, ChevronDown, Copy, Mail, MapPin, Users } from 'lucide-react';

export type TourOpsCardModel = {
  id: string;
  listingTitle: string;
  optionLabel: string;
  imageUrl: string | null;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  dateLine: string;
  departureNote: string | null;
  participantLabel: string;
  statusLabel: string;
  statusClass: string;
  referenceLabel: string;
  purchaseDateLabel: string | null;
  /** Right-rail arrival indicator */
  arrivalRailLabel: string | null;
  arrivalRailWarn?: boolean;
  pickupSummary: string | null;
  arrivalSectionLabel: string;
  durationLabel: string | null;
  guestNotes: string | null;
  warning: string | null;
  needsAcknowledge: boolean;
  guestPaidLabel: string | null;
  commissionLabel: string | null;
  commissionRateLabel: string | null;
  earningsLabel: string | null;
  financeLoading: boolean;
  paymentLabel: string;
};

type Props = {
  model: TourOpsCardModel;
  expanded: boolean;
  selected: boolean;
  busy?: boolean;
  checkbox: ReactNode;
  onToggleExpand: () => void;
  onOpenDetails: () => void;
  onMessageGuest: () => void;
  onAcknowledge?: () => void;
  onCopyReference: () => void;
  copied?: boolean;
};

export default function TourOpsBookingCard({
  model,
  expanded,
  selected,
  busy,
  checkbox,
  onToggleExpand,
  onOpenDetails,
  onMessageGuest,
  onAcknowledge,
  onCopyReference,
  copied,
}: Props) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  const actionableNote =
    model.warning && model.warning !== 'Pickup details missing' ? model.warning : null;
  const showGuestNotes = Boolean(model.guestNotes) && (model.arrivalRailWarn || Boolean(actionableNote));

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
          aria-label={`${expanded ? 'Collapse' : 'Expand'} booking for ${model.listingTitle}`}
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
                {model.optionLabel ? (
                  <p className="tour-ops-card__option" title={model.optionLabel}>
                    {model.optionLabel}
                  </p>
                ) : null}
              </div>
              <div className="tour-ops-card__rail">
                <div className="tour-ops-card__rail-stack">
                  <span className={`tour-ops-card__status ${model.statusClass}`}>{model.statusLabel}</span>
                  {model.arrivalRailLabel ? (
                    <span
                      className={`tour-ops-card__pickup${
                        model.arrivalRailWarn ? ' tour-ops-card__pickup--warn' : ''
                      }`}
                      title={model.pickupSummary || model.arrivalRailLabel}
                    >
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                      {model.arrivalRailLabel}
                    </span>
                  ) : null}
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
                <span
                  className="truncate"
                  title={
                    model.departureNote ? `${model.dateLine}. ${model.departureNote}` : model.dateLine
                  }
                >
                  {model.dateLine}
                  {model.departureNote ? ` · ${model.departureNote}` : ''}
                </span>
              </span>
              <span
                className="tour-ops-card__meta-item tour-ops-card__meta-item--strong"
                title={model.participantLabel}
              >
                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{model.participantLabel}</span>
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
            {actionableNote ? <p className="tour-ops-card__warn">{actionableNote}</p> : null}
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
            <p className="tour-ops-card__summary-meta">{model.participantLabel}</p>
          </section>

          <section className="tour-ops-card__summary-block">
            <h3 className="tour-ops-card__summary-heading">{model.arrivalSectionLabel}</h3>
            <p className="tour-ops-card__summary-value">
              {model.pickupSummary ||
                (model.arrivalRailWarn ? 'Pickup location needed' : '—')}
            </p>
            {showGuestNotes && model.guestNotes ? (
              <p className="tour-ops-card__summary-note">{model.guestNotes}</p>
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
          </section>
        </div>

        {actionableNote ? (
          <p className="tour-ops-card__summary-attention">{actionableNote}</p>
        ) : null}

        <div className="tour-ops-card__actions">
          <button type="button" className="tv-btn-primary h-8 !px-3 text-[12.5px]" onClick={onMessageGuest}>
            <Mail className="h-3.5 w-3.5" aria-hidden />
            Message guest
          </button>
          <button type="button" className="tv-btn-secondary h-8 !px-3 text-[12.5px]" onClick={onOpenDetails}>
            View details
          </button>
          {model.needsAcknowledge && onAcknowledge ? (
            <button
              type="button"
              disabled={busy}
              className="tv-btn-ghost h-8 !px-2.5 text-[12.5px] disabled:opacity-50"
              onClick={onAcknowledge}
            >
              {busy ? 'Saving…' : 'Acknowledge'}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
