/**
 * Phase 3 Trips UI: supplier cancelled before official start —
 * choose full refund or another available tour departure.
 */
import { useCallback, useEffect, useState } from 'react';
import NoticeCallout from './NoticeCallout';
import type { BookingRow } from '../data/supabase-bookings';
import {
  claimSupplierCancelRefundChoice,
  rescheduleSupplierCancelledBooking,
} from '../data/supabase-booking-ops';
import {
  bookingAwaitingSupplierCancelChoice,
  listTourRescheduleDepartures,
  type RescheduleDepartureOption,
} from '../data/supplier-cancel-resolution';
import { bookingIsStayNight } from '../lib/pickup-completeness';
import {
  displayDepartureTimezoneFromPurchase,
  displayStartTimeFromPurchase,
  formatTravelerDepartureClock,
  type PurchaseSnapshot,
} from '../lib/purchase-snapshot';
import { travelerSelfCancelStartHm } from '../lib/cancellation-policy';
import { resolveDepartureTimezone } from '../lib/tour-departure-cutoff';
import { formatBookingDateDisplay } from '../lib/booking-flow';
import { userFacingError } from '../lib/userFacingError';
import { pgTimeToHm } from '../data/supabase-listings';

type Props = {
  booking: BookingRow;
  listingExtras: unknown;
  onContactOperator: () => void;
  onContactSupport: () => void;
  onResolved: (opts?: { newBookingId?: string }) => void;
};

function deadlineLabel(booking: BookingRow): string {
  const snap = booking.purchase_snapshot as PurchaseSnapshot | null | undefined;
  const tz =
    displayDepartureTimezoneFromPurchase(snap) ||
    resolveDepartureTimezone(snap?.departureTimezone) ||
    'Europe/Helsinki';
  const day = String(booking.booking_date ?? '').slice(0, 10);
  const hm =
    travelerSelfCancelStartHm({
      isStay: bookingIsStayNight(booking),
      cancelReferenceStartHm: snap?.cancelReferenceStartHm ?? null,
      startTimeHm: snap?.startTimeHm ?? (booking.start_time ? pgTimeToHm(booking.start_time) : null),
    }) || '00:00';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'the original start time';
  const clock = formatTravelerDepartureClock(hm, tz);
  return `${formatBookingDateDisplay(day)} at ${clock} (${tz})`;
}

export default function SupplierCancelResolutionPanel({
  booking,
  listingExtras,
  onContactOperator,
  onContactSupport,
  onResolved,
}: Props) {
  const [busy, setBusy] = useState<'refund' | 'reschedule' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickingDate, setPickingDate] = useState(false);
  const [options, setOptions] = useState<RescheduleDepartureOption[] | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const isStay = bookingIsStayNight(booking);
  const awaiting = bookingAwaitingSupplierCancelChoice(booking);
  const deadline = deadlineLabel(booking);

  const loadOptions = useCallback(async () => {
    if (isStay) {
      setOptions([]);
      return;
    }
    setLoadingOptions(true);
    setError(null);
    try {
      const rows = await listTourRescheduleDepartures({ booking, listingExtras });
      setOptions(rows);
    } catch (e) {
      setOptions([]);
      setError(userFacingError(e, 'Could not load available departures.'));
    } finally {
      setLoadingOptions(false);
    }
  }, [booking, listingExtras, isStay]);

  useEffect(() => {
    if (pickingDate && options === null && !loadingOptions) {
      void loadOptions();
    }
  }, [pickingDate, options, loadingOptions, loadOptions]);

  if (!awaiting) return null;

  const handleRefund = async () => {
    setBusy('refund');
    setError(null);
    const res = await claimSupplierCancelRefundChoice(booking.id);
    setBusy(null);
    if (!res.ok && !res.alreadyResolved) {
      setError(userFacingError(res.error, 'Could not start your refund.'));
      return;
    }
    onResolved();
  };

  const handleReschedule = async (opt: RescheduleDepartureOption) => {
    setBusy('reschedule');
    setError(null);
    const res = await rescheduleSupplierCancelledBooking({
      bookingId: booking.id,
      newDate: opt.date,
      newStartTimeHm: opt.startTimeHm,
    });
    setBusy(null);
    if (!res.ok) {
      if (res.inventoryUnavailable) {
        setError('That departure is no longer available. Pick another date or get a full refund.');
        setOptions(null);
        void loadOptions();
        return;
      }
      if (res.deadlinePassed) {
        setError(userFacingError(res.error, 'The choice deadline has passed.'));
        onResolved();
        return;
      }
      if (res.alreadyResolved) {
        onResolved();
        return;
      }
      setError(userFacingError(res.error, 'Could not reschedule this booking.'));
      return;
    }
    onResolved({ newBookingId: res.newBookingId });
  };

  const startHm = displayStartTimeFromPurchase(
    booking.purchase_snapshot as PurchaseSnapshot | null | undefined,
    booking.start_time ? pgTimeToHm(booking.start_time) : null
  );

  return (
    <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 p-3.5 sm:p-4">
      <NoticeCallout title="Operator cancelled — choose a resolution" tone="warn">
        Your operator has cancelled this activity. Choose a full refund or another available departure
        before {deadline}. If you don&apos;t choose, your full refund will begin automatically.
        {startHm ? (
          <span className="mt-1 block text-ink-muted">
            Original start: {formatBookingDateDisplay(String(booking.booking_date ?? '').slice(0, 10))}{' '}
            · {startHm}
          </span>
        ) : null}
      </NoticeCallout>

      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="tv-btn-primary"
          disabled={busy !== null}
          onClick={() => void handleRefund()}
        >
          {busy === 'refund' ? 'Starting refund…' : 'Get full refund'}
        </button>
        {!isStay ? (
          <button
            type="button"
            className="tv-btn-secondary"
            disabled={busy !== null}
            onClick={() => {
              setPickingDate((v) => !v);
              if (!pickingDate) setOptions(null);
            }}
          >
            Choose another date
          </button>
        ) : null}
        <button type="button" className="tv-btn-ghost" disabled={busy !== null} onClick={onContactOperator}>
          Contact operator
        </button>
        <button type="button" className="tv-btn-ghost" disabled={busy !== null} onClick={onContactSupport}>
          Contact Traverion Support
        </button>
      </div>

      {isStay ? (
        <p className="mt-3 text-sm text-ink-muted">
          Stay rescheduling is not offered here. You can take a full refund, or contact Support if you
          need help with new dates.
        </p>
      ) : null}

      {pickingDate && !isStay ? (
        <div className="mt-3 space-y-2 border-t border-amber-200/60 pt-3">
          <p className="text-sm font-semibold text-ink">Available departures</p>
          {loadingOptions ? (
            <p className="text-sm text-ink-muted">Checking availability…</p>
          ) : options && options.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No alternative departures are available for this activity right now. You can still get a
              full refund. If you don&apos;t choose, your refund begins automatically at the deadline.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {(options ?? []).map((opt) => (
                <li key={`${opt.date}|${opt.startTimeHm}`}>
                  <button
                    type="button"
                    className="tv-btn-secondary w-full justify-between text-left"
                    disabled={busy !== null}
                    onClick={() => void handleReschedule(opt)}
                  >
                    <span>{opt.label}</span>
                    <span className="text-xs font-medium text-ink-muted">
                      {opt.remaining} left
                      {busy === 'reschedule' ? ' · Saving…' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
