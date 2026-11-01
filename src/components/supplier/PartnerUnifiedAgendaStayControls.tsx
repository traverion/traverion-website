/**
 * Agenda stay availability controls — block/unblock for the card's date.
 * Optimistic local patches; never reloads the full calendar.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { TourPackage } from '../../types/tour';
import type { BookingRow } from '../../data/supabase-bookings';
import {
  partnerUnifiedBlockStayNight,
  partnerUnifiedStayNightSummary,
  partnerUnifiedUnblockStayNight,
} from '../../lib/partner-unified-day-edits';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import type { PartnerUnifiedCalendarEvent } from '../../lib/partner-unified-calendar';

export type StayCapRow = {
  listing_id: string;
  available_date: string;
  capacity: number;
};

export type PartnerUnifiedAgendaStayPatch = {
  type: 'stayCap';
  listingId: string;
  iso: string;
  /** null removes the cap row (unblocked / default). */
  capacity: number | null;
};

type Props = {
  event: PartnerUnifiedCalendarEvent;
  listing: TourPackage;
  bookings: BookingRow[];
  stayCaps: StayCapRow[];
  canEdit: boolean;
  onPatch: (patch: PartnerUnifiedAgendaStayPatch) => void;
};

function statusLabel(kind: string, blocked: boolean): string {
  if (blocked || kind === 'blocked') return 'Blocked';
  if (kind === 'booked' || kind === 'pending') return 'Occupied';
  return 'Available';
}

function PartnerUnifiedAgendaStayControls({
  event,
  listing,
  bookings,
  stayCaps,
  canEdit,
  onPatch,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localBlocked, setLocalBlocked] = useState<boolean | null>(null);
  const inFlightRef = useRef(false);

  const listingBookings = useMemo(
    () => bookings.filter((b) => b.listing_id === listing.id),
    [bookings, listing.id]
  );

  const summary = useMemo(
    () =>
      partnerUnifiedStayNightSummary({
        listingId: listing.id,
        iso: event.ymd,
        bookings: listingBookings,
        caps: stayCaps,
      }),
    [listing.id, event.ymd, listingBookings, stayCaps]
  );

  const blocked = localBlocked ?? summary.blocked;
  const kind = blocked ? 'blocked' : summary.kind;
  const label = statusLabel(kind, blocked);

  useEffect(() => {
    if (localBlocked != null && localBlocked === summary.blocked) setLocalBlocked(null);
  }, [summary.blocked, localBlocked]);

  const toggleBlock = async () => {
    if (!canEdit || inFlightRef.current) return;
    if (!blocked && !summary.canBlock) {
      setError('This night has a confirmed reservation and cannot be blocked.');
      return;
    }
    if (blocked && !summary.canUnblock && summary.blocked) {
      setError('No removable block on this night.');
      return;
    }
    const nextBlocked = !blocked;
    const previous = blocked;
    inFlightRef.current = true;
    setSaving(true);
    setError(null);
    setLocalBlocked(nextBlocked);
    onPatch({
      type: 'stayCap',
      listingId: listing.id,
      iso: event.ymd,
      capacity: nextBlocked ? 0 : null,
    });
    try {
      const res = nextBlocked
        ? await partnerUnifiedBlockStayNight({
            listingId: listing.id,
            iso: event.ymd,
            bookings: listingBookings,
          })
        : await partnerUnifiedUnblockStayNight({
            listingId: listing.id,
            iso: event.ymd,
            bookings: listingBookings,
            caps: stayCaps,
          });
      if (!res.ok) {
        setLocalBlocked(previous);
        onPatch({
          type: 'stayCap',
          listingId: listing.id,
          iso: event.ymd,
          capacity: previous ? 0 : null,
        });
        setError(res.error ?? 'Could not save.');
      }
    } catch (e) {
      setLocalBlocked(previous);
      onPatch({
        type: 'stayCap',
        listingId: listing.id,
        iso: event.ymd,
        capacity: previous ? 0 : null,
      });
      setError(userFacingError(e, USER_ERROR.listingSave));
    } finally {
      inFlightRef.current = false;
      setSaving(false);
    }
  };

  const switchDisabled =
    !canEdit ||
    saving ||
    (!blocked && !summary.canBlock) ||
    (blocked && summary.blocked && !summary.canUnblock);

  return (
    <div className="puc-tour-ops" onClick={(e) => e.stopPropagation()}>
      <div className="puc-tour-ops__seg puc-tour-ops__seg--block">
        <label className={`puc-tour-ops__switch${blocked ? ' is-on' : ''}`}>
          <span className="puc-tour-ops__seg-label">Block</span>
          <input
            type="checkbox"
            role="switch"
            aria-label={blocked ? 'Unblock night' : 'Block night'}
            checked={blocked}
            disabled={switchDisabled}
            onChange={() => void toggleBlock()}
          />
          <span className="puc-tour-ops__switch-ui" aria-hidden>
            {saving ? <Loader2 className="puc-tour-ops__spin" aria-hidden /> : null}
          </span>
        </label>
      </div>

      <div className="puc-tour-ops__seg">
        <span className="puc-tour-ops__seg-label">Status</span>
        <span
          className={`puc-tour-ops__value${
            blocked ? ' puc-tour-ops__value--blocked' : kind === 'booked' || kind === 'pending' ? ' puc-tour-ops__value--occupied' : ''
          }`}
        >
          {label}
        </span>
      </div>

      {error ? (
        <p className="puc-tour-ops__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default memo(PartnerUnifiedAgendaStayControls);
