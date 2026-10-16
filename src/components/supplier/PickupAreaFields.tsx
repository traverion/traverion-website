import PickupLocationSearch from '../checkout/PickupLocationSearch';
import { pickupAreaFromOption, type TravelerPickupPoint } from '../../lib/pickup-area';
import { placesSearchConfigured } from '../../lib/places-client';
import type { ListingBookingOption } from '../../types/listingExtras';

type Props = {
  option: ListingBookingOption;
  onChange: (patch: Partial<ListingBookingOption>) => void;
};

function centerPoint(option: ListingBookingOption): TravelerPickupPoint | null {
  if (!option.pickupPlaceId || option.pickupCenterLat == null || option.pickupCenterLng == null) return null;
  return {
    lat: option.pickupCenterLat,
    lng: option.pickupCenterLng,
    placeId: option.pickupPlaceId,
    name: option.pickupPlace.trim() || 'Pickup center',
    formattedAddress: option.pickupFormattedAddress?.trim() || option.pickupPlace.trim(),
  };
}

export default function PickupAreaFields({ option, onChange }: Props) {
  const configured = placesSearchConfigured();
  const area = pickupAreaFromOption(option);

  if (option.fulfillment === 'meeting_point') {
    const meeting =
      option.meetingPlaceId && option.meetingLat != null && option.meetingLng != null
        ? {
            lat: option.meetingLat,
            lng: option.meetingLng,
            placeId: option.meetingPlaceId,
            name: option.pickupPlace.trim() || 'Meeting point',
            formattedAddress: option.pickupPlace.trim(),
          }
        : null;
    const mapsHref =
      meeting != null
        ? `https://www.google.com/maps/search/?api=1&query=${meeting.lat},${meeting.lng}`
        : option.pickupPlace.trim()
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(option.pickupPlace.trim())}`
          : '';
    return (
      <div className="space-y-3">
        {configured ? (
          <PickupLocationSearch
            id="supplier-meeting-point-search"
            label="Meeting point"
            selected={meeting}
            onSelect={(place) => {
              if (!place) {
                onChange({ meetingLat: undefined, meetingLng: undefined, meetingPlaceId: undefined });
                return;
              }
              onChange({
                pickupPlace: place.formattedAddress,
                meetingLat: place.lat,
                meetingLng: place.lng,
                meetingPlaceId: place.placeId,
              });
            }}
          />
        ) : (
          <p className="text-[13px] text-ink-muted">
            Map search needs VITE_GOOGLE_MAPS_API_KEY. You can still enter the meeting address below.
          </p>
        )}
        {mapsHref ? (
          <a href={mapsHref} target="_blank" rel="noreferrer" className="inline-flex text-sm font-semibold text-finland hover:underline">
            Open in Google Maps
          </a>
        ) : null}
      </div>
    );
  }

  if (option.fulfillment !== 'pickup') return null;

  return (
    <div className="space-y-3">
      {!area ? (
        <p className="text-[13px] font-medium text-amber-800" role="status">
          Pickup area not configured. The saved place name is not used as a pickup center.
        </p>
      ) : null}
      {configured ? (
        <PickupLocationSearch
          id="supplier-pickup-center-search"
          label="Pickup center"
          selected={centerPoint(option)}
          onSelect={(place) => {
            if (!place) {
              onChange({
                pickupCenterLat: undefined,
                pickupCenterLng: undefined,
                pickupPlaceId: undefined,
                pickupFormattedAddress: undefined,
              });
              return;
            }
            onChange({
              pickupPlace: place.name || place.formattedAddress,
              pickupFormattedAddress: place.formattedAddress,
              pickupCenterLat: place.lat,
              pickupCenterLng: place.lng,
              pickupPlaceId: place.placeId,
            });
          }}
        />
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-950">
          Location search needs VITE_GOOGLE_MAPS_API_KEY. This pickup option cannot accept traveler locations until a
          center and radius are saved.
        </p>
      )}
      <div className="space-y-1.5">
        <label htmlFor="booking-option-pickup-radius" className="block text-[13px] font-semibold text-ink">
          Pickup radius (km)
        </label>
        <input
          id="booking-option-pickup-radius"
          type="number"
          min={1}
          max={150}
          step={0.5}
          value={option.pickupRadiusKm ?? ''}
          onChange={(event) => {
            const next = Number(event.target.value);
            onChange({
              pickupRadiusKm: Number.isFinite(next) && next >= 1 ? Math.min(150, next) : undefined,
            });
          }}
          className="tv-input text-[15px]"
        />
        <p className="text-[12px] text-ink-muted">
          Straight-line eligibility around the center. It is not a driving-distance promise.
        </p>
      </div>
      {area ? (
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 120 120" className="h-24 w-24 text-finland" aria-hidden>
            <circle cx="60" cy="60" r="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
            <circle cx="60" cy="60" r="3.5" fill="currentColor" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-ink">{area.radiusKm} km radius</p>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${area.lat},${area.lng}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex text-sm font-semibold text-finland hover:underline"
            >
              View center on Google Maps
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
