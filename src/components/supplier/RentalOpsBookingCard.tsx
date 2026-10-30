/**
 * Expandable rental booking row — collection/return ops, not tour pickup language.
 */
import { type MouseEvent, type ReactNode } from 'react';
import { CalendarDays, ChevronDown, Copy, Mail } from 'lucide-react';

export type RentalOpsCardModel = {
  id: string;
  listingTitle: string;
  variantLabel: string | null;
  imageUrl: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerNotes: string | null;
  /** Compact rental period line (collection → return). */
  periodLine: string;
  collectionLabel: string;
  returnLabel: string;
  quantityLabel: string;
  statusLabel: string;
  statusClass: string;
  handoverLabel: string;
  handoverComplete: boolean;
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
  const identityLine = [model.customerName, model.quantityLabel].filter(Boolean).join(' · ');

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
                  <span className="min-w-0 truncate">{model.listingTitle}</span>
                </p>
                {model.variantLabel ? (
                  <p className="tour-ops-card__option" title={model.variantLabel}>
                    {model.variantLabel}
                  </p>
                ) : null}
                {identityLine ? (
                  <p className="tour-ops-card__option" title={identityLine}>
                    {identityLine}
                  </p>
                ) : null}
              </div>
              <div className="tour-ops-card__rail">
                <div className="tour-ops-card__rail-stack">
                  <span className={`tour-ops-card__status ${model.statusClass}`}>{model.statusLabel}</span>
                  <span
                    className={`tour-ops-card__arrival${
                      model.handoverComplete
                        ? ''
                        : model.handoverLabel === 'Awaiting collection'
                          ? ' is-warn'
                          : ''
                    }`}
                    title={model.handoverLabel}
                  >
                    {model.handoverLabel}
                  </span>
                </div>
                <ChevronDown
                  className={`tour-ops-card__chevron${expanded ? ' is-open' : ''}`}
                  aria-hidden
                />
              </div>
            </div>
            <div className="tour-ops-card__meta">
              <span className="tour-ops-card__meta-item" title={model.periodLine}>
                <CalendarDays className="tour-ops-card__title-icon" aria-hidden />
                <span className="min-w-0 truncate">{model.periodLine}</span>
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
            <h3 className="tour-ops-card__summary-heading">Customer</h3>
            <p className="tour-ops-card__summary-name">{model.customerName}</p>
            {model.customerPhone ? (
              <a
                href={`tel:${model.customerPhone.replace(/[^\d+]/g, '')}`}
                className="tour-ops-card__summary-phone"
              >
                {model.customerPhone}
              </a>
            ) : null}
            {model.customerEmail ? (
              <p className="tour-ops-card__summary-meta">
                <a href={`mailto:${model.customerEmail}`} className="text-finland hover:underline">
                  {model.customerEmail}
                </a>
              </p>
            ) : null}
            <p className="tour-ops-card__summary-meta">{model.quantityLabel}</p>
            {model.customerNotes ? (
              <p className="tour-ops-card__summary-note">{model.customerNotes}</p>
            ) : null}
          </section>

          <section className="tour-ops-card__summary-block">
            <h3 className="tour-ops-card__summary-heading">Rental period</h3>
            <p className="tour-ops-card__summary-value">Collection · {model.collectionLabel || '—'}</p>
            <p className="tour-ops-card__summary-meta">Return · {model.returnLabel || '—'}</p>
            {model.collectionPlace ? (
              <p className="tour-ops-card__summary-note">{model.collectionPlace}</p>
            ) : null}
            {model.returnPlace && model.returnPlace !== model.collectionPlace ? (
              <p className="tour-ops-card__summary-note">Return: {model.returnPlace}</p>
            ) : null}
            <p className="tour-ops-card__summary-meta mt-1">{model.handoverLabel}</p>
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
          <button
            type="button"
            className="tv-btn-primary h-8 !px-3 text-[12.5px]"
            onClick={onMessageCustomer}
          >
            <Mail className="h-3.5 w-3.5" aria-hidden />
            Message customer
          </button>
          <button
            type="button"
            className="tv-btn-secondary h-8 !px-3 text-[12.5px]"
            onClick={onOpenDetails}
          >
            View details
          </button>
        </div>
      </div>
    </article>
  );
}
