/**
 * Expandable Stay reservation card — compact list row with aligned money/status rail.
 */
import { type MouseEvent, type ReactNode } from 'react';
import { CalendarDays, ChevronDown, Mail, Users } from 'lucide-react';

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
  guestTotalLabel: string | null;
  earningsLabel: string | null;
  paymentLabel: string;
  checkInTime: string;
  checkOutTime: string;
  guestEmail: string | null;
  guestPhone: string | null;
  warning: string | null;
  needsReview: boolean;
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
  onMarkReviewed?: () => void;
  onCopyReference: () => void;
  copied?: boolean;
};

export default function StayOpsReservationCard({
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
  const moneyLabel = model.earningsLabel
    ? { label: 'You earn', value: model.earningsLabel }
    : model.guestTotalLabel
      ? { label: 'Guest total', value: model.guestTotalLabel }
      : null;

  return (
    <article
      id={`supplier-booking-row-${model.id}`}
      data-highlight={selected ? 'true' : 'false'}
      data-attention={model.warning ? 'true' : 'false'}
      data-expanded={expanded ? 'true' : 'false'}
      className={`stay-ops-card${expanded ? ' is-expanded' : ''}`}
    >
      <div className="stay-ops-card__main">
        <div className="stay-ops-card__check" onClick={stop}>
          {checkbox}
        </div>
        <button
          type="button"
          className="stay-ops-card__hit lux-flat"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} reservation for ${model.guestName}`}
          onClick={onToggleExpand}
        >
          {model.imageUrl ? (
            <img src={model.imageUrl} alt="" className="stay-ops-card__thumb" />
          ) : (
            <div className="stay-ops-card__thumb stay-ops-card__thumb--empty" aria-hidden />
          )}
          <div className="stay-ops-card__body">
            <div className="stay-ops-card__top">
              <div className="stay-ops-card__identity">
                <p className="stay-ops-card__guest" title={model.guestName}>
                  {model.guestName}
                </p>
                <p className="stay-ops-card__property" title={model.listingTitle}>
                  {model.listingTitle}
                </p>
              </div>
              <div className="stay-ops-card__rail">
                <span className={`stay-ops-card__status ${model.statusClass}`}>{model.statusLabel}</span>
                {moneyLabel && !expanded ? (
                  <span className="stay-ops-card__money">
                    <span className="stay-ops-card__money-label">{moneyLabel.label}</span>
                    <span className="stay-ops-card__money-value">{moneyLabel.value}</span>
                  </span>
                ) : null}
              </div>
              <ChevronDown
                className={`stay-ops-card__chevron${expanded ? ' is-open' : ''}`}
                aria-hidden
              />
            </div>
            <div className="stay-ops-card__meta">
              <span className="stay-ops-card__meta-item">
                <CalendarDays className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{model.dateLine}</span>
              </span>
              <span className="stay-ops-card__meta-item">
                <Users className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">
                  {model.participantLabel}
                  {model.nightLabel ? ` · ${model.nightLabel}` : ''}
                </span>
              </span>
              <button
                type="button"
                className="stay-ops-card__ref lux-flat"
                onClick={(e) => {
                  stop(e);
                  onCopyReference();
                }}
                title="Copy booking reference"
              >
                {copied ? 'Copied' : model.referenceLabel}
              </button>
            </div>
            {model.warning ? <p className="stay-ops-card__warn">{model.warning}</p> : null}
          </div>
        </button>
      </div>

      <div className="stay-ops-card__panel" hidden={!expanded} onClick={stop}>
        <div className="stay-ops-card__panel-grid">
          <div className="stay-ops-card__cell">
            <p className="stay-ops-card__label">Arrival & departure</p>
            <div className="stay-ops-card__inout">
              <div>
                <p className="stay-ops-card__sublabel">Check-in</p>
                <p className="stay-ops-card__value">{model.checkInTime || '—'}</p>
              </div>
              <div>
                <p className="stay-ops-card__sublabel">Check-out</p>
                <p className="stay-ops-card__value">{model.checkOutTime || '—'}</p>
              </div>
            </div>
          </div>
          <div className="stay-ops-card__cell">
            <p className="stay-ops-card__label">Guest contact</p>
            <p className="stay-ops-card__value">
              {model.guestEmail ? (
                <a href={`mailto:${model.guestEmail}`} className="text-finland hover:underline">
                  {model.guestEmail}
                </a>
              ) : (
                'No email on file'
              )}
            </p>
            {model.guestPhone ? (
              <p className="stay-ops-card__value mt-0.5">
                <a
                  href={`tel:${model.guestPhone.replace(/[^\d+]/g, '')}`}
                  className="text-finland hover:underline"
                >
                  {model.guestPhone}
                </a>
              </p>
            ) : null}
          </div>
          <div className="stay-ops-card__cell">
            <p className="stay-ops-card__label">Payment & earnings</p>
            <p className="stay-ops-card__value">{model.paymentLabel}</p>
            {moneyLabel ? (
              <p className="stay-ops-card__value mt-0.5">
                <span className="text-ink-muted">{moneyLabel.label}</span>{' '}
                <span className="font-semibold tabular-nums">{moneyLabel.value}</span>
              </p>
            ) : null}
            {model.guestTotalLabel && model.earningsLabel ? (
              <p className="stay-ops-card__value mt-0.5 text-[12px] text-ink-muted">
                Guest total <span className="tabular-nums text-ink">{model.guestTotalLabel}</span>
              </p>
            ) : null}
          </div>
        </div>
        <div className="stay-ops-card__actions">
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
