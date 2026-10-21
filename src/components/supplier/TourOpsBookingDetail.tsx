/**
 * Dedicated tour booking details page — wide two-column desktop layout.
 */
import { type ReactNode } from 'react';
import { ArrowLeft, CheckCircle, Clock, Copy, Mail, Trash2 } from 'lucide-react';

export type TourOpsDetailFinance = {
  state: 'loading' | 'ready' | 'missing' | 'error';
  customerPaid: string | null;
  commission: string | null;
  commissionRate: string | null;
  supplierEarnings: string | null;
  paymentStatus: string;
  commissionAdjusted?: boolean;
};

export type TourOpsDetailModel = {
  referenceLabel: string;
  statusLabel: string;
  statusClass: string;
  listingTitle: string;
  optionLabel: string;
  imageUrl: string | null;
  whenLabel: string;
  durationLabel: string | null;
  participantLabel: string;
  departureNote: string | null;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  requestNotes: string | null;
  arrivalSectionLabel: string;
  arrivalPlace: string | null;
  arrivalInstructions: string | null;
  pickupTimeHm: string | null;
  transferLine: string | null;
  unpaidHoldMessage: string | null;
  cancelWaitingMessage: string | null;
  finance: TourOpsDetailFinance;
};

type Props = {
  model: TourOpsDetailModel;
  busy?: boolean;
  canEdit: boolean;
  copied?: boolean;
  showConfirm?: boolean;
  showCancelRequest?: boolean;
  cancelBlocked?: boolean;
  onBack: () => void;
  /** Defaults to “Back to bookings”. Use “Back to Inbox” when returning from Message Guest. */
  backLabel?: string;
  onCopyReference: () => void;
  onMessageGuest: () => void;
  onConfirm?: () => void;
  onRequestCancel?: () => void;
  onOpenFinancialStatement?: () => void;
  onOpenPickupPlanner?: () => void;
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

export default function TourOpsBookingDetail({
  model,
  busy,
  canEdit,
  copied,
  showConfirm,
  showCancelRequest,
  cancelBlocked,
  onBack,
  backLabel = 'Back to bookings',
  onCopyReference,
  onMessageGuest,
  onConfirm,
  onRequestCancel,
  onOpenFinancialStatement,
  onOpenPickupPlanner,
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
            <span className="tour-ops-detail__ref-label">Booking</span>{' '}
            <span className="tour-ops-detail__ref-code">{model.referenceLabel}</span>
          </p>
          <button
            type="button"
            className="tour-ops-detail__copy lux-flat"
            onClick={onCopyReference}
            aria-label={`Copy booking reference ${model.referenceLabel}`}
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
          {model.optionLabel ? (
            <p className="tour-ops-detail__option" title={model.optionLabel}>
              {model.optionLabel}
            </p>
          ) : null}
          <div className="tour-ops-detail__exp-meta">
            <span>{model.whenLabel}</span>
            {model.durationLabel ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
                {model.durationLabel}
              </span>
            ) : null}
            <span>{model.participantLabel}</span>
          </div>
          {model.departureNote ? <p className="tour-ops-detail__note">{model.departureNote}</p> : null}
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
              ) : null}
              {model.guestPhone ? (
                <Fact label="Phone">
                  <a href={phoneHref} className="text-finland hover:underline">
                    {model.guestPhone}
                  </a>
                </Fact>
              ) : null}
              <Fact label="Participants">{model.participantLabel}</Fact>
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
            <h2 className="tour-ops-detail__heading">{model.arrivalSectionLabel}</h2>
            {model.arrivalPlace ? (
              <p className="tour-ops-detail__place">{model.arrivalPlace}</p>
            ) : (
              <p className="tour-ops-detail__muted">
                {model.pickupGapMessage || 'Location details are not available yet.'}
              </p>
            )}
            {model.pickupTimeHm ? (
              <p className="mt-1.5 text-[13px] text-ink">
                <span className="text-ink-muted">Pickup time · </span>
                {model.pickupTimeHm}
              </p>
            ) : null}
            {model.arrivalInstructions ? (
              <div className="mt-2">
                <p className="tour-ops-detail__sublabel">Instructions</p>
                <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-ink">
                  {model.arrivalInstructions}
                </p>
              </div>
            ) : null}
            {model.transferLine ? (
              <div className="mt-2">
                <p className="tour-ops-detail__sublabel">Transport</p>
                <p className="text-[13px] text-ink">{model.transferLine}</p>
              </div>
            ) : null}
            {model.pickupGapMessage && model.arrivalPlace ? (
              <p className="mt-2 text-[13px] text-amber-900">{model.pickupGapMessage}</p>
            ) : null}
            {model.pickupGapMessage && onOpenPickupPlanner ? (
              <button
                type="button"
                className="mt-1.5 text-[12.5px] font-semibold text-finland hover:underline"
                onClick={onOpenPickupPlanner}
              >
                Open Pickup planner
              </button>
            ) : null}
          </section>

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
              <p className="text-[13px] text-ink-muted">Payment breakdown is not recorded for this booking.</p>
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
