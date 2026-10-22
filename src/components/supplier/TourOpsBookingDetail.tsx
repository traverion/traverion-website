/**
 * Dedicated tour booking details page — premium two-column layout.
 */
import { type ReactNode } from 'react';
import { Clock } from 'lucide-react';
import {
  BookingOpsActionRail,
  BookingOpsBackLink,
  BookingOpsExperience,
  BookingOpsFact,
  BookingOpsFinancePanel,
  BookingOpsRefBar,
  type TourOpsDetailFinance,
} from './BookingOpsDetailPrimitives';

export type { TourOpsDetailFinance };

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
  pickupGapMessage?: string | null;
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
  backLabel?: string;
  onCopyReference: () => void;
  onMessageGuest: () => void;
  onConfirm?: () => void;
  onRequestCancel?: () => void;
  onOpenFinancialStatement?: () => void;
  onOpenPickupPlanner?: () => void;
  extraNotices?: ReactNode;
  privateNotesSlot?: ReactNode;
};

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
  privateNotesSlot,
}: Props) {
  const phoneHref = model.guestPhone ? `tel:${model.guestPhone.replace(/[^\d+]/g, '')}` : '';
  const showOpsNotices = Boolean(
    model.unpaidHoldMessage || model.cancelWaitingMessage || extraNotices
  );

  return (
    <div className="tour-ops-detail">
      <BookingOpsBackLink label={backLabel} onBack={onBack} />

      <BookingOpsRefBar
        kindLabel="Booking"
        referenceLabel={model.referenceLabel}
        statusLabel={model.statusLabel}
        statusClass={model.statusClass}
        copied={copied}
        onCopyReference={onCopyReference}
      />

      <BookingOpsExperience
        imageUrl={model.imageUrl}
        title={model.listingTitle}
        subtitle={model.optionLabel || null}
        note={model.departureNote}
        meta={
          <>
            <span>{model.whenLabel}</span>
            {model.durationLabel ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
                {model.durationLabel}
              </span>
            ) : null}
            <span>{model.participantLabel}</span>
          </>
        }
      />

      <div className="tour-ops-detail__grid">
        <div className="tour-ops-detail__main">
          <section className="tour-ops-detail__section">
            <h2 className="tour-ops-detail__heading">Guest</h2>
            <dl className="tour-ops-detail__facts">
              <BookingOpsFact label="Lead guest">{model.guestName}</BookingOpsFact>
              {model.guestEmail ? (
                <BookingOpsFact label="Email">
                  <a
                    href={`mailto:${model.guestEmail}`}
                    className="text-finland hover:underline [overflow-wrap:anywhere]"
                  >
                    {model.guestEmail}
                  </a>
                </BookingOpsFact>
              ) : null}
              {model.guestPhone ? (
                <BookingOpsFact label="Phone">
                  <a href={phoneHref} className="text-finland hover:underline">
                    {model.guestPhone}
                  </a>
                </BookingOpsFact>
              ) : null}
              <BookingOpsFact label="Participants">{model.participantLabel}</BookingOpsFact>
            </dl>
            {model.requestNotes ? (
              <div className="tour-ops-detail__notes">
                <p className="tour-ops-detail__sublabel">Guest notes</p>
                <p className="tour-ops-detail__body-text">{model.requestNotes}</p>
              </div>
            ) : null}
          </section>

          <section className="tour-ops-detail__section">
            <h2 className="tour-ops-detail__heading">{model.arrivalSectionLabel}</h2>
            <dl className="tour-ops-detail__facts">
              <BookingOpsFact label="Location">
                {model.arrivalPlace || (
                  <span className="tour-ops-detail__muted-inline">
                    {model.pickupGapMessage || 'Not available yet'}
                  </span>
                )}
              </BookingOpsFact>
              {model.pickupTimeHm ? (
                <BookingOpsFact label="Pickup time">
                  <span className="tour-ops-detail__pickup-time">{model.pickupTimeHm}</span>
                </BookingOpsFact>
              ) : null}
              {model.arrivalInstructions ? (
                <BookingOpsFact label="Instructions">
                  <span className="tour-ops-detail__body-text">{model.arrivalInstructions}</span>
                </BookingOpsFact>
              ) : null}
              {model.transferLine ? (
                <BookingOpsFact label="Transport">{model.transferLine}</BookingOpsFact>
              ) : null}
            </dl>
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

          {privateNotesSlot}
        </div>

        <aside className="tour-ops-detail__aside">
          <BookingOpsFinancePanel
            finance={model.finance}
            emptyLabel="Payment breakdown is not recorded for this booking."
            onOpenFinancialStatement={onOpenFinancialStatement}
          />
          <BookingOpsActionRail
            busy={busy}
            canEdit={canEdit}
            showConfirm={showConfirm}
            showCancelRequest={showCancelRequest}
            cancelBlocked={cancelBlocked}
            onConfirm={onConfirm}
            onMessageGuest={onMessageGuest}
            onRequestCancel={onRequestCancel}
          />
        </aside>
      </div>
    </div>
  );
}
