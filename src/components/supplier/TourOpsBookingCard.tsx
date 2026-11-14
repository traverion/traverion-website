/**
 * Expandable tour booking row — compact scan row + Guest | Booking details | Payment.
 */
import { type MouseEvent } from 'react';
import {
  Calendar,
  ChevronDown,
  Clock,
  Copy,
  CreditCard,
  Mail,
  MapPin,
  Phone,
  Ticket,
  Users,
} from 'lucide-react';
import TruncatingText from './TruncatingText';

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
    (model.arrivalRailWarn ? 'Pickup location needed' : null);
  const showInstructionUnderPlace = Boolean(
    arrivalPlace && arrivalInstructions && arrivalInstructions !== arrivalPlace
  );
  const needsAttention = Boolean(model.warning) || model.statusLabel === 'Pickup details missing';

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
        <div className="tour-ops-card__scan">
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
                  <TruncatingText text={model.listingTitle} as="p" className="tour-ops-card__title" />
                  {model.optionLabel ? (
                    <TruncatingText text={model.optionLabel} as="p" className="tour-ops-card__option" />
                  ) : null}
                </div>
                {model.statusLabel ? (
                  <div className="tour-ops-card__rail">
                    <span className={`tour-ops-card__status ${model.statusClass}`}>{model.statusLabel}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </button>
          <div className="tour-ops-card__facts-row">
            <span className="tour-ops-card__facts-indent" aria-hidden />
            <div className="tour-ops-card__level tour-ops-card__level--facts">
              <div className="tour-ops-card__facts" onClick={onToggleExpand}>
                <span className="tour-ops-card__fact tour-ops-card__fact--date">
                  <Calendar className="tour-ops-card__fact-icon" strokeWidth={2} aria-hidden />
                  <TruncatingText text={model.dateLine} className="tour-ops-card__fact-text" />
                </span>
                {model.participantLabel ? (
                  <span className="tour-ops-card__fact tour-ops-card__fact--qty">
                    <Users className="tour-ops-card__fact-icon" strokeWidth={2} aria-hidden />
                    <TruncatingText text={model.participantLabel} className="tour-ops-card__fact-text" />
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
                      <Ticket
                        className="tour-ops-card__fact-icon tour-ops-card__fact-icon--ticket"
                        strokeWidth={2}
                        aria-hidden
                      />
                      <span className="tour-ops-card__ref-code">{model.referenceLabel}</span>
                      <Copy className="tour-ops-card__ref-copy" strokeWidth={2} aria-hidden />
                    </>
                  )}
                </button>
              </div>
              {actionableNote ? <p className="tour-ops-card__warn">{actionableNote}</p> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="tour-ops-card__panel" hidden={!expanded} onClick={stop}>
        <div className="tour-ops-card__summary-grid">
          <section className="tour-ops-card__summary-block">
            <h3 className="tour-ops-card__summary-heading">Guest</h3>
            <p className="tour-ops-card__summary-name">{model.guestName}</p>
            {model.guestPhone ? (
              <a
                href={`tel:${model.guestPhone.replace(/[^\d+]/g, '')}`}
                className="tour-ops-card__summary-contact tour-ops-card__summary-row"
              >
                <Phone className="tour-ops-card__summary-icon" strokeWidth={2} aria-hidden />
                <span>{model.guestPhone}</span>
              </a>
            ) : null}
            {model.participantLabel ? (
              <p className="tour-ops-card__summary-meta tour-ops-card__summary-row">
                <Users className="tour-ops-card__summary-icon" strokeWidth={2} aria-hidden />
                <span>{model.participantLabel}</span>
              </p>
            ) : null}
            {model.purchaseDateLabel ? (
              <p className="tour-ops-card__summary-meta tour-ops-card__summary-meta--secondary">
                Purchased {model.purchaseDateLabel}
              </p>
            ) : null}
          </section>

          <section className="tour-ops-card__summary-block">
            <h3 className="tour-ops-card__summary-heading">Booking details</h3>
            <p className="tour-ops-card__summary-value tour-ops-card__summary-row">
              <Calendar className="tour-ops-card__summary-icon" strokeWidth={2} aria-hidden />
              <span>{model.dateLine}</span>
            </p>
            {model.durationLabel ? (
              <p className="tour-ops-card__summary-meta tour-ops-card__summary-row">
                <Clock className="tour-ops-card__summary-icon" strokeWidth={2} aria-hidden />
                <span>{model.durationLabel}</span>
              </p>
            ) : null}
            {arrivalPrimary ? (
              <div className="tour-ops-card__summary-meta tour-ops-card__summary-row tour-ops-card__summary-row--place">
                <MapPin className="tour-ops-card__summary-icon" strokeWidth={2} aria-hidden />
                <div className="tour-ops-card__summary-place">
                  <span className="tour-ops-card__summary-label">{model.arrivalSectionLabel}</span>
                  <span className="tour-ops-card__summary-value--place">{arrivalPrimary}</span>
                </div>
              </div>
            ) : null}
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
              <p className="tour-ops-card__payment-status tour-ops-card__summary-row">
                <CreditCard className="tour-ops-card__summary-icon" strokeWidth={2} aria-hidden />
                <span>{model.paymentLabel}</span>
              </p>
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

        {actionableNote ? (
          <p className="tour-ops-card__summary-attention">{actionableNote}</p>
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
