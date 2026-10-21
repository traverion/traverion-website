/**
 * Warm Partner Bookings/Reservations desk data on View booking intent so the
 * details page does not animate in as an empty white pane.
 */

import { fetchBookingsForSupplier, type BookingRow } from '../data/supabase-bookings';
import { fetchMyListings } from '../data/supabase-listings';
import { fetchBookingCommercialSnapshot, type BookingCommercialSnapshotRow } from '../data/supabase-earnings';
import type { TourPackage } from '../types/tour';

type DeskPayload = {
  bookings: BookingRow[];
  listings: TourPackage[];
};

type DeskEntry = {
  uid: string;
  at: number;
  promise: Promise<DeskPayload>;
};

const DESK_TTL_MS = 20_000;
let deskEntry: DeskEntry | null = null;

const commercialCache = new Map<
  string,
  { at: number; promise: Promise<BookingCommercialSnapshotRow | null> }
>();

export function prefetchPartnerBookingsDesk(uid: string): Promise<DeskPayload> {
  const now = Date.now();
  if (deskEntry && deskEntry.uid === uid && now - deskEntry.at < DESK_TTL_MS) {
    return deskEntry.promise;
  }
  const promise = Promise.all([fetchBookingsForSupplier(uid), fetchMyListings(uid)]).then(
    ([bookings, listings]) => ({ bookings, listings })
  );
  deskEntry = { uid, at: now, promise };
  promise.catch(() => {
    if (deskEntry?.promise === promise) deskEntry = null;
  });
  return promise;
}

/** Reuse an in-flight / fresh prefetch, or null to fall back to a normal fetch. */
export function takePartnerBookingsDeskPrefetch(uid: string): Promise<DeskPayload> | null {
  const now = Date.now();
  if (deskEntry && deskEntry.uid === uid && now - deskEntry.at < DESK_TTL_MS) {
    return deskEntry.promise;
  }
  return null;
}

export function prefetchPartnerBookingCommercial(bookingId: string): void {
  const id = bookingId.trim();
  if (!id) return;
  const now = Date.now();
  const existing = commercialCache.get(id);
  if (existing && now - existing.at < DESK_TTL_MS) return;
  const promise = fetchBookingCommercialSnapshot(id);
  commercialCache.set(id, { at: now, promise });
  promise.catch(() => {
    const cur = commercialCache.get(id);
    if (cur?.promise === promise) commercialCache.delete(id);
  });
}

export function takePrefetchedPartnerBookingCommercial(
  bookingId: string
): Promise<BookingCommercialSnapshotRow | null> | null {
  const id = bookingId.trim();
  if (!id) return null;
  const existing = commercialCache.get(id);
  if (!existing) return null;
  if (Date.now() - existing.at >= DESK_TTL_MS) {
    commercialCache.delete(id);
    return null;
  }
  return existing.promise;
}
