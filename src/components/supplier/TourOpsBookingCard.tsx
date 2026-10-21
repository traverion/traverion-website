/**
 * Expandable tour booking row — spacious scan row with minimal inline details.
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
  const showPickupRail = model.pickupKind === 'pickup';
  const pickupNeedsAttention = model.warning === 'Pickup details missing';
  const pickupRailLabel = pickupNeedsAttention ? 'Pickup missing' : 'Pickup';
  const pickupDetailLabel =
    model.pickupKind === 'pickup'
      ? 'Pickup'
      : model.pickupKind === 'meeting'
        ? 'Meeting point'
        : 'Pickup / Meeting';
  const actionableNote =
    model.warning && model.warning !== 'Pickup details missing' ? model.warning : null;
  const showGuestNotes =
    Boolean(model.guestNotes) &&
    (model.pickupKind === 'pickup' || Boolean(actionableNote));

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
                  {showPickupRail ? (
                    <span
                      className={`tour-ops-card__pickup${
                        pickupNeedsAttention ? ' tour-ops-card__pickup--warn' : ''
                      }`}
                      title={model.pickupSummary || pickupRailLabel}
                    >
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                      {pickupRailLabel}
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
        <dl className="tour-ops-card__summary">
          <div>
            <dt>Lead guest</dt>
            <dd>
              <span className="tour-ops-card__summary-name">{model.guestName}</span>
              {model.guestPhone ? (
                <a
                  href={`tel:${model.guestPhone.replace(/[^\d+]/g, '')}`}
                  className="tour-ops-card__summary-phone"
                >
                  {model.guestPhone}
                </a>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Participants</dt>
            <dd>{model.participantLabel}</dd>
          </div>
          {model.pickupSummary || model.pickupKind ? (
            <div>
              <dt>{pickupDetailLabel}</dt>
              <dd>
                {model.pickupSummary ||
                  (pickupNeedsAttention ? 'Pickup details missing' : '—')}
                {showGuestNotes && model.guestNotes ? (
                  <span className="tour-ops-card__summary-note">{model.guestNotes}</span>
                ) : null}
              </dd>
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
          {actionableNote ? (
            <div>
              <dt>Attention</dt>
              <dd className="tour-ops-card__summary-attention">{actionableNote}</dd>
            </div>
          ) : null}
        </dl>

        <div className="tour-ops-card__actions">
          <button type="button" className="tv-btn-primary h-8 !px-3 text-[12.5px]" onClick={onMessageGuest}>
            <Mail className="h-3.5 w-3.5" aria-hidden />
            Message guest
          </button>
          <button type="button" className="tv-btn-secondary h-8 !px-3 text-[12.5px]" onClick={onOpenDetails}>
            View details
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
