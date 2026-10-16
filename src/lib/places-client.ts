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
    body.locationBias = {
      circle: {
        center: { latitude: bias.lat, longitude: bias.lng },
        radius: Math.min(50000, Math.round(bias.radiusKm * 1000)),
      },
    };
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
