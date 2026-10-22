/**
 * Dedicated Stay reservation details page — premium two-column layout.
 */
import { type ReactNode } from 'react';
import {
  BookingOpsActionRail,
  BookingOpsBackLink,
  BookingOpsExperience,
  BookingOpsFact,
  BookingOpsFinancePanel,
  BookingOpsRefBar,
  BookingOpsRuleList,
  type TourOpsDetailFinance,
} from './BookingOpsDetailPrimitives';

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
  privateNotesSlot?: ReactNode;
};

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
        kindLabel="Reservation"
        referenceLabel={model.referenceLabel}
        statusLabel={model.statusLabel}
        statusClass={model.statusClass}
        copied={copied}
        onCopyReference={onCopyReference}
      />

      <BookingOpsExperience
        imageUrl={model.imageUrl}
        title={model.listingTitle}
        meta={
          <>
            <span>{model.whenLabel}</span>
            {model.nightLabel ? <span>{model.nightLabel}</span> : null}
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
              ) : (
                <BookingOpsFact label="Email">No email on file</BookingOpsFact>
              )}
              {model.guestPhone ? (
                <BookingOpsFact label="Phone">
                  <a href={phoneHref} className="text-finland hover:underline">
                    {model.guestPhone}
                  </a>
                </BookingOpsFact>
              ) : null}
              <BookingOpsFact label="Guests">{model.participantLabel}</BookingOpsFact>
            </dl>
            {model.requestNotes ? (
              <div className="tour-ops-detail__notes">
                <p className="tour-ops-detail__sublabel">Guest notes</p>
                <p className="tour-ops-detail__body-text">{model.requestNotes}</p>
              </div>
            ) : null}
          </section>

          <section className="tour-ops-detail__section">
            <h2 className="tour-ops-detail__heading">Arrival & departure</h2>
            <dl className="tour-ops-detail__facts">
              <BookingOpsFact label="Check-in">
                {model.checkInDateLabel}
                {model.checkInTimeLabel ? ` · from ${model.checkInTimeLabel}` : ''}
              </BookingOpsFact>
              <BookingOpsFact label="Check-out">
                {model.checkOutDateLabel}
                {model.checkOutTimeLabel ? ` · by ${model.checkOutTimeLabel}` : ''}
              </BookingOpsFact>
              {model.nightLabel ? <BookingOpsFact label="Nights">{model.nightLabel}</BookingOpsFact> : null}
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
            <dl className="tour-ops-detail__facts">
              {model.propertyAddress ? (
                <BookingOpsFact label="Address">
                  <span className="[overflow-wrap:anywhere]">{model.propertyAddress}</span>
                </BookingOpsFact>
              ) : null}
              {model.accessInstructions ? (
                <BookingOpsFact label="Access">
                  <span className="tour-ops-detail__body-text">{model.accessInstructions}</span>
                </BookingOpsFact>
              ) : null}
            </dl>
            {model.houseRules ? (
              <div className="tour-ops-detail__rules">
                <p className="tour-ops-detail__sublabel">House rules</p>
                <BookingOpsRuleList text={model.houseRules} />
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
                    <span className="tour-ops-detail__activity-dot" aria-hidden />
                    <div className="min-w-0">
                      <p className="tour-ops-detail__activity-label">{item.label}</p>
                      {item.detail ? (
                        <p className="tour-ops-detail__activity-detail">{item.detail}</p>
                      ) : null}
                      {item.at ? (
                        <time dateTime={item.at} className="tour-ops-detail__activity-at">
                          {formatActivityAt(item.at)}
                        </time>
                      ) : null}
                    </div>
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

          {privateNotesSlot}
        </div>

        <aside className="tour-ops-detail__aside">
          <BookingOpsFinancePanel
            finance={model.finance}
            emptyLabel="Payment breakdown is not recorded for this reservation."
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
            requestActionsSlot={
              showRequestActions && requestActionsSlot ? (
                <div className="tour-ops-detail__request-actions">{requestActionsSlot}</div>
              ) : null
            }
          />
        </aside>
      </div>
    </div>
  );
}
