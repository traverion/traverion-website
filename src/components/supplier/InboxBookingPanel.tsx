/**
 * Compact contextual booking sidebar for Partner Inbox — essentials only.
 */
import type { ReactNode } from 'react';
import { PanelRightClose } from 'lucide-react';
import type { BookingRow } from '../../data/supabase-bookings';
import { pgTimeToHm } from '../../data/supabase-listings';
import { formatBookingDateDisplay } from '../../lib/booking-flow';
import {
  listingHeroImageSrc,
  orderedPhotoUrls,
  photoSlotsFromTourPackage,
} from '../../lib/listingPhotoGrid';
import { formatBookingParticipantsLabel } from '../../lib/participant-mix';
import { resolvePartnerArrivalDisplay } from '../../lib/partner-booking-logistics';
import { partnerBookingLifecycleLabel } from '../../lib/partner-bookings-desk';
import { bookingIsRental, bookingIsStayNight } from '../../lib/pickup-completeness';
import { parseRentalPurchaseSnapshot } from '../../lib/rental-booking-domain';
import {
  rentalPickupHandoverLabel,
  rentalReturnHandoverLabel,
} from '../../lib/rental-presentation';
import {
  displayListingTitleFromPurchase,
  displayOptionLabelFromPurchase,
  displayStayCheckInTimeFromPurchase,
  displayStayCheckOutTimeFromPurchase,
  partnerOpsDepartureDisplay,
} from '../../lib/purchase-snapshot';
import { travelerPublicBookingReference } from '../../lib/public-booking-reference';
import { formatStayNightHuman } from '../../lib/stay-calendar';
import { stayRangeFromBooking } from '../../lib/stayOccupancy';
import { isStayRequestAwaitingHost } from '../../lib/stay-request-approval';
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

function listingThumb(listing: TourPackage | undefined): string | null {
  if (!listing) return null;
  const urls = orderedPhotoUrls(photoSlotsFromTourPackage(listing));
  return listingHeroImageSrc(urls[0] || listing.image);
}

