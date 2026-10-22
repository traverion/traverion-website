/**
 * Contextual booking sidebar for Partner Inbox — quick ops context, not a second booking page.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { PanelRightClose, StickyNote } from 'lucide-react';
import type { BookingRow } from '../../data/supabase-bookings';
import {
  deleteSupplierBookingOpsNote,
  fetchSupplierBookingOpsNotes,
  upsertSupplierBookingOpsNote,
} from '../../data/supabase-booking-ops-notes';
import { pgTimeToHm } from '../../data/supabase-listings';
import { guestFacingBookingNotes } from '../../lib/booking-notes';
import { formatBookingDateDisplay } from '../../lib/booking-flow';
import {
  listingHeroImageSrc,
  orderedPhotoUrls,
  photoSlotsFromTourPackage,
} from '../../lib/listingPhotoGrid';
import { formatBookingParticipantsLabel } from '../../lib/participant-mix';
import { resolvePartnerArrivalDisplay } from '../../lib/partner-booking-logistics';
import { partnerBookingLifecycleLabel } from '../../lib/partner-bookings-desk';
import { bookingIsStayNight } from '../../lib/pickup-completeness';
import {
  displayCheckInAddressFromPurchase,
  displayListingTitleFromPurchase,
  displayOptionLabelFromPurchase,
  displayStayCheckInTimeFromPurchase,
  displayStayCheckOutTimeFromPurchase,
  displayStayHouseRulesFromPurchase,
  partnerOpsDepartureDisplay,
} from '../../lib/purchase-snapshot';
import { travelerPublicBookingReference } from '../../lib/public-booking-reference';
import { formatStayNightHuman } from '../../lib/stay-calendar';
import { stayRangeFromBooking } from '../../lib/stayOccupancy';
import { isStayRequestAwaitingHost } from '../../lib/stay-request-approval';
import { canManageBookings, type SupplierRole } from '../../lib/supplierTeamRoles';
import { materializedBookingOptions, parseListingExtras } from '../../types/listingExtras';
import type { TourPackage } from '../../types/tour';

function guestPhoneFromNotes(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const line of raw.split(/\n+/)) {
    const match = line.trim().match(/^Guest phone\s*:\s*(.+)$/i);
    const phone = match?.[1]?.trim();
    if (phone) return phone;
  }
  return null;
}

function customerRequestNotes(raw: string | null | undefined): string {
  return guestFacingBookingNotes(raw)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^(Guest phone|Participants)\s*:/i.test(line))
    .join('\n')
    .trim();
}

function listingThumb(listing: TourPackage | undefined): string | null {
  if (!listing) return null;
  const urls = orderedPhotoUrls(photoSlotsFromTourPackage(listing));
  return listingHeroImageSrc(urls[0] || listing.image);
}

type Props = {
  booking: BookingRow;
  listing: TourPackage | undefined;
  listingTitle: string;
  supplierId: string;
  role: SupplierRole | null | undefined;
  onViewFullBooking: () => void;
  onClose?: () => void;
  /** Warm full booking prefetch while hovering the CTA. */
  onWarmBooking?: () => void;
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === '') return null;
  return (
    <div className="tv-inbox-booking__fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function InboxBookingPanel({
  booking,
  listing,
  listingTitle,
  supplierId,
  role,
  onViewFullBooking,
  onClose,
  onWarmBooking,
}: Props) {
  const canEdit = canManageBookings(role);
  const isStay = bookingIsStayNight(booking) || isStayRequestAwaitingHost(booking);
  const extras = listing ? parseListingExtras(listing.listingExtras) : null;
  const bookingOptions = extras
    ? materializedBookingOptions(extras.bookingOptions).map((o) => ({
        id: o.id,
        name: o.name?.trim() || '',
        pickupPlace: o.pickupPlace,
        optionInfo: o.optionInfo,
        travelerStartInstructions: o.travelerStartInstructions,
        fulfillment: o.fulfillment ?? null,
      }))
    : [];

  const title = displayListingTitleFromPurchase(booking.purchase_snapshot, listingTitle, 'Listing');
  const liveOption =
    booking.booking_option_id && bookingOptions.length
      ? bookingOptions.find((o) => o.id === booking.booking_option_id)?.name?.trim() || ''
      : '';
  const optionLabel = displayOptionLabelFromPurchase(booking.purchase_snapshot, liveOption);
  const reference =
    travelerPublicBookingReference(booking.public_reference) ||
    (typeof booking.booking_number === 'number' && booking.booking_number > 0
      ? `#${booking.booking_number}`
      : booking.id.slice(0, 8));
  const statusLabel = partnerBookingLifecycleLabel(booking.status);
  const participants = formatBookingParticipantsLabel(booking);
  const guestPhone = guestPhoneFromNotes(booking.special_requests);
  const guestNotes = customerRequestNotes(booking.special_requests);
  const imageUrl = listingThumb(listing);

  const arrival = !isStay
    ? resolvePartnerArrivalDisplay({
        purchaseSnapshot: booking.purchase_snapshot,
        bookingOptionId: booking.booking_option_id,
        specialRequests: booking.special_requests,
        listingMeetingPoint: listing?.meetingPoint,
        listingPickupInstructions: listing?.pickupInstructions,
        bookingOptions,
        pickupTimeHm: pgTimeToHm(booking.pickup_time),
      })
    : null;

  const dep = !isStay
    ? partnerOpsDepartureDisplay(booking.purchase_snapshot, pgTimeToHm(booking.start_time))
    : null;
  const pickupHm = pgTimeToHm(booking.pickup_time);

  const stay = isStay ? stayRangeFromBooking(booking) : null;
  const stayInTime = displayStayCheckInTimeFromPurchase(
    booking.purchase_snapshot,
    extras?.stay?.checkInTime
  );
  const stayOutTime = displayStayCheckOutTimeFromPurchase(
    booking.purchase_snapshot,
    extras?.stay?.checkOutTime
  );
  const propertyAddress = displayCheckInAddressFromPurchase(
    booking.purchase_snapshot,
    booking.payment_status
  );
  const houseRules = displayStayHouseRulesFromPurchase(booking.purchase_snapshot);
  const accessInstructions = isStay
    ? resolvePartnerArrivalDisplay({
        purchaseSnapshot: booking.purchase_snapshot,
        bookingOptionId: booking.booking_option_id,
        specialRequests: booking.special_requests,
        listingMeetingPoint: listing?.meetingPoint,
        listingPickupInstructions: listing?.pickupInstructions,
        bookingOptions,
      }).instructions
    : null;

  const [opsNote, setOpsNote] = useState('');
  const [opsNoteSavedAt, setOpsNoteSavedAt] = useState<string | null>(null);
  const [opsNoteLoading, setOpsNoteLoading] = useState(true);
  const [opsNoteSaving, setOpsNoteSaving] = useState(false);
  const [opsNoteError, setOpsNoteError] = useState<string | null>(null);
  const [opsNoteDirty, setOpsNoteDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setOpsNoteLoading(true);
    setOpsNoteError(null);
    setOpsNoteDirty(false);
    void fetchSupplierBookingOpsNotes(supplierId, [booking.id]).then((map) => {
      if (cancelled) return;
      const row = map[booking.id];
      setOpsNote(row?.note ?? '');
      setOpsNoteSavedAt(row?.updatedAt ?? null);
      setOpsNoteLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [supplierId, booking.id]);

  const saveOpsNote = useCallback(async () => {
    if (!canEdit || opsNoteSaving) return;
    setOpsNoteSaving(true);
    setOpsNoteError(null);
    const trimmed = opsNote.trim();
    const ok = trimmed
      ? await upsertSupplierBookingOpsNote(supplierId, booking.id, trimmed)
      : await deleteSupplierBookingOpsNote(supplierId, booking.id);
    setOpsNoteSaving(false);
    if (!ok) {
      setOpsNoteError('Could not save private note. Try again.');
      return;
    }
    setOpsNote(trimmed);
    setOpsNoteSavedAt(trimmed ? new Date().toISOString() : null);
    setOpsNoteDirty(false);
  }, [canEdit, opsNoteSaving, opsNote, supplierId, booking.id]);

  const nights =
    typeof booking.nights === 'number' && booking.nights > 0
      ? booking.nights
      : stay
        ? Math.max(
            1,
            Math.round(
              (new Date(`${stay.checkOut}T12:00:00`).getTime() -
                new Date(`${stay.checkIn}T12:00:00`).getTime()) /
                86_400_000
            )
          )
        : null;

  return (
    <aside className="tv-inbox-booking" aria-label="Booking details">
      <header className="tv-inbox-booking__head">
        <h2 className="tv-inbox-booking__heading">Booking</h2>
        {onClose ? (
          <button
            type="button"
            className="tv-inbox-booking__close lux-flat"
            aria-label="Hide booking details"
            onClick={onClose}
          >
            <PanelRightClose className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </header>

      <div className="tv-inbox-booking__scroll">
        <section className="tv-inbox-booking__section">
          <div className="tv-inbox-booking__summary">
            {imageUrl ? (
              <img src={imageUrl} alt="" className="tv-inbox-booking__thumb" />
            ) : (
              <div className="tv-inbox-booking__thumb tv-inbox-booking__thumb--empty" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="tv-inbox-booking__title" title={title}>
                {title}
              </p>
              <p className="tv-inbox-booking__guest">{booking.guest_name?.trim() || 'Traveler'}</p>
              <div className="tv-inbox-booking__chips">
                <span className="tv-inbox-booking__status">{statusLabel}</span>
                <span className="tv-inbox-booking__ref">{reference}</span>
              </div>
            </div>
          </div>
          <dl className="tv-inbox-booking__facts">
            {isStay ? (
              <>
                <Fact label="Check-in">
                  {stay
                    ? `${formatStayNightHuman(stay.checkIn)}${stayInTime ? ` · ${stayInTime}` : ''}`
                    : booking.booking_date
                      ? formatBookingDateDisplay(booking.booking_date)
                      : null}
                </Fact>
                <Fact label="Check-out">
                  {stay
                    ? `${formatStayNightHuman(stay.checkOut)}${stayOutTime ? ` · ${stayOutTime}` : ''}`
                    : null}
                </Fact>
                <Fact label="Stay">
                  {nights != null ? `${nights} night${nights === 1 ? '' : 's'}` : null}
                </Fact>
              </>
            ) : (
              <>
                <Fact label="Date">
                  {booking.booking_date ? formatBookingDateDisplay(booking.booking_date) : null}
                </Fact>
                <Fact label="Departure">{dep?.displayHm || null}</Fact>
                {dep?.purchasedNote ? <Fact label="Note">{dep.purchasedNote}</Fact> : null}
                {optionLabel ? <Fact label="Option">{optionLabel}</Fact> : null}
              </>
            )}
            <Fact label={isStay ? 'Guests' : 'Participants'}>{participants !== '—' ? participants : null}</Fact>
          </dl>
        </section>

        {isStay ? (
          <section className="tv-inbox-booking__section">
            <h3 className="tv-inbox-booking__section-title">Arrival</h3>
            <dl className="tv-inbox-booking__facts">
              <Fact label="Address">{propertyAddress}</Fact>
              <Fact label="Access">{accessInstructions}</Fact>
              <Fact label="House rules">{houseRules}</Fact>
            </dl>
            {!propertyAddress && !accessInstructions && !houseRules ? (
              <p className="tv-inbox-booking__muted">No arrival details on this reservation yet.</p>
            ) : null}
          </section>
        ) : arrival ? (
          <section className="tv-inbox-booking__section">
            <h3 className="tv-inbox-booking__section-title">{arrival.sectionLabel}</h3>
            <dl className="tv-inbox-booking__facts">
              {arrival.railLabel ? (
                <Fact label="Type">
                  <span className={arrival.needsLocation ? 'text-amber-800' : undefined}>
                    {arrival.railLabel}
                  </span>
                </Fact>
              ) : null}
              <Fact label="Place">{arrival.place}</Fact>
              <Fact label="Instructions">{arrival.instructions}</Fact>
              {arrival.fulfillment === 'pickup' && pickupHm ? (
                <Fact label="Pickup time">{pickupHm}</Fact>
              ) : null}
            </dl>
            {!arrival.place && !arrival.instructions && !(arrival.fulfillment === 'pickup' && pickupHm) ? (
              <p className="tv-inbox-booking__muted">
                {arrival.needsLocation ? 'Location still needed from the traveler.' : 'No logistics set yet.'}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="tv-inbox-booking__section">
          <h3 className="tv-inbox-booking__section-title">Guest</h3>
          <dl className="tv-inbox-booking__facts">
            <Fact label="Name">{booking.guest_name?.trim() || 'Traveler'}</Fact>
            <Fact label="Email">
              {booking.guest_email?.trim() ? (
                <a href={`mailto:${booking.guest_email.trim()}`} className="text-finland hover:underline">
                  {booking.guest_email.trim()}
                </a>
              ) : null}
            </Fact>
            <Fact label="Phone">
              {guestPhone ? (
                <a href={`tel:${guestPhone.replace(/[^\d+]/g, '')}`} className="text-finland hover:underline">
                  {guestPhone}
                </a>
              ) : null}
            </Fact>
            <Fact label="Guest notes">{guestNotes || null}</Fact>
          </dl>
        </section>

        <section className="tv-inbox-booking__section">
          <h3 className="tv-inbox-booking__section-title">
            <StickyNote className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5 text-ink-faint" aria-hidden />
            Private notes
          </h3>
          <p className="tv-inbox-booking__note-hint">
            Visible only to your team. Never shown to the traveler or in messages.
          </p>
          {opsNoteLoading ? (
            <div className="h-16 rounded-md bg-black/[0.04] animate-pulse" aria-busy="true" />
          ) : (
            <>
              <label htmlFor={`inbox-ops-note-${booking.id}`} className="sr-only">
                Private supplier notes for this booking
              </label>
              <textarea
                id={`inbox-ops-note-${booking.id}`}
                className="tv-inbox-booking__note-input"
                rows={3}
                maxLength={4000}
                value={opsNote}
                disabled={!canEdit || opsNoteSaving}
                placeholder={canEdit ? 'Add a private ops note…' : 'No private note'}
                onChange={(e) => {
                  setOpsNote(e.target.value);
                  setOpsNoteDirty(true);
                }}
              />
              {canEdit ? (
                <div className="tv-inbox-booking__note-actions">
                  <button
                    type="button"
                    className="tv-btn-secondary h-8 !px-2.5 text-[12.5px]"
                    disabled={opsNoteSaving || !opsNoteDirty}
                    onClick={() => void saveOpsNote()}
                  >
                    {opsNoteSaving ? 'Saving…' : 'Save note'}
                  </button>
                  {opsNoteSavedAt && !opsNoteDirty ? (
                    <span className="tv-inbox-booking__muted">
                      Saved{' '}
                      {new Date(opsNoteSavedAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="tv-inbox-booking__muted">Your role can read notes but cannot edit them.</p>
              )}
              {opsNoteError ? (
                <p className="mt-1.5 text-xs text-red-700" role="alert">
                  {opsNoteError}
                </p>
              ) : null}
            </>
          )}
        </section>
      </div>

      <footer className="tv-inbox-booking__foot">
        <button
          type="button"
          className="tv-inbox-view-booking tv-btn-secondary w-full justify-center h-9 text-[13px]"
          onClick={onViewFullBooking}
          onPointerEnter={onWarmBooking}
          onFocus={onWarmBooking}
        >
          View full booking
        </button>
      </footer>
    </aside>
  );
}
