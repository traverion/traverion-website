/**
 * Expandable Stay reservation row — Guest | Booking details | Payment.
 */
import { type MouseEvent, type ReactNode } from 'react';
import { Calendar, ChevronDown, Copy, Mail, Ticket, Users } from 'lucide-react';

export type StayOpsCardModel = {
  id: string;
  listingTitle: string;
  categoryLabel?: string | null;
  imageUrl: string | null;
  guestName: string;
  dateLine: string;
  participantLabel: string;
  nightLabel: string;
  statusLabel: string | null;
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

function moneyOrPlaceholder(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed || '—';
}

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
          aria-label={`${expanded ? 'Collapse' : 'Expand'} reservation for ${model.listingTitle}`}
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
        <div className="tour-ops-card__scan">
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
              <div className="tour-ops-card__level tour-ops-card__level--identity">
                <div className="tour-ops-card__identity">
                  <p className="tour-ops-card__title" title={model.listingTitle}>
                    {model.listingTitle}
                  </p>
                  {model.nightLabel ? (
                    <p className="tour-ops-card__option" title={model.nightLabel}>
                      {model.nightLabel}
                    </p>
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
                <span className="tour-ops-card__fact tour-ops-card__fact--date" title={model.dateLine}>
                  <Calendar className="tour-ops-card__fact-icon" strokeWidth={2} aria-hidden />
                  <span className="tour-ops-card__fact-text">{model.dateLine}</span>
                </span>
                {model.participantLabel ? (
                  <span className="tour-ops-card__fact tour-ops-card__fact--qty" title={model.participantLabel}>
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
              {model.warning ? <p className="tour-ops-card__warn">{model.warning}</p> : null}
            </div>
          </div>
        </div>
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
            {model.guestNotes ? (
              <p className="tour-ops-card__summary-note">{model.guestNotes}</p>
            ) : null}
          </section>

          <section className="tour-ops-card__summary-block">
            <h3 className="tour-ops-card__summary-heading">Booking details</h3>
            <p className="tour-ops-card__summary-value">
              <span className="tour-ops-card__summary-label">Check-in</span>
              {model.checkInLabel || '—'}
            </p>
            <p className="tour-ops-card__summary-meta">
              <span className="tour-ops-card__summary-label">Check-out</span>
              {model.checkOutLabel || '—'}
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

        {model.warning ? <p className="tour-ops-card__summary-attention">{model.warning}</p> : null}

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
