/**
 * Expandable tour booking row — compact scan row + Guest | Booking details | Payment.
 */
import { type MouseEvent, type ReactNode } from 'react';
import { Calendar, ChevronDown, Copy, Mail, Ticket, User, Users } from 'lucide-react';

export type TourOpsCardModel = {
  id: string;
  listingTitle: string;
  /** Shown on the unified bookings desk only. */
  categoryLabel?: string | null;
  optionLabel: string;
  imageUrl: string | null;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  dateLine: string;
  departureNote: string | null;
  participantLabel: string;
  /** Exceptional statuses only — Confirmed/Active stay null. */
  statusLabel: string | null;
  statusClass: string;
  referenceLabel: string;
  purchaseDateLabel: string | null;
  arrivalRailLabel: string | null;
  arrivalRailWarn?: boolean;
  pickupSummary: string | null;
  arrivalPlace?: string | null;
  arrivalInstructions?: string | null;
  arrivalSectionLabel: string;
  durationLabel: string | null;
  guestNotes: string | null;
  warning: string | null;
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
  onCopyReference: () => void;
  copied?: boolean;
};

function moneyOrPlaceholder(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed || '—';
}

export default function TourOpsBookingCard({
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
  const actionableNote =
    model.warning && model.warning !== 'Pickup details missing' ? model.warning : null;
  const showGuestNotes = Boolean(model.guestNotes) && (model.arrivalRailWarn || Boolean(actionableNote));
  const arrivalPlace = model.arrivalPlace?.trim() || null;
  const arrivalInstructions = model.arrivalInstructions?.trim() || null;
  const arrivalPrimary =
    arrivalPlace ||
    model.pickupSummary?.trim() ||
    arrivalInstructions ||
    (model.arrivalRailWarn ? 'Pickup location needed' : '—');
  const showInstructionUnderPlace = Boolean(arrivalPlace && arrivalInstructions);
  const whenTitle = model.departureNote ? `${model.dateLine}. ${model.departureNote}` : model.dateLine;
  const needsAttention = Boolean(model.warning);

  return (
    <article
      id={`supplier-booking-row-${model.id}`}
      data-highlight={selected ? 'true' : 'false'}
      data-attention={needsAttention ? 'true' : 'false'}
      data-expanded={expanded ? 'true' : 'false'}
      className={`tour-ops-card${expanded ? ' is-expanded' : ''}`}
    >
      <div className="tour-ops-card__main">
        <button
          type="button"
          className="tour-ops-card__expand lux-flat"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} booking for ${model.listingTitle}`}
          onClick={onToggleExpand}
        >
          <ChevronDown
            className={`tour-ops-card__chevron${expanded ? ' is-open' : ''}`}
            strokeWidth={2.25}
            aria-hidden
          />
        </button>
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
            <div className="tour-ops-card__level tour-ops-card__level--identity">
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
                {model.categoryLabel ? (
                  <span className="tour-ops-card__category">{model.categoryLabel}</span>
                ) : null}
                {model.statusLabel ? (
                  <span className={`tour-ops-card__status ${model.statusClass}`}>{model.statusLabel}</span>
                ) : null}
              </div>
            </div>
            <div className="tour-ops-card__level tour-ops-card__level--facts">
              <div className="tour-ops-card__facts">
                <span className="tour-ops-card__fact" title={whenTitle}>
                  <Calendar className="tour-ops-card__fact-icon" strokeWidth={2} aria-hidden />
                  <span className="tour-ops-card__fact-text">{model.dateLine}</span>
                </span>
                <span className="tour-ops-card__fact" title={model.guestName}>
                  <User className="tour-ops-card__fact-icon" strokeWidth={2} aria-hidden />
                  <span className="tour-ops-card__fact-text">{model.guestName}</span>
                </span>
                {model.participantLabel ? (
                  <span className="tour-ops-card__fact" title={model.participantLabel}>
                    <Users className="tour-ops-card__fact-icon" strokeWidth={2} aria-hidden />
                    <span className="tour-ops-card__fact-text">{model.participantLabel}</span>
                  </span>
                ) : null}
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
                      <Ticket className="tour-ops-card__fact-icon" strokeWidth={2} aria-hidden />
                      <span className="tour-ops-card__ref-code">{model.referenceLabel}</span>
                      <Copy className="tour-ops-card__ref-copy" strokeWidth={2} aria-hidden />
                    </>
                  )}
                </button>
              </div>
            </div>
            {actionableNote || model.warning === 'Pickup details missing' ? (
              <p className="tour-ops-card__warn">{actionableNote || model.warning}</p>
            ) : null}
          </div>
        </button>
      </div>

      <div className="tour-ops-card__panel" hidden={!expanded} onClick={stop}>
        <div className="tour-ops-card__summary-grid">
          <section className="tour-ops-card__summary-block">
            <h3 className="tour-ops-card__summary-heading">Guest</h3>
            <p className="tour-ops-card__summary-name">{model.guestName}</p>
            {model.guestEmail ? (
              <a href={`mailto:${model.guestEmail}`} className="tour-ops-card__summary-contact">
                {model.guestEmail}
              </a>
            ) : null}
            {model.guestPhone ? (
              <a
                href={`tel:${model.guestPhone.replace(/[^\d+]/g, '')}`}
                className="tour-ops-card__summary-contact"
              >
                {model.guestPhone}
              </a>
            ) : null}
            {model.participantLabel ? (
              <p className="tour-ops-card__summary-meta">{model.participantLabel}</p>
            ) : null}
            {model.purchaseDateLabel ? (
              <p className="tour-ops-card__summary-meta tour-ops-card__summary-meta--secondary">
                Purchased {model.purchaseDateLabel}
              </p>
            ) : null}
          </section>

          <section className="tour-ops-card__summary-block">
            <h3 className="tour-ops-card__summary-heading">Booking details</h3>
            <p className="tour-ops-card__summary-value" title={whenTitle}>
              {model.dateLine}
            </p>
            {model.optionLabel ? (
              <p className="tour-ops-card__summary-meta">{model.optionLabel}</p>
            ) : null}
            {model.durationLabel ? (
              <p className="tour-ops-card__summary-meta">{model.durationLabel}</p>
            ) : null}
            <p
              className={`tour-ops-card__summary-meta${
                arrivalPlace || model.pickupSummary ? ' tour-ops-card__summary-value--place' : ''
              }`}
            >
              <span className="tour-ops-card__summary-label">{model.arrivalSectionLabel}</span>
              {arrivalPrimary}
            </p>
            {showInstructionUnderPlace ? (
              <p className="tour-ops-card__summary-note">{arrivalInstructions}</p>
            ) : null}
            {model.departureNote ? (
              <p className="tour-ops-card__summary-note">{model.departureNote}</p>
            ) : null}
            {showGuestNotes && model.guestNotes ? (
              <p className="tour-ops-card__summary-note">{model.guestNotes}</p>
            ) : null}
          </section>

          <section className="tour-ops-card__summary-block tour-ops-card__summary-block--finance">
            <h3 className="tour-ops-card__summary-heading">Payment</h3>
            {model.paymentLabel ? (
              <p className="tour-ops-card__payment-status">{model.paymentLabel}</p>
            ) : null}
            {model.financeLoading ? (
              <p className="tour-ops-card__summary-meta">Loading…</p>
            ) : (
              <>
                <dl className="tour-ops-card__finance">
                  <div>
                    <dt>Customer paid</dt>
                    <dd className="tabular-nums">{moneyOrPlaceholder(model.guestPaidLabel)}</dd>
                  </div>
                  <div>
                    <dt>
                      Traverion commission
                      {model.commissionRateLabel ? ` (${model.commissionRateLabel})` : ''}
                    </dt>
                    <dd className="tabular-nums">
                      {model.commissionLabel ? `−${model.commissionLabel}` : '—'}
                    </dd>
                  </div>
                  <div className="tour-ops-card__finance-earn-row">
                    <dt>Supplier earnings</dt>
                    <dd className="tabular-nums tour-ops-card__finance-earn">
                      {moneyOrPlaceholder(model.earningsLabel)}
                    </dd>
                  </div>
                </dl>
                {model.earningsLabel ? (
                  <p className="tour-ops-card__finance-note">Supplier earnings are not a payout.</p>
                ) : null}
              </>
            )}
          </section>
        </div>

        {actionableNote || model.warning === 'Pickup details missing' ? (
          <p className="tour-ops-card__summary-attention">
            {actionableNote || model.warning}
          </p>
        ) : null}

        <div className="tour-ops-card__actions">
          <button type="button" className="tv-btn-primary tour-ops-card__action-btn" onClick={onMessageGuest}>
            <Mail className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Message guest
          </button>
          <button type="button" className="tv-btn-secondary tour-ops-card__action-btn" onClick={onOpenDetails}>
            View details
          </button>
        </div>
      </div>
    </article>
  );
}
