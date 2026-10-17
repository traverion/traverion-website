import { parsePickupDraft, parseSupplierPickupPoint, type PickupDraftRecord } from './booking-notes';
import { haversineKm, travelerPickupAddressFromRecord, type PickupArea } from './pickup-area';
import { displayFulfillmentFromPurchase, isPurchaseSnapshot } from './purchase-snapshot';

export type PickupPlannerBooking = {
  id: string;
  listing_id: string;
  booking_option_id?: string | null;
  booking_date?: string | null;
  start_time?: string | null;
  pickup_time?: string | null;
  guests?: number | null;
  guest_name?: string | null;
  guest_email?: string | null;
  special_requests?: string | null;
  purchase_snapshot?: unknown;
  booking_number?: number | null;
  public_reference?: string | null;
};

export type PickupAttention = 'location' | 'time' | 'draft' | 'outside';

export function pickupDepartureKey(b: PickupPlannerBooking): string {
  const snap = isPurchaseSnapshot(b.purchase_snapshot) ? b.purchase_snapshot : null;
  const optionId = (snap?.optionId || b.booking_option_id || '').trim();
  const scheduleId = (snap?.scheduleId || '').trim();
  const start = (snap?.startTimeHm || '').trim();
  return [b.listing_id, optionId, scheduleId, b.booking_date ?? '', start].join('|');
}

export function departureStartHm(b: PickupPlannerBooking): string {
  const snap = isPurchaseSnapshot(b.purchase_snapshot) ? b.purchase_snapshot : null;
  return (snap?.startTimeHm || '').trim();
}

export function departureTimezone(b: PickupPlannerBooking): string | null {
  const snap = isPurchaseSnapshot(b.purchase_snapshot) ? b.purchase_snapshot : null;
  const zone = (snap?.departureTimezone || '').trim();
  return zone || null;
}

export function bookingFulfillment(b: PickupPlannerBooking): 'pickup' | 'meeting_point' | null {
  return displayFulfillmentFromPurchase(b.purchase_snapshot);
}

export function confirmedPickupAddress(b: PickupPlannerBooking): string {
  return travelerPickupAddressFromRecord({
    snapshot: b.purchase_snapshot,
    specialRequests: b.special_requests,
  });
}

export function confirmedPickupPoint(b: PickupPlannerBooking): {
  address: string;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  source: 'supplier' | 'customer' | 'none';
} {
  const supplier = parseSupplierPickupPoint(b.special_requests);
  if (supplier) return { ...supplier, source: 'supplier' };
  const snap = isPurchaseSnapshot(b.purchase_snapshot) ? b.purchase_snapshot : null;
  const address = (snap?.travelerPickupAddress || '').trim();
  if (address.length >= 3) {
    return {
      address,
      placeId: (snap?.travelerPickupPlaceId || '').trim() || null,
      lat: typeof snap?.travelerPickupLat === 'number' ? snap.travelerPickupLat : null,
      lng: typeof snap?.travelerPickupLng === 'number' ? snap.travelerPickupLng : null,
      source: 'customer',
    };
  }
  return { address: '', placeId: null, lat: null, lng: null, source: 'none' };
}

function roundCoord(n: number): string {
  return n.toFixed(5);
}

/** Group key from place id or coordinates. Similar names stay separate. */
export function pickupStopKey(input: {
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}): string {
  const placeId = (input.placeId ?? '').trim();
  if (placeId) return `place:${placeId}`;
  if (input.lat != null && input.lng != null && Number.isFinite(input.lat) && Number.isFinite(input.lng)) {
    return `geo:${roundCoord(input.lat)},${roundCoord(input.lng)}`;
  }
  const address = (input.address ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return address.length >= 3 ? `addr:${address}` : 'missing';
}

export function pickupAttention(b: PickupPlannerBooking, area: PickupArea | null): PickupAttention[] {
  if (bookingFulfillment(b) !== 'pickup') return [];
  const flags: PickupAttention[] = [];
  const draft = parsePickupDraft(b.special_requests);
  const confirmed = confirmedPickupPoint(b);
  const address = (draft?.address || confirmed.address || '').trim();
  if (address.length < 3) flags.push('location');
  const time = (draft?.timeHm || b.pickup_time || '').trim();
  if (!time) flags.push('time');
  if (draft) flags.push('draft');
  const lat = draft?.lat ?? confirmed.lat;
  const lng = draft?.lng ?? confirmed.lng;
  if (area && lat != null && lng != null) {
    if (haversineKm(area, { lat, lng }) > area.radiusKm + 0.05) flags.push('outside');
  }
  return flags;
}

export function operationalPickupTimeHm(b: PickupPlannerBooking): string | null {
  const draft = parsePickupDraft(b.special_requests);
  if (draft?.timeHm) return draft.timeHm;
  const raw = (b.pickup_time ?? '').trim();
  if (!raw) return null;
  return raw.slice(0, 5);
}

export function stopSortMinutes(hm: string | null): number {
  if (!hm || !/^\d{2}:\d{2}$/.test(hm)) return 24 * 60 + 1;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function draftDiffersFromConfirmed(b: PickupPlannerBooking, draft: PickupDraftRecord): boolean {
  const confirmed = confirmedPickupPoint(b);
  const time = (b.pickup_time ?? '').slice(0, 5);
  if ((draft.timeHm ?? '') !== time && (draft.timeHm || time)) return true;
  if ((draft.address ?? '') !== confirmed.address) return true;
  if ((draft.instructions ?? '') !== '') return true;
  return false;
}
