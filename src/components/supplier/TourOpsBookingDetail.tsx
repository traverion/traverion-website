/**
 * Dedicated tour booking details page — premium two-column layout.
 */
import { type ReactNode } from 'react';
import {
  Calendar,
  Clock,
  FileText,
  MapPin,
  NotebookPen,
  Phone,
  User,
  Users,
} from 'lucide-react';
import {
  BookingOpsActionRail,
  BookingOpsBackLink,
  BookingOpsExperience,
  BookingOpsFact,
  BookingOpsFinancePanel,
  BookingOpsMetaItem,
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
  fulfillmentStatus?: string | null;
  fulfillmentHint?: string | null;
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
  onFulfillmentChange?: (status: 'completed' | 'no_show' | 'disputed' | 'in_progress') => void;
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
  onFulfillmentChange,
  extraNotices,
  privateNotesSlot,
}: Props) {
  const phoneHref = model.guestPhone ? `tel:${model.guestPhone.replace(/[^\d+]/g, '')}` : '';
  const showOpsNotices = Boolean(
    model.unpaidHoldMessage || model.cancelWaitingMessage || extraNotices
  );
  const fulfillment = String(model.fulfillmentStatus ?? 'scheduled').toLowerCase();

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
            <BookingOpsMetaItem icon={Calendar}>{model.whenLabel}</BookingOpsMetaItem>
            {model.durationLabel ? (
              <BookingOpsMetaItem icon={Clock}>{model.durationLabel}</BookingOpsMetaItem>
            ) : null}
            <BookingOpsMetaItem icon={Users}>{model.participantLabel}</BookingOpsMetaItem>
          </>
        }
      />

      <div className="tour-ops-detail__grid">
        <div className="tour-ops-detail__main">
          <section className="tour-ops-detail__section">
            <h2 className="tour-ops-detail__heading">Guest</h2>
            <dl className="tour-ops-detail__facts">
              <BookingOpsFact label="Lead guest" icon={User}>
                {model.guestName}
              </BookingOpsFact>
              {model.guestPhone ? (
                <BookingOpsFact label="Phone" icon={Phone}>
                  <a href={phoneHref} className="text-finland hover:underline">
                    {model.guestPhone}
                  </a>
                </BookingOpsFact>
              ) : null}
              <BookingOpsFact label="Participants" icon={Users}>
                {model.participantLabel}
              </BookingOpsFact>
            </dl>
            {model.requestNotes ? (
              <div className="tour-ops-detail__notes">
                <p className="tour-ops-detail__sublabel tour-ops-detail__sublabel--with-icon">
                  <FileText className="tour-ops-detail__sublabel-icon" strokeWidth={2} aria-hidden />
                  Guest notes
                </p>
                <p className="tour-ops-detail__body-text">{model.requestNotes}</p>
              </div>
            ) : null}
          </section>

          <section className="tour-ops-detail__section">
            <h2 className="tour-ops-detail__heading">{model.arrivalSectionLabel}</h2>
            <dl className="tour-ops-detail__facts">
              <BookingOpsFact label="Location" icon={MapPin}>
                {model.arrivalPlace || (
                  <span className="tour-ops-detail__muted-inline">
                    {model.pickupGapMessage || 'Not available yet'}
                  </span>
                )}
              </BookingOpsFact>
              {model.pickupTimeHm ? (
                <BookingOpsFact label="Pickup time" icon={Clock}>
                  <span className="tour-ops-detail__pickup-time">{model.pickupTimeHm}</span>
                </BookingOpsFact>
              ) : null}
              {model.arrivalInstructions ? (
                <BookingOpsFact label="Instructions" icon={FileText}>
                  <span className="tour-ops-detail__body-text">{model.arrivalInstructions}</span>
                </BookingOpsFact>
              ) : null}
              {model.transferLine ? (
                <BookingOpsFact label="Transport" icon={MapPin}>
                  {model.transferLine}
                </BookingOpsFact>
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
                <p className="text-[13px] text-ink">{model.unpaidHoldMessage}</p>
              ) : null}
              {model.cancelWaitingMessage ? (
                <p className="mt-1 text-[13px] text-amber-900">{model.cancelWaitingMessage}</p>
              ) : null}
              {extraNotices}
            </section>
          ) : null}

          {onFulfillmentChange ? (
            <section className="tour-ops-detail__section">
              <h2 className="tour-ops-detail__heading">Service fulfillment</h2>
              <p className="text-[13px] text-ink">
                Status: <span className="font-semibold">{fulfillment.replace('_', ' ')}</span>
              </p>
              {model.fulfillmentHint ? (
                <p className="mt-1 text-[12.5px] text-amber-900">{model.fulfillmentHint}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="tv-btn-secondary text-xs disabled:opacity-50"
                  disabled={busy || !canEdit || fulfillment === 'completed'}
                  onClick={() => onFulfillmentChange('completed')}
                >
                  Mark completed
                </button>
                <button
                  type="button"
                  className="tv-btn-secondary text-xs disabled:opacity-50"
                  disabled={busy || !canEdit || fulfillment === 'no_show'}
                  onClick={() => onFulfillmentChange('no_show')}
                >
                  No-show
                </button>
                <button
                  type="button"
                  className="tv-btn-secondary text-xs disabled:opacity-50"
                  disabled={busy || !canEdit || fulfillment === 'disputed'}
                  onClick={() => onFulfillmentChange('disputed')}
                >
                  Disputed
                </button>
              </div>
              <p className="mt-2 text-[11.5px] text-ink-muted">
                Payouts stay held until completed and reconciled. No-show/dispute settlement policy is
                not defined yet — those stay held.
              </p>
            </section>
          ) : null}

          {privateNotesSlot ? (
            <div className="tour-ops-detail__private-notes">
              <span className="sr-only">
                <NotebookPen aria-hidden />
              </span>
              {privateNotesSlot}
            </div>
          ) : null}
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
