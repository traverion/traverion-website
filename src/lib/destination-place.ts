import type { ListingBookingOption } from '../types/listingExtras';

/** A Basics destination the supplier selected from Places. Not inferred from a typed city name. */
export type VerifiedDestination = {
  placeId: string;
  city: string;
  country: string;
  countryCode: string;
  /** Traveler-facing label, always "City, Country". */
  formatted: string;
  lat: number;
  lng: number;
};

export function travelerDestinationLabel(city: string, country: string): string {
  return [city.trim(), country.trim()].filter(Boolean).join(', ');
}

export function verifiedDestination(input: {
  placeId?: string | null;
  city?: string | null;
  country?: string | null;
  countryCode?: string | null;
  formatted?: string | null;
  lat?: number | null;
  lng?: number | null;
}): VerifiedDestination | null {
  const placeId = (input.placeId ?? '').trim();
  const city = (input.city ?? '').trim();
  const country = (input.country ?? '').trim();
  const countryCode = (input.countryCode ?? '').trim().toUpperCase();
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!placeId || !city || !country || !/^[A-Z]{2}$/.test(countryCode)) return null;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return null;
  }
  return {
    placeId,
    city,
    country,
    countryCode,
    formatted: travelerDestinationLabel(city, country),
    lat,
    lng,
  };
}

function hasVerifiedPickupCenter(option: ListingBookingOption): boolean {
  return (
    Boolean(option.pickupPlaceId?.trim()) &&
    option.pickupCenterLat != null &&
    option.pickupCenterLng != null &&
    Number.isFinite(option.pickupCenterLat) &&
    Number.isFinite(option.pickupCenterLng)
  );
}

export function pickupCenterPatchFromDestination(
  destination: VerifiedDestination
): Partial<ListingBookingOption> {
  return {
    pickupPlace: destination.formatted,
    pickupFormattedAddress: destination.formatted,
    pickupCenterLat: destination.lat,
    pickupCenterLng: destination.lng,
    pickupPlaceId: destination.placeId,
    pickupCenterSource: 'destination',
    pickupCenterLinkedPlaceId: destination.placeId,
  };
}

/**
 * First time an option becomes a pickup option. Does not replace a center that is already saved,
 * including a legacy name-only option that already has fulfillment pickup.
 */
export function pickupFulfillmentPatch(
  option: ListingBookingOption,
  destination: VerifiedDestination | null
): Partial<ListingBookingOption> {
  if (option.fulfillment === 'pickup' || hasVerifiedPickupCenter(option) || !destination) {
    return { fulfillment: 'pickup' };
  }
  return { fulfillment: 'pickup', ...pickupCenterPatchFromDestination(destination) };
}

export function customPickupCenterPatch(place: {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
}, destination: VerifiedDestination | null): Partial<ListingBookingOption> {
  const follows = Boolean(destination && place.placeId === destination.placeId);
  return {
    pickupPlace: follows ? destination!.formatted : place.name || place.formattedAddress,
    pickupFormattedAddress: follows ? destination!.formatted : place.formattedAddress,
    pickupCenterLat: place.lat,
    pickupCenterLng: place.lng,
    pickupPlaceId: place.placeId,
    pickupCenterSource: follows ? 'destination' : 'custom',
    pickupCenterLinkedPlaceId: follows ? destination!.placeId : undefined,
  };
}

/** Update centers that still follow the previous destination. Custom and legacy centers stay. */
export function syncLinkedPickupCenters<T extends ListingBookingOption>(
  options: T[],
  previousPlaceId: string,
  next: VerifiedDestination | null
): T[] {
  const previous = previousPlaceId.trim();
  if (!previous || !next || previous === next.placeId) return options;
  return options.map((option) => {
    if (option.fulfillment !== 'pickup') return option;
    if (option.pickupCenterSource !== 'destination') return option;
    if ((option.pickupCenterLinkedPlaceId ?? '').trim() !== previous) return option;
    return { ...option, ...pickupCenterPatchFromDestination(next) };
  });
}
