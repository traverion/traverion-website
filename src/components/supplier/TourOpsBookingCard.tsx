/**
 * Expandable tour booking row — compact scan row with inline operational details.
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
  pickupKind: 'pickup' | 'meeting' | null;
  pickupSummary: string | null;
  durationLabel: string | null;
  guestNotes: string | null;
  warning: string | null;
  needsReview: boolean;
  guestTotalLabel: string | null;
  earningsLabel: string | null;
  earningsLoading: boolean;
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
  onMarkReviewed?: () => void;
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
  onMarkReviewed,
  onCopyReference,
  copied,
}: Props) {
  const stop = (e: MouseEvent) => e.stopPropagation();

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
                <span className={`tour-ops-card__status ${model.statusClass}`}>{model.statusLabel}</span>
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
              <span className="tour-ops-card__meta-item" title={model.participantLabel}>
                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{model.participantLabel}</span>
              </span>
              <span className="tour-ops-card__guest" title={model.guestName}>
                {model.guestName}
              </span>
              {model.pickupKind ? (
                <span className="tour-ops-card__meta-item" title={model.pickupSummary ?? undefined}>
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">
                    {model.pickupKind === 'pickup' ? 'Pickup' : 'Meeting point'}
                  </span>
                </span>
              ) : null}
            </div>
            <div className="tour-ops-card__refs">
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
                    <Copy className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
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
        <div className="tour-ops-card__panel-grid">
          <section className="tour-ops-card__section">
            <h3 className="tour-ops-card__section-title">Guest &amp; reservation</h3>
            <dl className="tour-ops-card__fields">
              <div>
                <dt>Guest</dt>
                <dd>{model.guestName}</dd>
              </div>
              {model.guestEmail ? (
                <div>
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${model.guestEmail}`} className="text-finland hover:underline">
                      {model.guestEmail}
                    </a>
                  </dd>
                </div>
              ) : null}
              {model.guestPhone ? (
                <div>
                  <dt>Phone</dt>
                  <dd>
                    <a
                      href={`tel:${model.guestPhone.replace(/[^\d+]/g, '')}`}
                      className="text-finland hover:underline"
                    >
                      {model.guestPhone}
                    </a>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Reference</dt>
                <dd className="font-mono tracking-wide">{model.referenceLabel}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`tour-ops-card__status ${model.statusClass}`}>{model.statusLabel}</span>
                </dd>
              </div>
              {model.purchaseDateLabel ? (
                <div>
                  <dt>Purchased</dt>
                  <dd>{model.purchaseDateLabel}</dd>
                </div>
              ) : null}
              <div>
                <dt>Participants</dt>
                <dd>{model.participantLabel}</dd>
              </div>
              {model.optionLabel ? (
                <div>
                  <dt>Option</dt>
                  <dd>{model.optionLabel}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="tour-ops-card__section">
            <h3 className="tour-ops-card__section-title">Experience &amp; departure</h3>
            <dl className="tour-ops-card__fields">
              <div>
                <dt>Experience</dt>
                <dd>{model.listingTitle}</dd>
              </div>
              {model.optionLabel ? (
                <div>
                  <dt>Option</dt>
                  <dd>{model.optionLabel}</dd>
                </div>
              ) : null}
              <div>
                <dt>Departure</dt>
                <dd>
                  {model.dateLine}
                  {model.departureNote ? (
                    <span className="mt-0.5 block text-[12px] font-normal text-ink-muted">
                      {model.departureNote}
                    </span>
                  ) : null}
                </dd>
              </div>
              {model.durationLabel ? (
                <div>
                  <dt>Duration</dt>
                  <dd>{model.durationLabel}</dd>
                </div>
              ) : null}
              {model.pickupSummary ? (
                <div>
                  <dt>{model.pickupKind === 'pickup' ? 'Pickup' : 'Meeting point'}</dt>
                  <dd>{model.pickupSummary}</dd>
                </div>
              ) : null}
              {model.guestNotes ? (
                <div>
                  <dt>Guest notes</dt>
                  <dd className="whitespace-pre-wrap">{model.guestNotes}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="tour-ops-card__section">
            <h3 className="tour-ops-card__section-title">Payment &amp; earnings</h3>
            <dl className="tour-ops-card__fields">
              <div>
                <dt>Payment</dt>
                <dd>{model.paymentLabel}</dd>
              </div>
              {model.guestTotalLabel ? (
                <div>
                  <dt>Booking total</dt>
                  <dd className="tabular-nums">{model.guestTotalLabel}</dd>
                </div>
              ) : null}
              <div>
                <dt>Supplier earnings</dt>
                <dd className="tabular-nums">
                  {model.earningsLoading
                    ? 'Loading…'
                    : model.earningsLabel
                      ? model.earningsLabel
                      : 'Unavailable'}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="tour-ops-card__actions">
          <button type="button" className="tv-btn-primary h-8 !px-3 text-[12.5px]" onClick={onMessageGuest}>
            <Mail className="h-3.5 w-3.5" aria-hidden />
            Message guest
          </button>
          <button type="button" className="tv-btn-secondary h-8 !px-3 text-[12.5px]" onClick={onOpenDetails}>
            View details
          </button>
          <button
            type="button"
            className="tv-btn-ghost h-8 !px-2.5 text-[12.5px]"
            onClick={onCopyReference}
            aria-label={`Copy booking reference ${model.referenceLabel}`}
          >
            {copied ? 'Copied' : 'Copy reference'}
          </button>
          {model.needsReview && onMarkReviewed ? (
            <button
              type="button"
              disabled={busy}
              className="tv-btn-ghost h-8 !px-2.5 text-[12.5px] disabled:opacity-50"
              title="Informational only — does not change payment or confirmation"
              onClick={onMarkReviewed}
            >
              {busy ? 'Saving…' : 'Mark as reviewed'}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
