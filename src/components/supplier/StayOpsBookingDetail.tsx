/**
 * Dedicated Stay reservation details page — same architecture as TourOpsBookingDetail.
 */
import { type ReactNode } from 'react';
import { ArrowLeft, CheckCircle, Copy, Mail, Trash2 } from 'lucide-react';
import type { TourOpsDetailFinance } from './TourOpsBookingDetail';

export type StayOpsDetailModel = {
  referenceLabel: string;
  statusLabel: string;
  statusClass: string;
  listingTitle: string;
  imageUrl: string | null;
  whenLabel: string;
  nightLabel: string | null;
  participantLabel: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  requestNotes: string | null;
  checkInDateLabel: string;
  checkInTimeLabel: string | null;
  checkOutDateLabel: string;
  checkOutTimeLabel: string | null;
  propertyAddress: string | null;
  accessInstructions: string | null;
  houseRules: string | null;
  unpaidHoldMessage: string | null;
  cancelWaitingMessage: string | null;
  finance: TourOpsDetailFinance;
};

export type StayOpsDetailActivityItem = {
  id: string;
  label: string;
  detail?: string | null;
  at: string | null;
};

type Props = {
  model: StayOpsDetailModel;
  activity: StayOpsDetailActivityItem[];
  busy?: boolean;
  canEdit: boolean;
  copied?: boolean;
  showConfirm?: boolean;
  showCancelRequest?: boolean;
  cancelBlocked?: boolean;
  showRequestActions?: boolean;
  requestActionsSlot?: ReactNode;
  onBack: () => void;
  backLabel?: string;
  onCopyReference: () => void;
  onMessageGuest: () => void;
  onConfirm?: () => void;
  onRequestCancel?: () => void;
  onOpenFinancialStatement?: () => void;
  onOpenStayCalendar?: () => void;
  extraNotices?: ReactNode;
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tour-ops-detail__fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function formatActivityAt(at: string | null): string {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function StayOpsBookingDetail({
  model,
  activity,
  busy,
  canEdit,
  copied,
  showConfirm,
  showCancelRequest,
  cancelBlocked,
  showRequestActions,
  requestActionsSlot,
  onBack,
  backLabel = 'Back to reservations',
  onCopyReference,
  onMessageGuest,
  onConfirm,
  onRequestCancel,
  onOpenFinancialStatement,
  onOpenStayCalendar,
  extraNotices,
}: Props) {
  const phoneHref = model.guestPhone ? `tel:${model.guestPhone.replace(/[^\d+]/g, '')}` : '';
  const showOpsNotices = Boolean(
    model.unpaidHoldMessage || model.cancelWaitingMessage || extraNotices
  );

  return (
    <div className="tour-ops-detail">
      <button type="button" className="tour-ops-detail__back lux-flat" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {backLabel}
      </button>

      <header className="tour-ops-detail__top">
        <div className="tour-ops-detail__ref-row">
          <p className="tour-ops-detail__ref">
            <span className="tour-ops-detail__ref-label">Reservation</span>{' '}
            <span className="tour-ops-detail__ref-code">{model.referenceLabel}</span>
          </p>
          <button
            type="button"
            className="tour-ops-detail__copy lux-flat"
            onClick={onCopyReference}
            aria-label={`Copy reservation reference ${model.referenceLabel}`}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <span className={`tour-ops-detail__status ${model.statusClass}`}>{model.statusLabel}</span>
      </header>

      <div className="tour-ops-detail__experience">
        {model.imageUrl ? (
          <img src={model.imageUrl} alt="" className="tour-ops-detail__thumb" />
        ) : (
          <div className="tour-ops-detail__thumb tour-ops-detail__thumb--empty" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="tour-ops-detail__title" title={model.listingTitle}>
            {model.listingTitle}
          </h1>
          <p className="tour-ops-detail__option">{model.guestName}</p>
          <div className="tour-ops-detail__exp-meta">
            <span>{model.whenLabel}</span>
            {model.nightLabel ? <span>{model.nightLabel}</span> : null}
            <span>{model.participantLabel}</span>
          </div>
        </div>
      </div>

      <div className="tour-ops-detail__grid">
        <div className="tour-ops-detail__main">
          <section className="tour-ops-detail__section">
            <h2 className="tour-ops-detail__heading">Guest</h2>
            <dl className="tour-ops-detail__facts">
              <Fact label="Lead guest">{model.guestName}</Fact>
              {model.guestEmail ? (
                <Fact label="Email">
                  <a
                    href={`mailto:${model.guestEmail}`}
                    className="text-finland hover:underline [overflow-wrap:anywhere]"
                  >
                    {model.guestEmail}
                  </a>
                </Fact>
              ) : (
                <Fact label="Email">No email on file</Fact>
              )}
              {model.guestPhone ? (
                <Fact label="Phone">
                  <a href={phoneHref} className="text-finland hover:underline">
                    {model.guestPhone}
                  </a>
                </Fact>
              ) : null}
              <Fact label="Guests">{model.participantLabel}</Fact>
            </dl>
            {model.requestNotes ? (
              <div className="tour-ops-detail__notes">
                <p className="tour-ops-detail__sublabel">Guest notes</p>
                <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-ink">
                  {model.requestNotes}
                </p>
              </div>
            ) : null}
          </section>

          <section className="tour-ops-detail__section">
            <h2 className="tour-ops-detail__heading">Arrival & departure</h2>
            <dl className="tour-ops-detail__facts">
              <Fact label="Check-in">
                {model.checkInDateLabel}
                {model.checkInTimeLabel ? ` · from ${model.checkInTimeLabel}` : ''}
              </Fact>
              <Fact label="Check-out">
                {model.checkOutDateLabel}
                {model.checkOutTimeLabel ? ` · by ${model.checkOutTimeLabel}` : ''}
              </Fact>
              {model.nightLabel ? <Fact label="Nights">{model.nightLabel}</Fact> : null}
            </dl>
            {onOpenStayCalendar ? (
              <button
                type="button"
                className="mt-2 text-[12.5px] font-semibold text-finland hover:underline"
                onClick={onOpenStayCalendar}
              >
                Open Stay Calendar
              </button>
            ) : null}
          </section>

          <section className="tour-ops-detail__section">
            <h2 className="tour-ops-detail__heading">Property & access</h2>
            {model.propertyAddress ? (
              <div className="mb-2">
                <p className="tour-ops-detail__sublabel">Address</p>
                <p className="tour-ops-detail__place [overflow-wrap:anywhere]">{model.propertyAddress}</p>
              </div>
            ) : null}
            {model.accessInstructions ? (
              <div className="mb-2">
                <p className="tour-ops-detail__sublabel">Access instructions</p>
                <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-ink">
                  {model.accessInstructions}
                </p>
              </div>
            ) : null}
            {model.houseRules ? (
              <div>
                <p className="tour-ops-detail__sublabel">House rules</p>
                <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-ink">
                  {model.houseRules}
                </p>
              </div>
            ) : null}
            {!model.propertyAddress && !model.accessInstructions && !model.houseRules ? (
              <p className="tour-ops-detail__muted">No arrival details on this reservation.</p>
            ) : null}
          </section>

          {activity.length > 0 ? (
            <section className="tour-ops-detail__section">
              <h2 className="tour-ops-detail__heading">Booking activity</h2>
              <ol className="tour-ops-detail__activity">
                {activity.map((item) => (
                  <li key={item.id} className="tour-ops-detail__activity-item">
                    <p className="tour-ops-detail__activity-label">{item.label}</p>
                    {item.detail ? (
                      <p className="tour-ops-detail__activity-detail">{item.detail}</p>
                    ) : null}
                    {item.at ? (
                      <time dateTime={item.at} className="tour-ops-detail__activity-at">
                        {formatActivityAt(item.at)}
                      </time>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {showOpsNotices ? (
            <section className="tour-ops-detail__section">
              <h2 className="tour-ops-detail__heading">Attention</h2>
              {model.unpaidHoldMessage ? (
                <p className="text-[13px] text-ink-muted">{model.unpaidHoldMessage}</p>
              ) : null}
              {model.cancelWaitingMessage ? (
                <p className="mt-1 text-[13px] text-amber-900">{model.cancelWaitingMessage}</p>
              ) : null}
              {extraNotices}
            </section>
          ) : null}
        </div>

        <aside className="tour-ops-detail__aside">
          <section className="tour-ops-detail__aside-card">
            <h2 className="tour-ops-detail__heading">Status</h2>
            <span className={`tour-ops-detail__status ${model.statusClass}`}>{model.statusLabel}</span>
            <p className="mt-2 text-[12.5px] font-semibold text-ink">{model.finance.paymentStatus}</p>
            {showRequestActions && requestActionsSlot ? (
              <div className="mt-3">{requestActionsSlot}</div>
            ) : null}
          </section>

          <section className="tour-ops-detail__aside-card">
            <h2 className="tour-ops-detail__heading">Payment</h2>
            {model.finance.state === 'loading' ? (
              <p className="text-[13px] text-ink-muted">Loading…</p>
            ) : model.finance.state === 'ready' ? (
              <>
                <dl className="tour-ops-detail__finance">
                  <div>
                    <dt>Customer paid</dt>
                    <dd className="tabular-nums">{model.finance.customerPaid || '—'}</dd>
                  </div>
                  <div>
                    <dt>
                      Traverion commission
                      {model.finance.commissionRate ? ` (${model.finance.commissionRate})` : ''}
                    </dt>
                    <dd className="tabular-nums">
                      {model.finance.commission ? `−${model.finance.commission}` : '—'}
                    </dd>
                  </div>
                  <div className="tour-ops-detail__finance-earn-row">
                    <dt>Supplier earnings</dt>
                    <dd className="tabular-nums tour-ops-detail__earn">
                      {model.finance.supplierEarnings || '—'}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-[12px] leading-4 text-ink-faint">
                  {model.finance.commissionAdjusted
                    ? 'Amounts follow refunds on this booking. Earnings are not a payout.'
                    : 'Supplier earnings are not a payout.'}
                </p>
                {onOpenFinancialStatement ? (
                  <button
                    type="button"
                    className="mt-2 text-[12.5px] font-semibold text-finland hover:underline"
                    onClick={onOpenFinancialStatement}
                  >
                    View financial statement
                  </button>
                ) : null}
              </>
            ) : (
              <p className="text-[13px] text-ink-muted">
                Payment breakdown is not recorded for this reservation.
              </p>
            )}
          </section>

          <div className="tour-ops-detail__actions">
            {canEdit && showConfirm && onConfirm ? (
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className="tv-btn-secondary inline-flex h-9 w-full items-center justify-center gap-1.5 !px-3 text-[13px] disabled:opacity-50"
              >
                <CheckCircle className="h-3.5 w-3.5" aria-hidden />
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onMessageGuest}
              className="tv-btn-primary inline-flex h-9 w-full items-center justify-center gap-1.5 !px-3 text-[13px]"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden />
              Message customer
            </button>
            {canEdit && showCancelRequest && onRequestCancel ? (
              <button
                type="button"
                disabled={busy || cancelBlocked}
                onClick={onRequestCancel}
                className="tv-btn-ghost inline-flex h-9 w-full items-center justify-center gap-1.5 !px-3 text-[13px] text-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Request cancellation
              </button>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
