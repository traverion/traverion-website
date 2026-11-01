/**
 * Agenda-only inline tour departure controls: block, capacity, cutoff clock.
 * Reuses Mission 05.3 day-edit APIs — no drawer / expand for these three actions.
 */
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
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

type Props = {
  event: PartnerUnifiedCalendarEvent;
  listing: TourPackage;
  bookings: BookingRow[];
  canEdit: boolean;
  /** True when availability capacity for this listing/day is 0 (day blocked). */
  dayClosed: boolean;
  onListingsChange: Dispatch<SetStateAction<TourPackage[]>>;
  onSaved?: () => void;
};

const CUTOFF_OPTIONS = cutoffHourSelectOptions(MAX_BOOKING_CUTOFF_HOURS);

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

export default function PartnerUnifiedAgendaTourControls({
  event,
  listing,
  bookings,
  canEdit,
  dayClosed,
  onListingsChange,
  onSaved,
}: Props) {
  const [saving, setSaving] = useState<'block' | 'capacity' | 'cutoff' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<'capacity' | 'cutoff' | null>(null);
  const [spotsDraft, setSpotsDraft] = useState('');
  const [cutoffDraft, setCutoffDraft] = useState('0');

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
  const capacity = focusedDep?.capacity ?? event.capacityCount ?? 0;
  const cutoffHours = focusedDep?.cutoffHours ?? event.cutoffHours ?? 0;
  const clock = cutoffClockLabel(event.timeHm ?? focusedDep?.startTimeHm, cutoffHours);

  useEffect(() => {
    if (editing === 'capacity') setSpotsDraft(String(capacity));
    if (editing === 'cutoff') setCutoffDraft(String(cutoffHours));
  }, [editing, capacity, cutoffHours]);

  const run = async (
    kind: 'block' | 'capacity' | 'cutoff',
    fn: () => Promise<{ ok: boolean; error?: string; listing?: TourPackage }>
  ) => {
    if (!canEdit) return;
    setSaving(kind);
    setError(null);
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
      setEditing(null);
      onSaved?.();
    } catch (e) {
      setError(userFacingError(e, USER_ERROR.listingSave));
    } finally {
      setSaving(null);
    }
  };

  const busy = saving != null;
  const fieldsLocked = dayClosed || busy || !canEdit;

  return (
    <div className="puc-tour-ops" onClick={(e) => e.stopPropagation()}>
      <div className="puc-tour-ops__seg puc-tour-ops__seg--block">
        <label className={`puc-tour-ops__switch${dayClosed ? ' is-on' : ''}`}>
          <span className="puc-tour-ops__seg-label">Block</span>
          <input
            type="checkbox"
            role="switch"
            aria-label={dayClosed ? 'Unblock departure day' : 'Block departure day'}
            checked={dayClosed}
            disabled={!canEdit || busy}
            onChange={() =>
              void run('block', () =>
                partnerUnifiedSetTourDayClosed({
                  listingId: listing.id,
                  iso: event.ymd,
                  closed: !dayClosed,
                })
              )
            }
          />
          <span className="puc-tour-ops__switch-ui" aria-hidden>
            {saving === 'block' ? <Loader2 className="puc-tour-ops__spin" aria-hidden /> : null}
          </span>
        </label>
        {dayClosed ? <span className="puc-tour-ops__blocked">Blocked</span> : null}
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
                  void run('capacity', () =>
                    partnerUnifiedSaveTourDepartureWithListing({
                      listing,
                      iso: event.ymd,
                      startTimeHm: focusedDep.startTimeHm,
                      capacity: Number(spotsDraft),
                      cutoffHours: focusedDep.cutoffHours,
                      occupying: focusedDep.occupying,
                      scheduleCapacity: focusedDep.scheduleCapacity,
                      baselineCutoffHours: focusedDep.baselineCutoffHours,
                    })
                  );
                }
              }}
            />
            <button
              type="button"
              className="puc-tour-ops__icon-btn"
              disabled={fieldsLocked}
              aria-label="Save capacity"
              onClick={() =>
                void run('capacity', () =>
                  partnerUnifiedSaveTourDepartureWithListing({
                    listing,
                    iso: event.ymd,
                    startTimeHm: focusedDep.startTimeHm,
                    capacity: Number(spotsDraft),
                    cutoffHours: focusedDep.cutoffHours,
                    occupying: focusedDep.occupying,
                    scheduleCapacity: focusedDep.scheduleCapacity,
                    baselineCutoffHours: focusedDep.baselineCutoffHours,
                  })
                )
              }
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
              onClick={() =>
                void run('cutoff', () =>
                  partnerUnifiedSaveTourDepartureWithListing({
                    listing,
                    iso: event.ymd,
                    startTimeHm: focusedDep.startTimeHm,
                    capacity: focusedDep.capacity,
                    cutoffHours: Number(cutoffDraft),
                    occupying: focusedDep.occupying,
                    scheduleCapacity: focusedDep.scheduleCapacity,
                    baselineCutoffHours: focusedDep.baselineCutoffHours,
                  })
                )
              }
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
