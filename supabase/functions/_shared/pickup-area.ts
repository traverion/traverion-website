/** Geodesic pickup eligibility. A radius is a straight-line rule, not a driving distance. */

export type GeoPoint = { lat: number; lng: number };

export type PickupArea = GeoPoint & {
  radiusKm: number;
  /** Supplier's area label. Not the traveler's chosen hotel. */
  label: string;
  placeId: string | null;
};

export type TravelerPickupPoint = GeoPoint & {
  placeId: string;
  formattedAddress: string;
  name: string;
};

export const PICKUP_OUTSIDE_AREA_MESSAGE =
  'This location is outside the available pickup area. Please choose another location within the supported area.';

export const PICKUP_AREA_MISSING_MESSAGE =
  'This option does not have a pickup area yet. The operator needs to set a pickup center and radius.';

export const PICKUP_CHOOSE_SUGGESTION_MESSAGE = 'Choose a pickup location from the suggestions.';

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function finiteCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function pickupAreaFromOption(option: {
  fulfillment?: 'pickup' | 'meeting_point' | null;
  pickupPlace?: string | null;
  pickupCenterLat?: number | null;
  pickupCenterLng?: number | null;
  pickupRadiusKm?: number | null;
  pickupPlaceId?: string | null;
} | null | undefined): PickupArea | null {
  if (!option || option.fulfillment !== 'pickup') return null;
  const lat = Number(option.pickupCenterLat);
  const lng = Number(option.pickupCenterLng);
  const radiusKm = Number(option.pickupRadiusKm);
  if (!finiteCoord(lat, lng)) return null;
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 150) return null;
  const placeId = (option.pickupPlaceId ?? '').trim();
  return {
    lat,
    lng,
    radiusKm,
    label: (option.pickupPlace ?? '').trim(),
    placeId: placeId || null,
  };
}

export function parseTravelerPickupPoint(raw: unknown): TravelerPickupPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  const placeId = typeof row.placeId === 'string' ? row.placeId.trim() : '';
  const formattedAddress = typeof row.formattedAddress === 'string' ? row.formattedAddress.trim() : '';
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!placeId || formattedAddress.length < 3 || !finiteCoord(lat, lng)) return null;
  return { lat, lng, placeId, formattedAddress, name: name || formattedAddress };
}

/** Replace any client place-of-stay line with the address the server accepted. */
export function notesWithVerifiedPickup(notes: string, address: string): string {
  const rest = notes
    .split('\n')
    .filter((line) => !/^place of stay:/i.test(line.trim()))
    .join('\n')
    .trim();
  const line = `Place of stay: ${address.trim()}`;
  return rest ? `${line}\n\n${rest}` : line;
}

export function notesWithoutPlaceOfStay(notes: string): string {
  return notes
    .split('\n')
    .filter((line) => !/^place of stay:/i.test(line.trim()))
    .join('\n')
    .trim();
}

export function travelerPickupAddressFromRecord(input: {
  snapshot?: unknown;
  specialRequests?: string | null;
}): string {
  const snap = input.snapshot && typeof input.snapshot === 'object' ? (input.snapshot as Record<string, unknown>) : null;
  const fromSnap = typeof snap?.travelerPickupAddress === 'string' ? snap.travelerPickupAddress.trim() : '';
  if (fromSnap.length >= 3) return fromSnap;
  const line = (input.specialRequests ?? '')
    .split(/\n+/)
    .map((part) => part.trim())
    .find((part) => /^place of stay:/i.test(part));
  const fromNotes = line ? line.replace(/^place of stay:/i, '').trim() : '';
  return fromNotes.length >= 3 ? fromNotes : '';
}

export function travelerPickupAllowed(input: {
  fulfillment: 'pickup' | 'meeting_point' | null;
  area: PickupArea | null;
  point: TravelerPickupPoint | null;
}): { ok: true; address: string | null } | { ok: false; error: string } {
  if (input.fulfillment !== 'pickup') return { ok: true, address: null };
  if (!input.area) return { ok: false, error: PICKUP_AREA_MISSING_MESSAGE };
  const point = input.point;
  if (!point || !point.placeId.trim() || point.formattedAddress.trim().length < 3 || !finiteCoord(point.lat, point.lng)) {
    return { ok: false, error: PICKUP_CHOOSE_SUGGESTION_MESSAGE };
  }
  const distance = haversineKm(input.area, point);
  if (distance > input.area.radiusKm + 0.05) return { ok: false, error: PICKUP_OUTSIDE_AREA_MESSAGE };
  return { ok: true, address: point.formattedAddress.trim() };
}
