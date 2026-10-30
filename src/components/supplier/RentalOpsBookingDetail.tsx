/**
 * Dedicated rental booking details — collection/return handover workflow.
 */
import { type ReactNode } from 'react';
import RentalCollectionMap from './listing-creation/RentalCollectionMap';
import {
  BookingOpsActionRail,
  BookingOpsBackLink,
  BookingOpsExperience,
  BookingOpsFact,
  BookingOpsFinancePanel,
  BookingOpsRefBar,
  type TourOpsDetailFinance,
} from './BookingOpsDetailPrimitives';

export type RentalOpsDetailModel = {
  referenceLabel: string;
  statusLabel: string;
  statusClass: string;
  listingTitle: string;
  variantLabel: string | null;
  imageUrl: string | null;
  periodLine: string;
  quantityLabel: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  requestNotes: string | null;
  collectionLabel: string;
  returnLabel: string;
  collectionPlace: string | null;
  returnPlace: string | null;
  returnSameAsCollection: boolean;
  collectionInstructions: string | null;
  returnInstructions: string | null;
  collectionLat: number | null;
  collectionLng: number | null;
  returnLat: number | null;
  returnLng: number | null;
  handoverLabel: string;
  handoverNote: string | null;
  unpaidHoldMessage: string | null;
  cancelWaitingMessage: string | null;
  finance: TourOpsDetailFinance;
};

export type RentalOpsDetailActivityItem = {
  id: string;
  label: string;
  detail?: string | null;
  at: string | null;
};

type Props = {
  model: RentalOpsDetailModel;
  activity: RentalOpsDetailActivityItem[];
  busy?: boolean;
  canEdit: boolean;
  copied?: boolean;
  showConfirm?: boolean;
  showCancelRequest?: boolean;
  cancelBlocked?: boolean;
  /** Next handover action when paid + confirmed. */
  handoverAction?: 'collected' | 'returned' | null;
  onBack: () => void;
  backLabel?: string;
  onCopyReference: () => void;
  onMessageCustomer: () => void;
  onConfirm?: () => void;
  onRequestCancel?: () => void;
  onOpenFinancialStatement?: () => void;
  onHandoverAction?: () => void;
  privateNotesSlot?: ReactNode;
};