type Props = {
  booking: BookingRow;
  listing: TourPackage | undefined;
  listingTitle: string;
  onViewFullBooking: () => void;
  onClose?: () => void;
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
  onViewFullBooking,
  onClose,
  onWarmBooking,
}: Props) {
  const isRental = bookingIsRental(booking);
  const isStay = !isRental && (bookingIsStayNight(booking) || isStayRequestAwaitingHost(booking));
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
  const guestEmail = booking.guest_email?.trim() || null;
  const guestName = booking.guest_name?.trim() || 'Traveler';
  const imageUrl = listingThumb(listing);

  const rentalSnap = isRental ? parseRentalPurchaseSnapshot(booking.purchase_snapshot) : null;

  const arrival =
    !isStay && !isRental
      ? resolvePartnerArrivalDisplay({
          purchaseSnapshot: booking.purchase_snapshot,
          bookingOptionId: booking.booking_option_id,
          specialRequests: booking.special_requests,
          listingMeetingPoint: listing?.meetingPoint,
          listingPickupInstructions: listing?.pickupInstructions,
          bookingOptions,
        })
      : null;

  const dep =
    !isStay && !isRental
      ? partnerOpsDepartureDisplay(booking.purchase_snapshot, pgTimeToHm(booking.start_time))
      : null;
  const pickupHm = !isStay && !isRental ? pgTimeToHm(booking.pickup_time) : null;
  const showPickupTime = Boolean(pickupHm && arrival?.fulfillment === 'pickup');

  const stay = isStay ? stayRangeFromBooking(booking) : null;
  const stayInTime = displayStayCheckInTimeFromPurchase(
    booking.purchase_snapshot,
    extras?.stay?.checkInTime
  );
  const stayOutTime = displayStayCheckOutTimeFromPurchase(
    booking.purchase_snapshot,
    extras?.stay?.checkOutTime
  );

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

  const shortInstructions = (arrival?.instructions ?? '').trim();

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
              <span className="tv-inbox-booking__status">{statusLabel}</span>
            </div>
          </div>
          <dl className="tv-inbox-booking__facts">
            {isRental ? (
              <>
                <Fact label="Pickup">
                  {rentalSnap?.pickupAt
                    ? new Date(rentalSnap.pickupAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : booking.booking_date
                      ? formatBookingDateDisplay(booking.booking_date)
                      : null}
                </Fact>
                <Fact label="Return">
                  {rentalSnap?.returnAt
                    ? new Date(rentalSnap.returnAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : null}
                </Fact>
                <Fact label="Units">
                  {rentalSnap?.quantity != null
                    ? `${rentalSnap.quantity} unit${rentalSnap.quantity === 1 ? '' : 's'}`
                    : null}
                </Fact>
                <Fact label="Pickup method">
                  {rentalPickupHandoverLabel(rentalSnap ?? {})}
                </Fact>
                <Fact label="Return method">
                  {rentalReturnHandoverLabel(rentalSnap ?? {})}
                </Fact>
                {optionLabel ? (
                  <Fact label="Option">
                    <span title={optionLabel}>{optionLabel}</span>
                  </Fact>
                ) : null}
              </>
            ) : isStay ? (
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
                <Fact label="Nights">
                  {nights != null ? `${nights} night${nights === 1 ? '' : 's'}` : null}
                </Fact>
                <Fact label="Guests">{participants !== '—' ? participants : null}</Fact>
              </>
            ) : (
              <>
                <Fact label="Date">
                  {booking.booking_date ? formatBookingDateDisplay(booking.booking_date) : null}
                </Fact>
                <Fact label="Departure">{dep?.displayHm || null}</Fact>
                {optionLabel ? (
                  <Fact label="Option">
                    <span title={optionLabel}>{optionLabel}</span>
                  </Fact>
                ) : null}
                <Fact label="Participants">{participants !== '—' ? participants : null}</Fact>
              </>
            )}
          </dl>
        </section>

        {!isStay && arrival ? (
          <section className="tv-inbox-booking__section">
            <h3 className="tv-inbox-booking__section-title">
              {arrival.railLabel || arrival.sectionLabel}
            </h3>
            <dl className="tv-inbox-booking__facts">
              {showPickupTime ? (
                <Fact label="Pickup time">
                  <span className="tv-inbox-booking__pickup-time">{pickupHm}</span>
                </Fact>
              ) : null}
              <Fact label="Location">
                {arrival.place ? (
                  <span title={arrival.place}>{arrival.place}</span>
                ) : arrival.needsLocation ? (
                  <span className="tv-inbox-booking__warn">Location needed</span>
                ) : null}
              </Fact>
              {shortInstructions ? (
                <Fact label="Notes">
                  <span className="tv-inbox-booking__clamp" title={shortInstructions}>
                    {shortInstructions}
                  </span>
                </Fact>
              ) : null}
            </dl>
          </section>
        ) : null}

        <section className="tv-inbox-booking__section">
          <h3 className="tv-inbox-booking__section-title">Guest</h3>
          <dl className="tv-inbox-booking__facts">
            <Fact label="Name">{guestName}</Fact>
            <Fact label="Email">
              {guestEmail ? (
                <a
                  href={`mailto:${guestEmail}`}
                  className="text-finland hover:underline [overflow-wrap:anywhere]"
                  title={guestEmail}
                >
                  {guestEmail}
                </a>
              ) : null}
            </Fact>
            <Fact label="Phone">
              {guestPhone ? (
                <a
                  href={`tel:${guestPhone.replace(/[^\d+]/g, '')}`}
                  className="text-finland hover:underline"
                >
                  {guestPhone}
                </a>
              ) : null}
            </Fact>
          </dl>
        </section>

        <section className="tv-inbox-booking__section tv-inbox-booking__section--ref">
          <h3 className="tv-inbox-booking__section-title">Reference</h3>
          <p className="tv-inbox-booking__ref-code">{reference}</p>
        </section>
      </div>

      <footer className="tv-inbox-booking__foot">
        <button
          type="button"
          className="tv-inbox-view-booking tv-btn-secondary w-full justify-center h-8 text-[12.5px]"
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
