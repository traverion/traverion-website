/**
 * Partner Bookings arrival display — fulfillment-aware meeting/pickup copy.
 * Never surfaces marketing optionInfo / inclusions as a pickup address.
 */

import {
  parseBookingMeetingPointOverride,
  parseBookingPickupInstructionsOverride,
} from './booking-notes';
import { travelerPickupAddressFromRecord } from './pickup-area';
import { resolvePartnerPickupCopy } from './pickup-completeness';
import {
  displayFulfillmentFromPurchase,
  displayIncludesFromPurchase,
  isPurchaseSnapshot,
  type PurchaseFulfillment,
} from './purchase-snapshot';

export type PartnerArrivalRail =
  | 'pickup'
  | 'meeting_point'
  | 'fixed_pickup'
  | 'location_needed';

export type PartnerArrivalDisplay = {
  fulfillment: PurchaseFulfillment | null;
  rail: PartnerArrivalRail | null;
  railLabel: string | null;
  /** Section heading for expanded / detail views */
  sectionLabel: string;
  place: string | null;
  instructions: string | null;
  needsLocation: boolean;
};

type BookingOptionLite = {
  id: string;
  pickupPlace?: string;
  optionInfo?: string;
  travelerStartInstructions?: string;
  fulfillment?: 'pickup' | 'meeting_point' | null;
};

function liveOptionFulfillment(
  bookingOptionId: string | null | undefined,
  bookingOptions: BookingOptionLite[] | null | undefined
): PurchaseFulfillment | null {
  const oid = (bookingOptionId ?? '').trim();
  if (!oid || !bookingOptions?.length) return null;
  const opt = bookingOptions.find((o) => o.id === oid);
  if (opt?.fulfillment === 'pickup' || opt?.fulfillment === 'meeting_point') return opt.fulfillment;
  return null;
}

function looksLikeInclusionLeak(instructions: string, includes: string[]): boolean {
  const text = instructions.trim().toLowerCase();
  if (!text) return false;
  for (const item of includes) {
    const inc = item.trim().toLowerCase();
    if (!inc) continue;
    if (text === inc) return true;
    if (inc.length >= 8 && text.includes(inc)) return true;
    if (text.length >= 8 && inc.includes(text)) return true;
  }
  return false;
}

function sanitizeInstructions(params: {
  raw: string;
  fulfillment: PurchaseFulfillment | null;
  purchaseSnapshot?: unknown;
  bookingOptionId?: string | null;
  bookingOptions?: BookingOptionLite[] | null;
}): string {
  const text = params.raw.trim();
  if (!text) return '';

  const includes = displayIncludesFromPurchase(params.purchaseSnapshot) ?? [];
  if (looksLikeInclusionLeak(text, includes)) return '';

  const oid = (params.bookingOptionId ?? '').trim();
  const opt = oid && params.bookingOptions ? params.bookingOptions.find((o) => o.id === oid) : null;
  const optionInfo = (opt?.optionInfo ?? '').trim();
  if (optionInfo && text.toLowerCase() === optionInfo.toLowerCase()) return '';

  // Meeting-point bookings: drop marketing-like blobs that were frozen from optionInfo.
  if (params.fulfillment === 'meeting_point') {
    const dedicated = (opt?.travelerStartInstructions ?? '').trim();
    if (dedicated && text.toLowerCase() === dedicated.toLowerCase()) return text;
    if (text.length > 180 && /juice|cookie|include|you'll|you will|highlight/i.test(text)) {
      return '';
    }
  }

  return text;
}

/**
 * Resolve what the supplier should see for meeting / pickup on a booking.
 */
