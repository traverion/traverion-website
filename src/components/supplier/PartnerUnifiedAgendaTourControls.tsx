/**
 * Agenda-only inline tour departure controls: block, capacity, cutoff clock.
 * Optimistic local patches — never triggers a full calendar reload.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import type { TourPackage } from '../../types/tour';
import type { BookingRow } from '../../data/supabase-bookings';
import PartnerSelect from './PartnerSelect';
import {
  partnerUnifiedSaveTourDepartureWithListing,
  partnerUnifiedSetTourDayClosed,
  partnerUnifiedTourDeparturesForDay,
} from '../../lib/partner-unified-day-edits';
import { normalizeStartTimeHm } from '../../lib/listing-slot-overrides';
import { normalizeBookingCutoffHours, MAX_BOOKING_CUTOFF_HOURS } from '../../lib/tour-departure-cutoff';
import {
  bookingCutoffSelectLabel,
  cutoffHourSelectOptions,
} from '../../pages/supplier/calendarAvailabilityUi';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import type { PartnerUnifiedCalendarEvent } from '../../lib/partner-unified-calendar';

export type PartnerUnifiedAgendaTourPatch =
  | { type: 'dayClosed'; listingId: string; iso: string; closed: boolean }
  | { type: 'listing'; listing: TourPackage };

type Props = {
  event: PartnerUnifiedCalendarEvent;
  listing: TourPackage;
  bookings: BookingRow[];
  canEdit: boolean;
  /** True when availability capacity for this listing/day is 0 (day blocked). */
  dayClosed: boolean;
  /** Targeted parent cache update — must not refetch the full calendar. */
  onPatch: (patch: PartnerUnifiedAgendaTourPatch) => void;
};

const CUTOFF_OPTIONS = cutoffHourSelectOptions(MAX_BOOKING_CUTOFF_HOURS);

/** Serialize capacity/cutoff writes per listing so slotOverrides cannot clobber each other. */
const listingSaveChains = new Map<string, Promise<unknown>>();

function enqueueListingSave<T>(listingId: string, task: () => Promise<T>): Promise<T> {
  const prior = listingSaveChains.get(listingId) ?? Promise.resolve();
  const next = prior.catch(() => undefined).then(task);
  listingSaveChains.set(
    listingId,
    next.then(
      () => undefined,
      () => undefined
    )
  );
  return next;
}

function subtractHoursFromHm(startTimeHm: string, hours: number): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((startTimeHm || '').trim());
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]) - Math.max(0, Math.floor(hours)) * 60;
  if (total < 0 || total >= 24 * 60) return null;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function cutoffClockLabel(startTimeHm: string | null | undefined, cutoffHours: number): string {
  const hours = Math.max(0, Math.floor(cutoffHours));
  if (hours <= 0) return 'Until dep.';
  const start = (startTimeHm ?? '').trim();
  const closedAt = start ? subtractHoursFromHm(start, hours) : null;
  return closedAt ?? `${hours}h before`;
}

