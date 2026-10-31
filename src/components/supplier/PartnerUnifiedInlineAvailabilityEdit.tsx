/**
 * Mission 05.6.x — Compact inline availability controls for a listing/day/event.
 * Reuses Mission 05.3 day-edit APIs; no side panel / no second engine.
 */
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { TourPackage } from '../../types/tour';
import type { BookingRow } from '../../data/supabase-bookings';
import {
  fetchAvailabilityByListingId,
  type AvailabilityRow,
} from '../../data/supabase-availability';
import {
  fetchRentalAvailabilityBlocks,
  fetchRentalInventoryHolds,
  type RentalAvailabilityBlockRow,
  type RentalInventoryHoldRow,
} from '../../data/supabase-rental-availability';
import AvailabilityCutoffField from './AvailabilityCutoffField';
import NoticeCallout from '../NoticeCallout';
import {
  partnerUnifiedAdjustRentalStock,
  partnerUnifiedBlockRentalDay,
  partnerUnifiedBlockStayNight,
  partnerUnifiedDayBoundsUtc,
  partnerUnifiedListingFamily,
  partnerUnifiedRentalDayVariants,
  partnerUnifiedSaveTourDepartureWithListing,
  partnerUnifiedSetTourDayClosed,
  partnerUnifiedStayNightSummary,
  partnerUnifiedTourDayIsClosed,
  partnerUnifiedTourDeparturesForDay,
  partnerUnifiedUnblockRentalDay,
  partnerUnifiedUnblockStayNight,
} from '../../lib/partner-unified-day-edits';
import { stayCalendarNightKindLabel } from '../../lib/stay-calendar-workspace';
import { openSupplierBooking } from '../../lib/supplierPortalNavigation';
import {
  partnerUnifiedEventKindLabel,
  type PartnerUnifiedCalendarEvent,
} from '../../lib/partner-unified-calendar';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { normalizeStartTimeHm } from '../../lib/listing-slot-overrides';

type Props = {
  iso: string;
  listing: TourPackage;
  bookings: BookingRow[];
  event?: PartnerUnifiedCalendarEvent | null;
  canEdit: boolean;
  userId?: string | null;
  onListingsChange: Dispatch<SetStateAction<TourPackage[]>>;
  onSaved?: () => void;
};

