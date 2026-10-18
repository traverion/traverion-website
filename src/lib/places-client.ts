/**
 * Google Places (New) from the browser.
 * Live suggestions require VITE_GOOGLE_MAPS_API_KEY. This module never invents results.
 */

export type PlaceSuggestion = {
  placeId: string;
  name: string;
  address: string;
};

export type ResolvedPlace = {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
};

export function googleMapsBrowserKey(): string {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  return typeof key === 'string' ? key.trim() : '';
}

export function placesSearchConfigured(): boolean {
  return googleMapsBrowserKey().length >= 20;
}

export async function autocompletePlaces(
  input: string,
  bias?: { lat: number; lng: number; radiusKm: number }
): Promise<PlaceSuggestion[]> {
  const query = input.trim();
  if (!placesSearchConfigured() || query.length < 2) return [];
  const body: Record<string, unknown> = { input: query };
  if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng) && bias.radiusKm > 0) {
    const meters = Math.round(bias.radiusKm * 1000);
    const circle = {
      center: { latitude: bias.lat, longitude: bias.lng },
      radius: Math.min(50000, Math.max(1, meters)),
    };
    // Places rejects a circle larger than 50 km. Inside that limit, restrict
    // suggestions to the supplier radius. Wider areas stay biased, and the
    // caller still rejects coordinates outside the real radius.
    if (meters <= 50000) body.locationRestriction = { circle };
    else body.locationBias = { circle };
  }
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleMapsBrowserKey(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Location search is unavailable.');
  const data = (await res.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      };
    }>;
  };
  const out: PlaceSuggestion[] = [];
  for (const row of data.suggestions ?? []) {
    const prediction = row.placePrediction;
    const placeId = prediction?.placeId?.trim() ?? '';
    if (!placeId) continue;
    const name = prediction?.structuredFormat?.mainText?.text?.trim() || prediction?.text?.text?.trim() || '';
    const address = prediction?.structuredFormat?.secondaryText?.text?.trim() || '';
    if (!name) continue;
    out.push({ placeId, name, address });
    if (out.length >= 6) break;
  }
  return out;
}

/** Best-effort address for a moved pin. Null when geocoding is unavailable. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!placesSearchConfigured() || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('key', googleMapsBrowserKey());
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = (await res.json()) as { status?: string; results?: Array<{ formatted_address?: string }> };
  if (data.status !== 'OK') return null;
  const formatted = (data.results?.[0]?.formatted_address ?? '').trim();
  return formatted.length >= 3 ? formatted : null;
}

export async function resolvePlace(placeId: string): Promise<ResolvedPlace | null> {
  const id = placeId.trim();
  if (!placesSearchConfigured() || !id) return null;
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
    headers: {
      'X-Goog-Api-Key': googleMapsBrowserKey(),
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
    },
  });
  if (!res.ok) throw new Error('That place could not be loaded.');
  const data = (await res.json()) as {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  };
  const lat = Number(data.location?.latitude);
  const lng = Number(data.location?.longitude);
  const formattedAddress = (data.formattedAddress ?? '').trim();
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || formattedAddress.length < 3) return null;
  return {
    placeId: (data.id ?? id).trim(),
    name: data.displayName?.text?.trim() || formattedAddress,
    formattedAddress,
    lat,
    lng,
  };
}

const DESTINATION_TYPES = ['locality', 'postal_town', 'administrative_area_level_3', 'colloquial_area'];

/** Cities, towns, municipalities, and destination areas. Not hotels or street addresses. */
export async function autocompleteDestinations(
  input: string,
  signal?: AbortSignal
): Promise<PlaceSuggestion[]> {
  const query = input.trim();
  if (!placesSearchConfigured() || query.length < 2) return [];
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleMapsBrowserKey(),
    },
    body: JSON.stringify({
      input: query,
      languageCode: 'en',
      includedPrimaryTypes: DESTINATION_TYPES,
    }),
  });
  if (!res.ok) throw new Error('Location search is unavailable.');
  const data = (await res.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      };
    }>;
  };
  const out: PlaceSuggestion[] = [];
  for (const row of data.suggestions ?? []) {
    const prediction = row.placePrediction;
    const placeId = prediction?.placeId?.trim() ?? '';
    if (!placeId) continue;
    const name = prediction?.structuredFormat?.mainText?.text?.trim() || prediction?.text?.text?.trim() || '';
    const address = prediction?.structuredFormat?.secondaryText?.text?.trim() || '';
    if (!name) continue;
    out.push({ placeId, name, address });
    if (out.length >= 6) break;
  }
  return out;
}

export type ResolvedDestination = {
  placeId: string;
  city: string;
  country: string;
  countryCode: string;
  formatted: string;
  lat: number;
  lng: number;
};

/** Place details for a destination. Returns null when the place has no country or coordinates. */
export async function resolveDestination(
  placeId: string,
  signal?: AbortSignal
): Promise<ResolvedDestination | null> {
  const id = placeId.trim();
  if (!placesSearchConfigured() || !id) return null;
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=en`,
    {
      signal,
      headers: {
        'X-Goog-Api-Key': googleMapsBrowserKey(),
        'X-Goog-FieldMask': 'id,displayName,location,addressComponents',
      },
    }
  );
  if (!res.ok) throw new Error('That place could not be loaded.');
  const data = (await res.json()) as {
    id?: string;
    displayName?: { text?: string };
    location?: { latitude?: number; longitude?: number };
    addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
  };
  const country = (data.addressComponents ?? []).find((row) => row.types?.includes('country'));
  const countryName = country?.longText?.trim() ?? '';
  const countryCode = (country?.shortText ?? '').trim().toUpperCase();
  const city = data.displayName?.text?.trim() ?? '';
  const lat = Number(data.location?.latitude);
  const lng = Number(data.location?.longitude);
  if (!city || countryName.length < 2 || !/^[A-Z]{2}$/.test(countryCode)) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    placeId: (data.id ?? id).trim(),
    city,
    country: countryName,
    countryCode,
    formatted: `${city}, ${countryName}`,
    lat,
    lng,
  };
}
