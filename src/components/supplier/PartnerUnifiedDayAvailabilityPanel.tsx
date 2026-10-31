/**
 * Mission 05.3 — Compact single-date availability editor for the Unified Partner Calendar.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import PartnerSelect from './PartnerSelect';
import NoticeCallout from '../NoticeCallout';
import {
  PARTNER_UNIFIED_UNSUPPORTED_ACTIONS,
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
  type PartnerUnifiedTourDepartureEdit,
} from '../../lib/partner-unified-day-edits';
import { stayCalendarNightKindLabel } from '../../lib/stay-calendar-workspace';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { openSupplierBooking } from '../../lib/supplierPortalNavigation';
import type { PartnerUnifiedCalendarEvent } from '../../lib/partner-unified-calendar';

type Props = {
  iso: string;
  listings: TourPackage[];
  bookings: BookingRow[];
  dayEvents: PartnerUnifiedCalendarEvent[];
  initialListingId?: string;
  canEdit: boolean;
  userId?: string | null;
  onListingsChange: (next: TourPackage[]) => void;
};

export default function PartnerUnifiedDayAvailabilityPanel({
  iso,
  listings,
  bookings,
  dayEvents,
  initialListingId = '',
  canEdit,
  userId,
  onListingsChange,
}: Props) {
  const [listingId, setListingId] = useState(() => {
    if (initialListingId && listings.some((l) => l.id === initialListingId)) return initialListingId;
    if (dayEvents[0]?.listingId) return dayEvents[0].listingId;
    return listings[0]?.id ?? '';
  });
  const [caps, setCaps] = useState<AvailabilityRow[]>([]);
  const [blocks, setBlocks] = useState<RentalAvailabilityBlockRow[]>([]);
  const [holds, setHolds] = useState<RentalInventoryHoldRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [depDrafts, setDepDrafts] = useState<
    Record<string, { spots: string; cutoffHours: string }>
  >({});
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});
  const [rentalVariantFilter, setRentalVariantFilter] = useState('all');

  const listing = useMemo(
    () => listings.find((l) => l.id === listingId) ?? null,
    [listings, listingId]
  );
  const family = listing ? partnerUnifiedListingFamily(listing) : null;

  useEffect(() => {
    if (initialListingId && listings.some((l) => l.id === initialListingId)) {
      setListingId(initialListingId);
    }
  }, [initialListingId, listings]);

  const loadDayData = useCallback(async () => {
    if (!listingId || !listing) {
      setCaps([]);
      setBlocks([]);
      setHolds([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fam = partnerUnifiedListingFamily(listing);
      if (fam === 'rental') {
        const bounds = partnerUnifiedDayBoundsUtc(iso);
        const [b, h] = await Promise.all([
          fetchRentalAvailabilityBlocks(listingId, bounds.startIso, bounds.endIso),
          fetchRentalInventoryHolds(listingId, bounds.startIso, bounds.endIso),
        ]);
        setBlocks(b);
        setHolds(h);
        setCaps([]);
      } else {
        const rows = await fetchAvailabilityByListingId(listingId, {
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
  }, [listingId, listing, iso]);

  useEffect(() => {
    void loadDayData();
  }, [loadDayData]);

  const tourDeps = useMemo(() => {
    if (!listing || family !== 'tour') return [] as PartnerUnifiedTourDepartureEdit[];
    return partnerUnifiedTourDeparturesForDay({ listing, iso, bookings });
  }, [listing, family, iso, bookings]);

  useEffect(() => {
    const next: Record<string, { spots: string; cutoffHours: string }> = {};
    for (const d of tourDeps) {
      next[d.key] = { spots: String(d.capacity), cutoffHours: String(d.cutoffHours) };
    }
    setDepDrafts(next);
  }, [tourDeps]);

  const dayClosed = useMemo(
    () => (family === 'tour' ? partnerUnifiedTourDayIsClosed(caps, iso) : false),
    [family, caps, iso]
  );

  const staySummary = useMemo(() => {
    if (!listing || family !== 'stay') return null;
    return partnerUnifiedStayNightSummary({
      listingId: listing.id,
      iso,
      bookings,
      caps: caps.map((c) => ({
        listing_id: c.listing_id,
        available_date: c.available_date,
        capacity: c.capacity,
      })),
    });
  }, [listing, family, iso, bookings, caps]);

  const rentalVariants = useMemo(() => {
    if (!listing || family !== 'rental') return [];
    return partnerUnifiedRentalDayVariants({ listing, iso, blocks, holds });
  }, [listing, family, iso, blocks, holds]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const v of rentalVariants) next[v.variantId] = String(v.stock);
    setStockDrafts(next);
  }, [rentalVariants]);

  const listingEvents = dayEvents.filter((e) => !listingId || e.listingId === listingId);

  const patchListing = (updated: TourPackage) => {
    onListingsChange(listings.map((l) => (l.id === updated.id ? updated : l)));
  };

  const run = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string; listing?: TourPackage }>) => {
    if (!canEdit) return;
    setSaving(true);
    setNote(null);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? 'Could not save.');
        return;
      }
      if (res.listing) patchListing(res.listing);
      setNote(res.message ?? 'Saved.');
      await loadDayData();
    } catch (e) {
      setError(userFacingError(e, USER_ERROR.listingSave));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="partner-unified-day" aria-label="Day availability">
      <header className="partner-unified-day__head">
        <div>
          <p className="partner-unified-day__eyebrow">Availability</p>
          <h3 className="partner-unified-day__title">
            {new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </h3>
        </div>
        <div className="partner-unified-day__listing">
          <label htmlFor="unified-day-listing">Listing</label>
          <PartnerSelect
            id="unified-day-listing"
            aria-label="Listing for availability"
            value={listingId}
            onChange={setListingId}
            options={listings.map((l) => ({
              value: l.id,
              label: l.title || 'Untitled',
            }))}
          />
        </div>
      </header>

      {note ? <NoticeCallout title={note} tone="success" /> : null}
      {error ? <NoticeCallout title={error} tone="danger" /> : null}

      {loading ? (
        <p className="partner-unified-day__muted">Loading availability…</p>
      ) : !listing ? (
        <p className="partner-unified-day__muted">Select a listing to manage availability.</p>
      ) : (
        <>
          {listingEvents.length > 0 ? (
            <div className="partner-unified-day__bookings">
              <p className="partner-unified-day__section-label">Bookings this day</p>
              <ul>
                {listingEvents.map((e) => (
                  <li key={e.key}>
                    <button
                      type="button"
                      className="partner-unified-day__booking-link"
                      onClick={() => openSupplierBooking(e.bookingId, { family: e.category })}
                    >
                      <span>
                        {e.timeHm ? `${e.timeHm} · ` : ''}
                        {e.guestName || 'Guest'} · {e.listingTitle}
                      </span>
                      <span>{e.quantityLabel}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="partner-unified-day__muted">No bookings on this listing for this day.</p>
          )}

          {family === 'tour' ? (
            <div className="partner-unified-day__family">
              <div className="partner-unified-day__row-actions">
                <div>
                  <p className="partner-unified-day__section-label">Day status</p>
                  <p className="partner-unified-day__status">
                    {dayClosed ? 'Closed for new bookings' : 'Open'}
                  </p>
                  <p className="partner-unified-day__hint">
                    {PARTNER_UNIFIED_UNSUPPORTED_ACTIONS.tourPerDepartureClose}
                  </p>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    className="tv-btn-secondary inline-flex min-h-9 items-center px-3 text-sm font-semibold"
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
              </div>

              {tourDeps.length === 0 ? (
                <p className="partner-unified-day__muted">No scheduled departures on this date.</p>
              ) : (
                <div className="partner-unified-day__deps">
                  <p className="partner-unified-day__section-label">Departures</p>
                  {tourDeps.map((d) => {
                    const draft = depDrafts[d.key] ?? {
                      spots: String(d.capacity),
                      cutoffHours: String(d.cutoffHours),
                    };
                    return (
                      <div key={d.key} className="partner-unified-day__dep">
                        <div className="partner-unified-day__dep-head">
                          <strong>
                            {d.startTimeHm} · {d.optionName}
                          </strong>
                          <span>
                            {d.occupying}/{d.capacity} booked · {d.remaining} left
                          </span>
                        </div>
                        <div className="partner-unified-day__dep-fields">
                          <label>
                            Capacity
                            <input
                              type="number"
                              className="tv-input"
                              min={Math.max(1, d.occupying)}
                              max={99}
                              disabled={!canEdit || saving || dayClosed}
                              value={draft.spots}
                              onChange={(e) =>
                                setDepDrafts((prev) => ({
                                  ...prev,
                                  [d.key]: { ...draft, spots: e.target.value },
                                }))
                              }
                            />
                          </label>
                          <AvailabilityCutoffField
                            id={`unified-dep-cutoff-${d.key}`}
                            value={draft.cutoffHours}
                            disabled={!canEdit || saving || dayClosed}
                            onChange={(hours) =>
                              setDepDrafts((prev) => ({
                                ...prev,
                                [d.key]: { ...draft, cutoffHours: hours },
                              }))
                            }
                          />
                          {canEdit ? (
                            <button
                              type="button"
                              className="tv-btn-primary inline-flex min-h-9 items-center px-3 text-sm font-semibold"
                              disabled={saving || dayClosed}
                              onClick={() =>
                                void run(() =>
                                  partnerUnifiedSaveTourDepartureWithListing({
                                    listing,
                                    iso,
                                    startTimeHm: d.startTimeHm,
                                    capacity: Number(draft.spots),
                                    cutoffHours: Number(draft.cutoffHours),
                                    occupying: d.occupying,
                                    scheduleCapacity: d.scheduleCapacity,
                                    baselineCutoffHours: d.baselineCutoffHours,
                                  })
                                )
                              }
                            >
                              Save
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {family === 'stay' && staySummary ? (
            <div className="partner-unified-day__family">
              <p className="partner-unified-day__section-label">Night inventory</p>
              <p className="partner-unified-day__status">
                {stayCalendarNightKindLabel(staySummary.kind)}
                {staySummary.occupying.length
                  ? ` · ${staySummary.occupying.length} reservation${
                      staySummary.occupying.length === 1 ? '' : 's'
                    }`
                  : ''}
              </p>
              <div className="partner-unified-day__row-actions">
                {canEdit && staySummary.canBlock && !staySummary.blocked ? (
                  <button
                    type="button"
                    className="tv-btn-secondary inline-flex min-h-9 items-center px-3 text-sm font-semibold"
                    disabled={saving}
                    onClick={() =>
                      void run(() =>
                        partnerUnifiedBlockStayNight({
                          listingId: listing.id,
                          iso,
                          bookings,
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
                    className="tv-btn-secondary inline-flex min-h-9 items-center px-3 text-sm font-semibold"
                    disabled={saving}
                    onClick={() =>
                      void run(() =>
                        partnerUnifiedUnblockStayNight({
                          listingId: listing.id,
                          iso,
                          bookings,
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
                  <p className="partner-unified-day__hint">
                    Occupied nights cannot be blocked — confirmed reservations stay intact.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {family === 'rental' ? (
            <div className="partner-unified-day__family">
              <div className="partner-unified-day__rental-filter">
                <label htmlFor="unified-day-variant">Option</label>
                <PartnerSelect
                  id="unified-day-variant"
                  aria-label="Rental option"
                  value={rentalVariantFilter}
                  onChange={setRentalVariantFilter}
                  options={[
                    { value: 'all', label: 'All options' },
                    ...rentalVariants.map((v) => ({ value: v.variantId, label: v.name })),
                  ]}
                />
              </div>
              {(rentalVariantFilter === 'all'
                ? rentalVariants
                : rentalVariants.filter((v) => v.variantId === rentalVariantFilter)
              ).map((v) => (
                <div key={v.variantId} className="partner-unified-day__dep">
                  <div className="partner-unified-day__dep-head">
                    <strong>{v.name}</strong>
                    <span>
                      Total {v.stock} · Reserved {v.reserved} · Available {v.available}
                      {v.blocked ? ' · Blocked' : ''}
                    </span>
                  </div>
                  {v.multiDayBlock ? (
                    <p className="partner-unified-day__hint">
                      {PARTNER_UNIFIED_UNSUPPORTED_ACTIONS.rentalMultiDayUnblockSplit}
                    </p>
                  ) : null}
                  <div className="partner-unified-day__dep-fields">
                    <label>
                      Stock
                      <input
                        type="number"
                        className="tv-input"
                        min={1}
                        max={999}
                        disabled={!canEdit || saving}
                        value={stockDrafts[v.variantId] ?? String(v.stock)}
                        onChange={(e) =>
                          setStockDrafts((prev) => ({
                            ...prev,
                            [v.variantId]: e.target.value,
                          }))
                        }
                      />
                    </label>
                    {canEdit ? (
                      <>
                        <button
                          type="button"
                          className="tv-btn-primary inline-flex min-h-9 items-center px-3 text-sm font-semibold"
                          disabled={saving}
                          onClick={() =>
                            void run(() =>
                              partnerUnifiedAdjustRentalStock({
                                listing,
                                variantId: v.variantId,
                                nextStock: Number(stockDrafts[v.variantId]),
                                holds,
                              })
                            )
                          }
                        >
                          Save stock
                        </button>
                        {!v.blocked ? (
                          <button
                            type="button"
                            className="tv-btn-secondary inline-flex min-h-9 items-center px-3 text-sm font-semibold"
                            disabled={saving}
                            onClick={() =>
                              void run(() =>
                                partnerUnifiedBlockRentalDay({
                                  listingId: listing.id,
                                  iso,
                                  variantId: v.variantId,
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
                            className="tv-btn-secondary inline-flex min-h-9 items-center px-3 text-sm font-semibold"
                            disabled={saving || (v.multiDayBlock && v.exactBlockIds.length === 0)}
                            onClick={() =>
                              void run(() =>
                                partnerUnifiedUnblockRentalDay({
                                  exactBlockIds: v.exactBlockIds,
                                  multiDayBlock: v.multiDayBlock,
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
                </div>
              ))}
              {canEdit && rentalVariantFilter === 'all' && rentalVariants.some((v) => !v.blocked) ? (
                <button
                  type="button"
                  className="tv-btn-secondary inline-flex min-h-9 items-center px-3 text-sm font-semibold"
                  disabled={saving}
                  onClick={() =>
                    void run(() =>
                      partnerUnifiedBlockRentalDay({
                        listingId: listing.id,
                        iso,
                        variantId: null,
                        createdBy: userId,
                      })
                    )
                  }
                >
                  Block all options this day
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
