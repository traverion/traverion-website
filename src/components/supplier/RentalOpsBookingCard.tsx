/**
 * Expandable rental booking row — Guest | Booking details | Payment.
 */
import { type MouseEvent, type ReactNode } from 'react';
import { ChevronDown, Copy, Mail } from 'lucide-react';

export type RentalOpsCardModel = {
  id: string;
  listingTitle: string;
  categoryLabel?: string | null;
  variantLabel: string | null;
  imageUrl: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerNotes: string | null;
  periodLine: string;
  collectionLabel: string;
  returnLabel: string;
  quantityLabel: string;
  statusLabel: string | null;
  statusClass: string;
  referenceLabel: string;
  purchaseDateLabel: string | null;
  collectionPlace: string | null;
  returnPlace: string | null;
  warning: string | null;
  guestPaidLabel: string | null;
  commissionLabel: string | null;
  commissionRateLabel: string | null;
  earningsLabel: string | null;
  financeLoading: boolean;
  paymentLabel: string;
  /** Kept for detail pages; not shown in the compact overview. */
  termsSummary: string | null;
};

type Props = {
  model: RentalOpsCardModel;
  expanded: boolean;
  selected: boolean;
  busy?: boolean;
  checkbox: ReactNode;
  onToggleExpand: () => void;
  onOpenDetails: () => void;
  onMessageCustomer: () => void;
  onCopyReference: () => void;
  copied?: boolean;
};

function moneyOrPlaceholder(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed || '—';
}

export default function RentalOpsBookingCard({
  model,
  expanded,
  selected,
  checkbox,
  onToggleExpand,
  onOpenDetails,
  onMessageCustomer,
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
          aria-label={`${expanded ? 'Collapse' : 'Expand'} rental booking for ${model.listingTitle}`}
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
          aria-label={`${expanded ? 'Collapse' : 'Expand'} rental booking for ${model.listingTitle}`}
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
                {model.variantLabel ? (
                  <p className="tour-ops-card__option" title={model.variantLabel}>
                    {model.variantLabel}
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
            <div className="tour-ops-card__facts">
              <span className="tour-ops-card__fact" title={model.periodLine}>
                {model.periodLine}
              </span>
              <span className="tour-ops-card__fact" title={model.customerName}>
                {model.customerName}
              </span>
              {model.quantityLabel ? (
                <span className="tour-ops-card__fact">{model.quantityLabel}</span>
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
                    <span className="tour-ops-card__ref-code">{model.referenceLabel}</span>
                    <Copy className="h-3 w-3 shrink-0 opacity-55" strokeWidth={2} aria-hidden />
                  </>
                )}
              </button>
            </div>
            {model.warning ? <p className="tour-ops-card__warn">{model.warning}</p> : null}
          </div>
        </button>
      </div>

      <div className="tour-ops-card__panel" hidden={!expanded} onClick={stop}>
        <div className="tour-ops-card__summary-grid">
          <section className="tour-ops-card__summary-block">
            <h3 className="tour-ops-card__summary-heading">Guest</h3>
            <p className="tour-ops-card__summary-name">{model.customerName}</p>
            {model.customerEmail ? (
              <a href={`mailto:${model.customerEmail}`} className="tour-ops-card__summary-contact">
                {model.customerEmail}
              </a>
            ) : null}
            {model.customerPhone ? (
              <a
                href={`tel:${model.customerPhone.replace(/[^\d+]/g, '')}`}
                className="tour-ops-card__summary-contact"
              >
                {model.customerPhone}
              </a>
            ) : null}
            {model.quantityLabel ? (
              <p className="tour-ops-card__summary-meta">{model.quantityLabel}</p>
            ) : null}
            {model.purchaseDateLabel ? (
              <p className="tour-ops-card__summary-meta tour-ops-card__summary-meta--secondary">
                Purchased {model.purchaseDateLabel}
              </p>
            ) : null}
            {model.customerNotes ? (
              <p className="tour-ops-card__summary-note">{model.customerNotes}</p>
            ) : null}
          </section>

          <section className="tour-ops-card__summary-block">
            <h3 className="tour-ops-card__summary-heading">Booking details</h3>
            <p className="tour-ops-card__summary-value">
              <span className="tour-ops-card__summary-label">Collection</span>
              {model.collectionLabel || '—'}
            </p>
            <p className="tour-ops-card__summary-meta">
              <span className="tour-ops-card__summary-label">Return</span>
              {model.returnLabel || '—'}
            </p>
            {model.variantLabel ? (
              <p className="tour-ops-card__summary-meta">{model.variantLabel}</p>
            ) : null}
            {model.collectionPlace ? (
              <p className="tour-ops-card__summary-note tour-ops-card__summary-value--place">
                {model.collectionPlace}
              </p>
            ) : null}
            {model.returnPlace && model.returnPlace !== model.collectionPlace ? (
              <p className="tour-ops-card__summary-note">Return: {model.returnPlace}</p>
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
          <button
            type="button"
            className="tv-btn-primary tour-ops-card__action-btn"
            onClick={onMessageCustomer}
          >
            <Mail className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Message customer
          </button>
          <button
            type="button"
            className="tv-btn-secondary tour-ops-card__action-btn"
            onClick={onOpenDetails}
          >
            View details
          </button>
        </div>
      </div>
    </article>
  );
}