export function resolvePartnerArrivalDisplay(params: {
  purchaseSnapshot?: unknown;
  bookingOptionId?: string | null;
  specialRequests?: string | null;
  listingMeetingPoint?: string | null;
  listingPickupInstructions?: string | null;
  bookingOptions?: BookingOptionLite[] | null;
  pickupTimeHm?: string | null;
}): PartnerArrivalDisplay {
  const fulfillment =
    displayFulfillmentFromPurchase(params.purchaseSnapshot) ||
    liveOptionFulfillment(params.bookingOptionId, params.bookingOptions);

  const copy = resolvePartnerPickupCopy({
    purchaseSnapshot: params.purchaseSnapshot,
    bookingOptionId: params.bookingOptionId,
    specialRequests: params.specialRequests,
    listingMeetingPoint: params.listingMeetingPoint,
    listingPickupInstructions: params.listingPickupInstructions,
    bookingOptions: isPurchaseSnapshot(params.purchaseSnapshot) ? null : params.bookingOptions,
  });

  const noteMeeting = parseBookingMeetingPointOverride(params.specialRequests);
  const noteInstructions = parseBookingPickupInstructionsOverride(params.specialRequests);

  const travelerPlace = travelerPickupAddressFromRecord({
    snapshot: params.purchaseSnapshot,
    specialRequests: params.specialRequests,
  }).trim();

  const meetingPlace = (noteMeeting || copy.meetingPoint || '').trim() || null;
  let instructions = (noteInstructions || copy.pickupInstructions || '').trim();
  instructions = sanitizeInstructions({
    raw: instructions,
    fulfillment,
    purchaseSnapshot: params.purchaseSnapshot,
    bookingOptionId: params.bookingOptionId,
    bookingOptions: params.bookingOptions,
  });

  if (fulfillment === 'meeting_point') {
    const place = meetingPlace;
    const needsLocation = !place;
    return {
      fulfillment,
      rail: needsLocation ? 'location_needed' : 'meeting_point',
      railLabel: needsLocation ? 'Location needed' : 'Meeting point',
      sectionLabel: 'Meeting point',
      place,
      instructions: instructions || null,
      needsLocation,
    };
  }

  if (fulfillment === 'pickup') {
    if (travelerPlace) {
      return {
        fulfillment,
        rail: 'pickup',
        railLabel: 'Pickup',
        sectionLabel: 'Accommodation pickup',
        place: travelerPlace,
        instructions: instructions || null,
        needsLocation: false,
      };
    }
    // Supplier fixed pickup point (no guest accommodation address).
    if (meetingPlace) {
      return {
        fulfillment,
        rail: 'fixed_pickup',
        railLabel: 'Fixed pickup',
        sectionLabel: 'Fixed pickup',
        place: meetingPlace,
        instructions: instructions || null,
        needsLocation: false,
      };
    }
    return {
      fulfillment,
      rail: 'location_needed',
      railLabel: 'Location needed',
      sectionLabel: 'Accommodation pickup',
      place: null,
      instructions: instructions || null,
      needsLocation: true,
    };
  }

  // Unknown fulfillment — best-effort from available places.
  if (travelerPlace) {
    return {
      fulfillment: null,
      rail: 'pickup',
      railLabel: 'Pickup',
      sectionLabel: 'Pickup',
      place: travelerPlace,
      instructions: instructions || null,
      needsLocation: false,
    };
  }
  if (meetingPlace) {
    return {
      fulfillment: null,
      rail: 'meeting_point',
      railLabel: 'Meeting point',
      sectionLabel: 'Meeting point',
      place: meetingPlace,
      instructions: instructions || null,
      needsLocation: false,
    };
  }
  if (instructions) {
    return {
      fulfillment: null,
      rail: 'location_needed',
      railLabel: 'Location needed',
      sectionLabel: 'Pickup / Meeting',
      place: null,
      instructions,
      needsLocation: true,
    };
  }
  return {
    fulfillment: null,
    rail: null,
    railLabel: null,
    sectionLabel: 'Pickup / Meeting',
    place: null,
    instructions: null,
    needsLocation: false,
  };
}

export function formatCommissionPercentLabel(commissionBps: number): string {
  const pct = commissionBps / 100;
  if (!Number.isFinite(pct) || pct < 0) return '';
  const rounded = Math.round(pct * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded}%`;
}
