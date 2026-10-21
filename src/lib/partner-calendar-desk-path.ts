/**
 * Partner calendar desk paths: Tours → /partner/availability; Stays → /partner/stay-calendar.
 */

import { PARTNER_APP_BASE } from './partnerPortalPaths';
import { inventoryFamilyFromListing, type InventoryListingSlice } from './inventory';

export const PARTNER_TOUR_AVAILABILITY_PATH = `${PARTNER_APP_BASE}/availability`;
export const PARTNER_STAY_CALENDAR_PATH = `${PARTNER_APP_BASE}/stay-calendar`;

export function listingIsStayForCalendarDesk(listing: InventoryListingSlice): boolean {
  return inventoryFamilyFromListing(listing) === 'stay';
}

/** Tour / activity listings eligible for Departures & Availability. */
export function filterTourAvailabilityListings<T extends InventoryListingSlice>(listings: T[]): T[] {
  return listings.filter((l) => !listingIsStayForCalendarDesk(l));
}

export function partnerCalendarDeskPath(params: {
  isStay: boolean;
  listingId?: string | null;
  from?: string | null;
  to?: string | null;
  view?: string | null;
}): string {
  const base = params.isStay ? PARTNER_STAY_CALENDAR_PATH : PARTNER_TOUR_AVAILABILITY_PATH;
  const q = new URLSearchParams();
  const listingId = String(params.listingId ?? '').trim();
  if (listingId) q.set('listing', listingId);
  const from = String(params.from ?? '').trim();
  const to = String(params.to ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) q.set('from', from);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) q.set('to', to);
  const view = String(params.view ?? '').trim();
  if (view === 'week' || view === 'month') q.set('view', view);
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
}
