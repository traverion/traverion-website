/**
 * Mission 05.6.2 — Contextual inline availability controls for a single listing/day/event.
 * Reuses Mission 05.3 day-edit APIs; no side panel.
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

  return (
    <div className="puc-inline">
      {error ? <NoticeCallout title={error} tone="danger" /> : null}
      {note ? <NoticeCallout title={note} tone="success" /> : null}

      {event?.bookingId ? (
        <button
          type="button"
          className="puc-inline__booking"
          onClick={() => openSupplierBooking(event.bookingId!, { family: event.category })}
        >
          Open booking
          {event.guestName ? ` · ${event.guestName}` : ''}
          {event.reference ? ` · ${event.reference}` : ''}
        </button>
      ) : event && event.source === 'booking' ? (
        <p className="puc-inline__muted">
          {partnerUnifiedEventKindLabel(event.kind)}
          {event.guestName ? ` · ${event.guestName}` : ''}
        </p>
      ) : null}

      {family === 'tour' && focusedDep ? (
        <div className="puc-inline__grid">
          <div className="puc-inline__status">
            <span>{dayClosed ? 'Closed' : 'Open'}</span>
            <span>
              {focusedDep.occupying}/{focusedDep.capacity} · {focusedDep.remaining} left
            </span>
          </div>
          {canEdit ? (
            <button
              type="button"
              className="tv-btn-secondary puc-inline__btn"
              disabled={saving}
              onClick={() =>
                void run(() =>
                  partnerUnifiedSetTourDayClosed({
                    listingId: listing.id,
                    iso,
                    closed: !dayClosed,
                  })
                )
              }
            >
              {dayClosed ? 'Reopen day' : 'Close day'}
            </button>
          ) : null}
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
          <AvailabilityCutoffField
            id={`inline-cutoff-${listing.id}-${iso}-${focusedDep.key}`}
            value={cutoffHours}
            disabled={!canEdit || saving || dayClosed}
            onChange={setCutoffHours}
          />
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
      ) : null}

      {family === 'tour' && !focusedDep ? (
        <p className="puc-inline__muted">No scheduled departures on this date.</p>
      ) : null}

      {family === 'stay' && staySummary ? (
        <div className="puc-inline__grid">
          <div className="puc-inline__status">
            <span>{stayCalendarNightKindLabel(staySummary.kind)}</span>
            {staySummary.occupying.length > 0 ? (
              <span>
                {staySummary.occupying.length} reservation
                {staySummary.occupying.length === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
          {canEdit && staySummary.canBlock && !staySummary.blocked ? (
            <button
              type="button"
              className="tv-btn-secondary puc-inline__btn"
              disabled={saving}
              onClick={() =>
                void run(() =>
                  partnerUnifiedBlockStayNight({
                    listingId: listing.id,
                    iso,
                    bookings: listingBookings,
                  })
                )
              }
            >
              Block night
            </button>
          ) : null}
          {canEdit && staySummary.canUnblock ? (
            <button
              type="button"
              className="tv-btn-secondary puc-inline__btn"
              disabled={saving}
              onClick={() =>
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
                )
              }
            >
              Unblock night
            </button>
          ) : null}
          {!staySummary.canBlock && staySummary.occupying.length > 0 ? (
            <p className="puc-inline__muted">Occupied — cannot block.</p>
          ) : null}
        </div>
      ) : null}

      {family === 'rental' && focusedVariant ? (
        <div className="puc-inline__grid">
          <div className="puc-inline__status">
            <span>{focusedVariant.name}</span>
            <span>
              {focusedVariant.blocked
                ? 'Blocked'
                : `${focusedVariant.available} free · ${focusedVariant.reserved} reserved`}
            </span>
          </div>
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
            <>
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
                Save stock
              </button>
              {!focusedVariant.blocked ? (
                <button
                  type="button"
                  className="tv-btn-secondary puc-inline__btn"
                  disabled={saving}
                  onClick={() =>
                    void run(() =>
                      partnerUnifiedBlockRentalDay({
                        listingId: listing.id,
                        iso,
                        variantId: focusedVariant.variantId,
                        createdBy: userId,
                      })
                    )
                  }
                >
                  Block day
                </button>
              ) : (
                <button
                  type="button"
                  className="tv-btn-secondary puc-inline__btn"
                  disabled={
                    saving ||
                    (focusedVariant.multiDayBlock && focusedVariant.exactBlockIds.length === 0)
                  }
                  onClick={() =>
                    void run(() =>
                      partnerUnifiedUnblockRentalDay({
                        exactBlockIds: focusedVariant.exactBlockIds,
                        multiDayBlock: focusedVariant.multiDayBlock,
                      })
                    )
                  }
                >
                  Unblock day
                </button>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {family === 'rental' && !focusedVariant ? (
        <p className="puc-inline__muted">No rental options configured.</p>
      ) : null}
    </div>
  );
}