function PartnerUnifiedAgendaTourControls({
  event,
  listing,
  bookings,
  canEdit,
  dayClosed,
  onPatch,
}: Props) {
  const [saving, setSaving] = useState<'block' | 'capacity' | 'cutoff' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<'capacity' | 'cutoff' | null>(null);
  const [spotsDraft, setSpotsDraft] = useState('');
  const [cutoffDraft, setCutoffDraft] = useState('0');
  /** Local overrides until parent props catch up — keeps the card instant. */
  const [localClosed, setLocalClosed] = useState<boolean | null>(null);
  const [localCapacity, setLocalCapacity] = useState<number | null>(null);
  const [localCutoffHours, setLocalCutoffHours] = useState<number | null>(null);
  const inFlightRef = useRef(false);
  const listingRef = useRef(listing);
  listingRef.current = listing;

  const listingBookings = useMemo(
    () => bookings.filter((b) => b.listing_id === listing.id),
    [bookings, listing.id]
  );

  const focusedDep = useMemo(() => {
    const deps = partnerUnifiedTourDeparturesForDay({
      listing,
      iso: event.ymd,
      bookings: listingBookings,
    });
    if (deps.length === 0) return null;
    const hm = normalizeStartTimeHm(event.timeHm) || (event.timeHm ?? '').slice(0, 5);
    if (hm) {
      const match = deps.find((d) => d.startTimeHm === hm);
      if (match) return match;
    }
    if (event.optionLabel) {
      const match = deps.find((d) => d.optionName === event.optionLabel);
      if (match) return match;
    }
    return deps[0] ?? null;
  }, [listing, event.ymd, event.timeHm, event.optionLabel, listingBookings]);

  const booked = focusedDep?.occupying ?? event.bookedCount ?? 0;
  const capacity = localCapacity ?? focusedDep?.capacity ?? event.capacityCount ?? 0;
  const cutoffHours = localCutoffHours ?? focusedDep?.cutoffHours ?? event.cutoffHours ?? 0;
  const closed = localClosed ?? dayClosed;
  const clock = cutoffClockLabel(event.timeHm ?? focusedDep?.startTimeHm, cutoffHours);

  // Clear local overrides once parent state matches.
  useEffect(() => {
    if (localClosed != null && localClosed === dayClosed) setLocalClosed(null);
  }, [dayClosed, localClosed]);

  useEffect(() => {
    const next = focusedDep?.capacity ?? event.capacityCount ?? null;
    if (localCapacity != null && next != null && localCapacity === next) setLocalCapacity(null);
  }, [focusedDep?.capacity, event.capacityCount, localCapacity]);

  useEffect(() => {
    const next = focusedDep?.cutoffHours ?? event.cutoffHours ?? null;
    if (localCutoffHours != null && next != null && localCutoffHours === next) {
      setLocalCutoffHours(null);
    }
  }, [focusedDep?.cutoffHours, event.cutoffHours, localCutoffHours]);

  useEffect(() => {
    if (editing === 'capacity') setSpotsDraft(String(capacity));
    if (editing === 'cutoff') setCutoffDraft(String(cutoffHours));
  }, [editing, capacity, cutoffHours]);

  const busy = saving != null || inFlightRef.current;
  const fieldsLocked = closed || busy || !canEdit;

  const toggleBlock = async () => {
    if (!canEdit || inFlightRef.current) return;
    const nextClosed = !closed;
    const previous = closed;
    inFlightRef.current = true;
    setSaving('block');
    setError(null);
    setLocalClosed(nextClosed);
    onPatch({ type: 'dayClosed', listingId: listing.id, iso: event.ymd, closed: nextClosed });
    try {
      const res = await partnerUnifiedSetTourDayClosed({
        listingId: listing.id,
        iso: event.ymd,
        closed: nextClosed,
      });
      if (!res.ok) {
        setLocalClosed(previous);
        onPatch({ type: 'dayClosed', listingId: listing.id, iso: event.ymd, closed: previous });
        setError(res.error ?? 'Could not save.');
      }
    } catch (e) {
      setLocalClosed(previous);
      onPatch({ type: 'dayClosed', listingId: listing.id, iso: event.ymd, closed: previous });
      setError(userFacingError(e, USER_ERROR.listingSave));
    } finally {
      inFlightRef.current = false;
      setSaving(null);
    }
  };

  const saveCapacity = async () => {
    if (!canEdit || !focusedDep || inFlightRef.current) return;
    const nextSpots = Math.floor(Number(spotsDraft) || 0);
    if (nextSpots < booked) {
      setError(
        `Cannot set capacity below ${booked} confirmed guest${booked === 1 ? '' : 's'}.`
      );
      return;
    }
    const previous = capacity;
    const dep = focusedDep;
    inFlightRef.current = true;
    setSaving('capacity');
    setError(null);
    setLocalCapacity(nextSpots);
    try {
      await enqueueListingSave(listing.id, async () => {
        const res = await partnerUnifiedSaveTourDepartureWithListing({
          listing: listingRef.current,
          iso: event.ymd,
          startTimeHm: dep.startTimeHm,
          capacity: nextSpots,
          cutoffHours: localCutoffHours ?? dep.cutoffHours,
          occupying: dep.occupying,
          scheduleCapacity: dep.scheduleCapacity,
          baselineCutoffHours: dep.baselineCutoffHours,
        });
        if (!res.ok) {
          setLocalCapacity(previous);
          setError(res.error ?? 'Could not save.');
          return;
        }
        if (res.listing) onPatch({ type: 'listing', listing: res.listing });
        setEditing(null);
      });
    } catch (e) {
      setLocalCapacity(previous);
      setError(userFacingError(e, USER_ERROR.listingSave));
    } finally {
      inFlightRef.current = false;
      setSaving(null);
    }
  };

  const saveCutoff = async () => {
    if (!canEdit || !focusedDep || inFlightRef.current) return;
    const nextCutoff = normalizeBookingCutoffHours(Number(cutoffDraft) || 0);
    const previous = cutoffHours;
    const dep = focusedDep;
    inFlightRef.current = true;
    setSaving('cutoff');
    setError(null);
    setLocalCutoffHours(nextCutoff);
    try {
      await enqueueListingSave(listing.id, async () => {
        const res = await partnerUnifiedSaveTourDepartureWithListing({
          listing: listingRef.current,
          iso: event.ymd,
          startTimeHm: dep.startTimeHm,
          capacity: localCapacity ?? dep.capacity,
          cutoffHours: nextCutoff,
          occupying: dep.occupying,
          scheduleCapacity: dep.scheduleCapacity,
          baselineCutoffHours: dep.baselineCutoffHours,
        });
        if (!res.ok) {
          setLocalCutoffHours(previous);
          setError(res.error ?? 'Could not save.');
          return;
        }
        if (res.listing) onPatch({ type: 'listing', listing: res.listing });
        setEditing(null);
      });
    } catch (e) {
      setLocalCutoffHours(previous);
      setError(userFacingError(e, USER_ERROR.listingSave));
    } finally {
      inFlightRef.current = false;
      setSaving(null);
    }
  };

  return (
    <div className="puc-tour-ops" onClick={(e) => e.stopPropagation()}>
      <div className="puc-tour-ops__seg puc-tour-ops__seg--block">
        <label className={`puc-tour-ops__switch${closed ? ' is-on' : ''}`}>
          <span className="puc-tour-ops__seg-label">Block</span>
          <input
            type="checkbox"
            role="switch"
            aria-label={closed ? 'Unblock departure day' : 'Block departure day'}
            checked={closed}
            disabled={!canEdit || busy}
            onChange={() => void toggleBlock()}
          />
          <span className="puc-tour-ops__switch-ui" aria-hidden>
            {saving === 'block' ? <Loader2 className="puc-tour-ops__spin" aria-hidden /> : null}
          </span>
        </label>
        {closed ? <span className="puc-tour-ops__blocked">Blocked</span> : null}
      </div>

      <div className="puc-tour-ops__seg puc-tour-ops__seg--capacity">
        <span className="puc-tour-ops__seg-label">Capacity</span>
        {editing === 'capacity' && focusedDep ? (
          <div className="puc-tour-ops__edit">
            <input
              type="number"
              className="tv-input puc-tour-ops__input"
              min={Math.max(1, booked)}
              max={99}
              disabled={fieldsLocked}
              value={spotsDraft}
              aria-label="Departure capacity"
              onChange={(e) => setSpotsDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(null);
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void saveCapacity();
                }
              }}
            />
            <button
              type="button"
              className="puc-tour-ops__icon-btn"
              disabled={fieldsLocked}
              aria-label="Save capacity"
              onClick={() => void saveCapacity()}
            >
              {saving === 'capacity' ? (
                <Loader2 className="puc-tour-ops__spin" aria-hidden />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
            <button
              type="button"
              className="puc-tour-ops__icon-btn"
              disabled={busy}
              aria-label="Cancel capacity edit"
              onClick={() => setEditing(null)}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="puc-tour-ops__value-row">
            <span className="puc-tour-ops__value" title={`${booked} booked of ${capacity}`}>
              {booked} / {capacity} booked
            </span>
            {canEdit && focusedDep ? (
              <button
                type="button"
                className="puc-tour-ops__icon-btn"
                disabled={fieldsLocked}
                aria-label="Edit capacity"
                onClick={() => setEditing('capacity')}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="puc-tour-ops__seg puc-tour-ops__seg--cutoff">
        <span className="puc-tour-ops__seg-label">Cutoff</span>
        {editing === 'cutoff' && focusedDep ? (
          <div className="puc-tour-ops__edit puc-tour-ops__edit--cutoff">
            <PartnerSelect
              id={`agenda-cutoff-${listing.id}-${event.ymd}-${focusedDep.startTimeHm}`}
              aria-label="Booking cutoff hours"
              value={String(normalizeBookingCutoffHours(Number(cutoffDraft) || 0))}
              disabled={fieldsLocked}
              searchable
              options={CUTOFF_OPTIONS}
              onChange={(next) => setCutoffDraft(String(normalizeBookingCutoffHours(Number(next))))}
            />
            <button
              type="button"
              className="puc-tour-ops__icon-btn"
              disabled={fieldsLocked}
              aria-label="Save cutoff"
              onClick={() => void saveCutoff()}
            >
              {saving === 'cutoff' ? (
                <Loader2 className="puc-tour-ops__spin" aria-hidden />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
            <button
              type="button"
              className="puc-tour-ops__icon-btn"
              disabled={busy}
              aria-label="Cancel cutoff edit"
              onClick={() => setEditing(null)}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span className="puc-tour-ops__hint">
              {bookingCutoffSelectLabel(Number(cutoffDraft) || 0)}
              {Number(cutoffDraft) > 0 && focusedDep.startTimeHm
                ? ` · ${cutoffClockLabel(focusedDep.startTimeHm, Number(cutoffDraft) || 0)}`
                : ''}
            </span>
          </div>
        ) : (
          <div className="puc-tour-ops__value-row">
            <span
              className="puc-tour-ops__value puc-tour-ops__value--clock"
              title={
                cutoffHours > 0
                  ? bookingCutoffSelectLabel(cutoffHours)
                  : 'Guests can book until departure'
              }
            >
              {clock}
            </span>
            {canEdit && focusedDep ? (
              <button
                type="button"
                className="puc-tour-ops__icon-btn"
                disabled={fieldsLocked}
                aria-label="Edit cutoff"
                onClick={() => setEditing('cutoff')}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        )}
      </div>

      {error ? (
        <p className="puc-tour-ops__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default memo(PartnerUnifiedAgendaTourControls);