export default function PartnerUnifiedInlineAvailabilityEdit({
  iso,
  listing,
  bookings,
  event = null,
  canEdit,
  userId,
  onListingsChange,
  onSaved,
}: Props) {
  const family = partnerUnifiedListingFamily(listing);
  const [caps, setCaps] = useState<AvailabilityRow[]>([]);
  const [blocks, setBlocks] = useState<RentalAvailabilityBlockRow[]>([]);
  const [holds, setHolds] = useState<RentalInventoryHoldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [spots, setSpots] = useState('');
  const [cutoffHours, setCutoffHours] = useState('0');
  const [stock, setStock] = useState('1');

  const listingBookings = useMemo(
    () => bookings.filter((b) => b.listing_id === listing.id),
    [bookings, listing.id]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (family === 'rental') {
        const bounds = partnerUnifiedDayBoundsUtc(iso);
        const [b, h] = await Promise.all([
          fetchRentalAvailabilityBlocks(listing.id, bounds.startIso, bounds.endIso),
          fetchRentalInventoryHolds(listing.id, bounds.startIso, bounds.endIso),
        ]);
        setBlocks(b);
        setHolds(h);
        setCaps([]);
      } else {
        const rows = await fetchAvailabilityByListingId(listing.id, {
          fromDate: iso,
          toDate: iso,
        });
        setCaps(rows);
        setBlocks([]);
        setHolds([]);
      }
    } catch (e) {
      setError(userFacingError(e, USER_ERROR.calendar));
    } finally {
      setLoading(false);
    }
  }, [family, iso, listing.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const tourDeps = useMemo(() => {
    if (family !== 'tour') return [];
    return partnerUnifiedTourDeparturesForDay({
      listing,
      iso,
      bookings: listingBookings,
    });
  }, [family, listing, iso, listingBookings]);

  const focusedDep = useMemo(() => {
    if (family !== 'tour' || tourDeps.length === 0) return null;
    const hm = normalizeStartTimeHm(event?.timeHm) || (event?.timeHm ?? '').slice(0, 5);
    if (hm) {
      const match = tourDeps.find((d) => d.startTimeHm === hm);
      if (match) return match;
    }
    if (event?.optionLabel) {
      const match = tourDeps.find((d) => d.optionName === event.optionLabel);
      if (match) return match;
    }
    return tourDeps[0] ?? null;
  }, [family, tourDeps, event]);

  useEffect(() => {
    if (focusedDep) {
      setSpots(String(focusedDep.capacity));
      setCutoffHours(String(focusedDep.cutoffHours));
    }
  }, [focusedDep]);

  const dayClosed = family === 'tour' ? partnerUnifiedTourDayIsClosed(caps, iso) : false;

  const staySummary = useMemo(() => {
    if (family !== 'stay') return null;
    return partnerUnifiedStayNightSummary({
      listingId: listing.id,
      iso,
      bookings: listingBookings,
      caps: caps.map((c) => ({
        listing_id: c.listing_id,
        available_date: c.available_date,
        capacity: c.capacity,
      })),
    });
  }, [family, listing.id, iso, listingBookings, caps]);

  const rentalVariants = useMemo(() => {
    if (family !== 'rental') return [];
    return partnerUnifiedRentalDayVariants({ listing, iso, blocks, holds });
  }, [family, listing, iso, blocks, holds]);

  const focusedVariant = useMemo(() => {
    if (family !== 'rental' || rentalVariants.length === 0) return null;
    if (event?.optionLabel) {
      const match = rentalVariants.find((v) => v.name === event.optionLabel);
      if (match) return match;
    }
    return rentalVariants[0] ?? null;
  }, [family, rentalVariants, event]);

  useEffect(() => {
    if (focusedVariant) setStock(String(focusedVariant.stock));
  }, [focusedVariant]);

  const run = async (
    fn: () => Promise<{ ok: boolean; error?: string; message?: string; listing?: TourPackage }>
  ) => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? 'Could not save.');
        return;
      }
      if (res.listing) {
        const updated = res.listing;
        onListingsChange((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      }
      setNote(res.message ?? 'Saved.');
      await load();
      onSaved?.();
    } catch (e) {
      setError(userFacingError(e, USER_ERROR.listingSave));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="puc-inline__muted">Loading…</p>;
  }

  const tourStatus =
    event?.departureStatus === 'sold_out'
      ? 'Full'
      : event?.departureStatus === 'cutoff'
        ? 'Past cutoff'
        : dayClosed
          ? 'Blocked'
          : event?.departureStatus === 'limited'
            ? 'Limited'
            : 'Open';

  return (
    <div className="puc-inline">
      {error ? <NoticeCallout title={error} tone="danger" /> : null}
      {note ? <NoticeCallout title={note} tone="success" /> : null}

      {event?.bookingId || (event && eventOpensInlineBooking(event)) ? (
        <button
          type="button"
          className="puc-inline__booking"
          disabled={!event.bookingId}
          onClick={() => {
            if (event.bookingId) openSupplierBooking(event.bookingId, { family: event.category });
          }}
        >
          {event.bookingId
            ? `Open booking${event.guestName ? ` · ${event.guestName}` : ''}${
                event.reference ? ` · ${event.reference}` : ''
              }`
            : `${partnerUnifiedEventKindLabel(event.kind)}${
                event.guestName ? ` · ${event.guestName}` : ''
              }`}
        </button>
      ) : null}

      {family === 'tour' && focusedDep ? (
        <div className="puc-inline__stack">
          <div className="puc-inline__row puc-inline__row--status">
            <span
              className={`puc-inline__pill${
                dayClosed
                  ? ' is-blocked'
                  : event?.departureStatus === 'sold_out'
                    ? ' is-full'
                    : event?.departureStatus === 'cutoff'
                      ? ' is-cutoff'
                      : ''
              }`}
            >
              {tourStatus}
            </span>
            <label className="puc-inline__switch">
              <input
                type="checkbox"
                checked={dayClosed}
                disabled={!canEdit || saving}
                onChange={() =>
                  void run(() =>
                    partnerUnifiedSetTourDayClosed({
                      listingId: listing.id,
                      iso,
                      closed: !dayClosed,
                    })
                  )
                }
              />
              <span className="puc-inline__switch-ui" aria-hidden />
              <span className="puc-inline__switch-copy">
                <strong>Block entire day</strong>
                <small>All departures on this date</small>
              </span>
            </label>
          </div>

          <div className="puc-inline__row puc-inline__row--fields">
            <label className="puc-inline__field">
              Capacity
              <input
                type="number"
                className="tv-input"
                min={Math.max(1, focusedDep.occupying)}
                max={99}
                disabled={!canEdit || saving || dayClosed}
                value={spots}
                onChange={(e) => setSpots(e.target.value)}
              />
            </label>
            <div className="puc-inline__field puc-inline__field--cutoff">
              <AvailabilityCutoffField
                id={`inline-cutoff-${listing.id}-${iso}-${focusedDep.key}`}
                value={cutoffHours}
                disabled={!canEdit || saving || dayClosed}
                onChange={setCutoffHours}
              />
            </div>
            {canEdit ? (
              <button
                type="button"
                className="tv-btn-primary puc-inline__btn"
                disabled={saving || dayClosed}
                onClick={() =>
                  void run(() =>
                    partnerUnifiedSaveTourDepartureWithListing({
                      listing,
                      iso,
                      startTimeHm: focusedDep.startTimeHm,
                      capacity: Number(spots),
                      cutoffHours: Number(cutoffHours),
                      occupying: focusedDep.occupying,
                      scheduleCapacity: focusedDep.scheduleCapacity,
                      baselineCutoffHours: focusedDep.baselineCutoffHours,
                    })
                  )
                }
              >
                Save
              </button>
            ) : null}
          </div>
          {dayClosed ? (
            <p className="puc-inline__muted">Capacity and cutoff locked while blocked.</p>
          ) : null}
        </div>
      ) : null}

      {family === 'tour' && !focusedDep ? (
        <p className="puc-inline__muted">No scheduled departures on this date.</p>
      ) : null}

      {family === 'stay' && staySummary ? (
        <div className="puc-inline__stack">
          <div className="puc-inline__row puc-inline__row--status">
            <span
              className={`puc-inline__pill${
                staySummary.blocked ? ' is-blocked' : staySummary.occupying.length ? ' is-booked' : ''
              }`}
            >
              {stayCalendarNightKindLabel(staySummary.kind)}
            </span>
            <label className="puc-inline__switch">
              <input
                type="checkbox"
                checked={staySummary.blocked}
                disabled={
                  !canEdit ||
                  saving ||
                  (!staySummary.blocked && !staySummary.canBlock) ||
                  (staySummary.blocked && !staySummary.canUnblock)
                }
                onChange={() => {
                  if (staySummary.blocked) {
                    void run(() =>
                      partnerUnifiedUnblockStayNight({
                        listingId: listing.id,
                        iso,
                        bookings: listingBookings,
                        caps: caps.map((c) => ({
                          listing_id: c.listing_id,
                          available_date: c.available_date,
                          capacity: c.capacity,
                        })),
                      })
                    );
                  } else {
                    void run(() =>
                      partnerUnifiedBlockStayNight({
                        listingId: listing.id,
                        iso,
                        bookings: listingBookings,
                      })
                    );
                  }
                }}
              />
              <span className="puc-inline__switch-ui" aria-hidden />
              <span className="puc-inline__switch-copy">
                <strong>Block night</strong>
                <small>Stops new check-ins</small>
              </span>
            </label>
          </div>
          {!staySummary.canBlock && staySummary.occupying.length > 0 ? (
            <p className="puc-inline__muted">Occupied nights cannot be blocked.</p>
          ) : null}
        </div>
      ) : null}

      {family === 'rental' && focusedVariant ? (
        <div className="puc-inline__stack">
          <div className="puc-inline__row puc-inline__row--status">
            <span className={`puc-inline__pill${focusedVariant.blocked ? ' is-blocked' : ''}`}>
              {focusedVariant.blocked ? 'Blocked' : 'Open'}
            </span>
            <span className="puc-inline__meta">
              {focusedVariant.reserved} reserved · {focusedVariant.available} available
            </span>
            <label className="puc-inline__switch">
              <input
                type="checkbox"
                checked={focusedVariant.blocked}
                disabled={
                  !canEdit ||
                  saving ||
                  (focusedVariant.blocked &&
                    focusedVariant.multiDayBlock &&
                    focusedVariant.exactBlockIds.length === 0)
                }
                onChange={() => {
                  if (focusedVariant.blocked) {
                    void run(() =>
                      partnerUnifiedUnblockRentalDay({
                        exactBlockIds: focusedVariant.exactBlockIds,
                        multiDayBlock: focusedVariant.multiDayBlock,
                      })
                    );
                  } else {
                    void run(() =>
                      partnerUnifiedBlockRentalDay({
                        listingId: listing.id,
                        iso,
                        variantId: focusedVariant.variantId,
                        createdBy: userId,
                      })
                    );
                  }
                }}
              />
              <span className="puc-inline__switch-ui" aria-hidden />
              <span className="puc-inline__switch-copy">
                <strong>Block day</strong>
                <small>This option</small>
              </span>
            </label>
          </div>
          <div className="puc-inline__row puc-inline__row--fields">
            <label className="puc-inline__field">
              Stock
              <input
                type="number"
                className="tv-input"
                min={1}
                max={999}
                disabled={!canEdit || saving}
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
            </label>
            {canEdit ? (
              <button
                type="button"
                className="tv-btn-primary puc-inline__btn"
                disabled={saving}
                onClick={() =>
                  void run(() =>
                    partnerUnifiedAdjustRentalStock({
                      listing,
                      variantId: focusedVariant.variantId,
                      nextStock: Number(stock),
                      holds,
                    })
                  )
                }
              >
                Save
              </button>
            ) : null}
          </div>
          {focusedVariant.multiDayBlock && focusedVariant.exactBlockIds.length === 0 ? (
            <p className="puc-inline__muted">
              Covered by a multi-day block — use bulk edit or the rental calendar to unblock.
            </p>
          ) : null}
        </div>
      ) : null}

      {family === 'rental' && !focusedVariant ? (
        <p className="puc-inline__muted">No rental options configured.</p>
      ) : null}
    </div>
  );
}

function eventOpensInlineBooking(event: PartnerUnifiedCalendarEvent): boolean {
  return Boolean(
    event.bookingId &&
      (event.source === 'booking' || event.source == null) &&
      event.kind !== 'tour_departure' &&
      event.kind !== 'stay_blocked' &&
      event.kind !== 'rental_block'
  );
}