function formatActivityAt(at: string | null): string {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function RentalOpsBookingDetail({
  model,
  activity,
  busy,
  canEdit,
  copied,
  showConfirm,
  showCancelRequest,
  cancelBlocked,
  handoverAction,
  onBack,
  backLabel = 'Back to rental bookings',
  onCopyReference,
  onMessageCustomer,
  onConfirm,
  onRequestCancel,
  onOpenFinancialStatement,
  onHandoverAction,
  privateNotesSlot,
}: Props) {
  const phoneHref = model.customerPhone ? `tel:${model.customerPhone.replace(/[^\d+]/g, '')}` : '';
  const showOpsNotices = Boolean(model.unpaidHoldMessage || model.cancelWaitingMessage);
  const showReturnMap =
    !model.returnSameAsCollection &&
    typeof model.returnLat === 'number' &&
    typeof model.returnLng === 'number';
  const showCollectionMap =
    typeof model.collectionLat === 'number' && typeof model.collectionLng === 'number';

  return (
    <div className="tour-ops-detail">
      <BookingOpsBackLink label={backLabel} onBack={onBack} />

      <BookingOpsRefBar
        kindLabel="Rental booking"
        referenceLabel={model.referenceLabel}
        statusLabel={model.statusLabel}
        statusClass={model.statusClass}
        copied={copied}
        onCopyReference={onCopyReference}
      />

      <BookingOpsExperience
        imageUrl={model.imageUrl}
        title={model.listingTitle}
        subtitle={model.variantLabel}
        meta={
          <>
            <span>{model.periodLine}</span>
            <span>{model.quantityLabel}</span>
            <span>{model.handoverLabel}</span>
          </>
        }
      />

      <div className="tour-ops-detail__grid">
        <div className="tour-ops-detail__main">
          <section className="tour-ops-detail__section">
            <h2 className="tour-ops-detail__heading">Rental details</h2>
            <dl className="tour-ops-detail__facts">
              <BookingOpsFact label="Collection">{model.collectionLabel || '—'}</BookingOpsFact>
              <BookingOpsFact label="Return">{model.returnLabel || '—'}</BookingOpsFact>
              <BookingOpsFact label="Quantity">{model.quantityLabel}</BookingOpsFact>
              {model.collectionPlace ? (
                <BookingOpsFact label="Collection place">
                  <span className="[overflow-wrap:anywhere]">{model.collectionPlace}</span>
                </BookingOpsFact>
              ) : null}
              {model.returnPlace ? (
                <BookingOpsFact label="Return place">
                  <span className="[overflow-wrap:anywhere]">
                    {model.returnSameAsCollection
                      ? `Same as collection · ${model.returnPlace}`
                      : model.returnPlace}
                  </span>
                </BookingOpsFact>
              ) : null}
              {model.collectionInstructions ? (
                <BookingOpsFact label="Collection notes">
                  <span className="tour-ops-detail__body-text">{model.collectionInstructions}</span>
                </BookingOpsFact>
              ) : null}
              {!model.returnSameAsCollection && model.returnInstructions ? (
                <BookingOpsFact label="Return notes">
                  <span className="tour-ops-detail__body-text">{model.returnInstructions}</span>
                </BookingOpsFact>
              ) : null}
            </dl>
            {(showCollectionMap || showReturnMap) && (
              <div className="mt-3 max-w-sm space-y-2">
                {showCollectionMap ? (
                  <RentalCollectionMap
                    lat={model.collectionLat!}
                    lng={model.collectionLng!}
                    label={
                      model.returnSameAsCollection
                        ? 'Collection and return map'
                        : 'Collection location map'
                    }
                  />
                ) : null}
                {showReturnMap ? (
                  <RentalCollectionMap
                    lat={model.returnLat!}
                    lng={model.returnLng!}
                    label="Return location map"
                  />
                ) : null}
              </div>
            )}
          </section>

          <section className="tour-ops-detail__section">
            <h2 className="tour-ops-detail__heading">Customer</h2>
            <dl className="tour-ops-detail__facts">
              <BookingOpsFact label="Customer">{model.customerName}</BookingOpsFact>
              {model.customerEmail ? (
                <BookingOpsFact label="Email">
                  <a
                    href={`mailto:${model.customerEmail}`}
                    className="text-finland hover:underline [overflow-wrap:anywhere]"
                  >
                    {model.customerEmail}
                  </a>
                </BookingOpsFact>
              ) : (
                <BookingOpsFact label="Email">No email on file</BookingOpsFact>
              )}
              {model.customerPhone ? (
                <BookingOpsFact label="Phone">
                  <a href={phoneHref} className="text-finland hover:underline">
                    {model.customerPhone}
                  </a>
                </BookingOpsFact>
              ) : null}
            </dl>
            {model.requestNotes ? (
              <div className="tour-ops-detail__notes">
                <p className="tour-ops-detail__sublabel">Customer notes</p>
                <p className="tour-ops-detail__body-text">{model.requestNotes}</p>
              </div>
            ) : null}
          </section>

          <section className="tour-ops-detail__section">
            <h2 className="tour-ops-detail__heading">Handover</h2>
            <p className="text-[14px] font-semibold tracking-tight text-ink">{model.handoverLabel}</p>
            {model.handoverNote ? (
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{model.handoverNote}</p>
            ) : null}
            {canEdit && handoverAction && onHandoverAction ? (
              <button
                type="button"
                className="tv-btn-primary mt-3 min-h-9 text-sm"
                disabled={busy}
                onClick={onHandoverAction}
              >
                {busy
                  ? 'Saving…'
                  : handoverAction === 'collected'
                    ? 'Mark collected'
                    : 'Mark returned'}
              </button>
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
            </section>
          ) : null}

          {privateNotesSlot}
        </div>

        <aside className="tour-ops-detail__aside">
          <BookingOpsFinancePanel
            finance={model.finance}
            emptyLabel="Payment breakdown is not recorded for this rental booking."
            onOpenFinancialStatement={onOpenFinancialStatement}
          />
          <BookingOpsActionRail
            busy={busy}
            canEdit={canEdit}
            showConfirm={showConfirm}
            showCancelRequest={showCancelRequest}
            cancelBlocked={cancelBlocked}
            onConfirm={onConfirm}
            onMessageGuest={onMessageCustomer}
            onRequestCancel={onRequestCancel}
          />
        </aside>
      </div>
    </div>
  );
}
