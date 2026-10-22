import { parsePickupDraft, parseSupplierPickupPoint, type PickupDraftRecord } from './booking-notes';
import { haversineKm, travelerPickupAddressFromRecord, type PickupArea } from './pickup-area';
import {
  displayFulfillmentFromPurchase,
  displayStartTimeFromPurchase,
  isPurchaseSnapshot,
} from './purchase-snapshot';

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

function normalizeClockHm(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const hm = s.slice(0, 5);
  return /^\d{2}:\d{2}$/.test(hm) ? hm : '';
}

export function departureStartHm(b: PickupPlannerBooking): string {
  return normalizeClockHm(displayStartTimeFromPurchase(b.purchase_snapshot, b.start_time));
}

/**
 * Configured meeting/departure clock from the purchased schedule (or live start when
 * no snapshot). Meeting-point tours use this as the default meeting time.
 */
export function configuredMeetingTimeHm(b: PickupPlannerBooking): string | null {
  const hm = departureStartHm(b);
  return hm || null;
}

/**
 * Day-of meeting time: supplier override (draft or confirmed pickup_time), else the
 * configured schedule meeting/departure time.
 */
export function effectiveMeetingTimeHm(b: PickupPlannerBooking): string | null {
  const override = operationalPickupTimeHm(b);
  if (override && /^\d{2}:\d{2}$/.test(override)) return override;
  return configuredMeetingTimeHm(b);
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

/** Long date heading for planner day groups — e.g. Wednesday, 21 October 2026 */
export function formatPickupPlannerDateHeading(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return 'Date not set';
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export const PICKUP_PLANNER_DAYS_PER_PAGE = 10;

export type PickupOpsStatus =
  | 'pickup_time_needed'
  | 'ready_to_notify'
  | 'guest_notified'
  | 'meeting_time_needed'
  | 'meeting_confirmed'
  | 'meeting_updated'
  | 'guests_notified';

/** Single-booking operational readiness for planner cards and itinerary rows. */
export function bookingPickupOpsStatus(b: PickupPlannerBooking): PickupOpsStatus | null {
  const fulfillment = bookingFulfillment(b);
  const draft = parsePickupDraft(b.special_requests);
  const confirmedHm = (b.pickup_time ?? '').trim().slice(0, 5);
  const draftHm = (draft?.timeHm ?? '').trim();
  const hasConfirmed = /^\d{2}:\d{2}$/.test(confirmedHm);
  const hasDraftTime = /^\d{2}:\d{2}$/.test(draftHm);

  if (fulfillment === 'meeting_point') {
    const hasConfigured = Boolean(configuredMeetingTimeHm(b));
    // Schedule meeting/departure time counts — do not warn merely because there is
    // no separately assigned booking pickup_time override.
    if (!hasConfirmed && !hasDraftTime && !hasConfigured) return 'meeting_time_needed';
    if (draft) return 'meeting_updated';
    if (hasConfirmed) return 'guests_notified';
    return 'meeting_confirmed';
  }

  if (fulfillment !== 'pickup') return null;
  if (!hasConfirmed && !hasDraftTime) return 'pickup_time_needed';
  if (draft) return 'ready_to_notify';
  if (hasConfirmed) return 'guest_notified';
  return 'pickup_time_needed';
}

export function pickupOpsStatusLabel(status: PickupOpsStatus): string {
  switch (status) {
    case 'pickup_time_needed':
      return 'Pickup time needed';
    case 'ready_to_notify':
      return 'Ready to notify';
    case 'guest_notified':
      return 'Guest notified';
    case 'meeting_time_needed':
      return 'Meeting time needed';
    case 'meeting_confirmed':
      return 'Meeting time confirmed';
    case 'meeting_updated':
      return 'Meeting time updated';
    case 'guests_notified':
      return 'Guests notified';
  }
}

/** True when the supplier must act (missing time / unsent draft). */
export function pickupOpsNeedsAction(status: PickupOpsStatus | null): boolean {
  return (
    status === 'pickup_time_needed' ||
    status === 'ready_to_notify' ||
    status === 'meeting_time_needed' ||
    status === 'meeting_updated'
  );
}

export type DepartureGroup<T extends PickupPlannerBooking = PickupPlannerBooking> = {
  id: string;
  date: string;
  rows: T[];
};

/** Aggregate worst actionable status for a departure card. */
export function departureOpsStatus<T extends PickupPlannerBooking>(rows: T[]): PickupOpsStatus | null {
  let worst: PickupOpsStatus | null = null;
  const rank = (s: PickupOpsStatus | null): number => {
    if (s === 'pickup_time_needed' || s === 'meeting_time_needed') return 4;
    if (s === 'ready_to_notify' || s === 'meeting_updated') return 3;
    if (s === 'meeting_confirmed') return 2;
    if (s === 'guest_notified' || s === 'guests_notified') return 1;
    return 0;
  };
  for (const row of rows) {
    const s = bookingPickupOpsStatus(row);
    if (rank(s) > rank(worst)) worst = s;
  }
  return worst;
}

export function groupDeparturesByDateKey<T extends PickupPlannerBooking>(
  groups: DepartureGroup<T>[]
): { date: string; heading: string; departures: DepartureGroup<T>[] }[] {
  const map = new Map<string, DepartureGroup<T>[]>();
  for (const g of groups) {
    const date = (g.date || '').trim() || 'unknown';
    const list = map.get(date) ?? [];
    list.push(g);
    map.set(date, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, departures]) => ({
      date,
      heading: date === 'unknown' ? 'Date not set' : formatPickupPlannerDateHeading(date),
      departures,
    }));
}

export function paginateDayGroups<T>(
  dayGroups: T[],
  page: number,
  pageSize: number = PICKUP_PLANNER_DAYS_PER_PAGE
): { page: number; pageCount: number; slice: T[] } {
  const pageCount = Math.max(1, Math.ceil(dayGroups.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return { page: safePage, pageCount, slice: dayGroups.slice(start, start + pageSize) };
}
