/**
 * Phase 3: list real same-option tour departures for supplier-cancel reschedule.
 * Final capacity is asserted server-side by reschedule_supplier_cancelled_booking.
 */
import { parseListingExtras } from '../types/listingExtras';
import {
  departureTimesForScheduleOnDate,
  listingOptionReadySchedules,
} from '../lib/listing-option-schedules';
import { localYmd } from '../lib/local-ymd';
import { formatBookingDateDisplay } from '../lib/booking-flow';
import {
  fetchAvailabilityByListingId,
  fetchPublishedTourPaidGuests,
  fetchPublishedTourPaidGuestsBySlot,
  tourPaidSlotKey,
} from './supabase-availability';
import { tourPublicAvailabilityRemaining } from '../lib/tour-check-availability';
import { listingTourCapacityFromOptions, capacitySpotsFromBookingOptions } from '../lib/availability-ops';
import type { BookingRow } from './supabase-bookings';
import type { PurchaseSnapshot } from '../lib/purchase-snapshot';

export type RescheduleDepartureOption = {
  date: string;
  startTimeHm: string;
  remaining: number;
  label: string;
};

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function normalizeHm(raw: string | null | undefined): string {
  const m = String(raw ?? '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function bookingAwaitingSupplierCancelChoice(b: BookingRow): boolean {
  return (
    String(b.status ?? '')
      .trim()
      .toLowerCase() === 'cancelled' &&
    String(b.cancellation_resolution ?? '')
      .trim()
      .toLowerCase() === 'pending_customer_choice' &&
    (b.cancellation_origin == null ||
      String(b.cancellation_origin).trim().toLowerCase() === 'supplier')
  );
}

export async function listTourRescheduleDepartures(params: {
  booking: BookingRow;
  listingExtras: unknown;
  horizonDays?: number;
}): Promise<RescheduleDepartureOption[]> {
  const { booking, listingExtras } = params;
  const guests = Math.max(1, Math.floor(Number(booking.guests) || 1));
  const horizon = Math.max(7, Math.min(params.horizonDays ?? 45, 90));
  const extras = parseListingExtras(listingExtras);
  const options = Array.isArray(extras.bookingOptions) ? extras.bookingOptions : [];
  const snap = booking.purchase_snapshot as PurchaseSnapshot | null | undefined;
  const optionId = String(booking.booking_option_id ?? snap?.optionId ?? '').trim();
  const option =
    (optionId ? options.find((o) => o && String(o.id) === optionId) : null) ?? options[0] ?? null;
  if (!option) return [];

  const schedules = listingOptionReadySchedules(option);
  if (schedules.length === 0) return [];

  const today = localYmd();
  const toDate = addDaysYmd(today, horizon);
  const cancelledDay = String(booking.booking_date ?? '').slice(0, 10);
  const cancelledHm =
    normalizeHm(snap?.cancelReferenceStartHm) ||
    normalizeHm(snap?.startTimeHm) ||
    normalizeHm(booking.start_time);

  const [availability, paidByDay, paidBySlot] = await Promise.all([
    fetchAvailabilityByListingId(booking.listing_id, { fromDate: today, toDate }),
    fetchPublishedTourPaidGuests(booking.listing_id),
    fetchPublishedTourPaidGuestsBySlot(booking.listing_id),
  ]);
  const dayCapByDate = new Map<string, number>();
  for (const row of availability) {
    const day = String(row.available_date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    dayCapByDate.set(day, Number(row.capacity) || 0);
  }

  const fallbackCap = listingTourCapacityFromOptions(capacitySpotsFromBookingOptions([option]));
  const out: RescheduleDepartureOption[] = [];
  const seen = new Set<string>();

  for (let i = 0; i <= horizon; i++) {
    const day = addDaysYmd(today, i);
    if (dayCapByDate.has(day) && (dayCapByDate.get(day) ?? 0) <= 0) continue;

    const times = new Set<string>();
    for (const sched of schedules) {
      for (const t of departureTimesForScheduleOnDate(sched, day, option.startMode)) {
        const hm = normalizeHm(t);
        if (hm) times.add(hm);
      }
    }
    for (const startTimeHm of [...times].sort()) {
      if (day === cancelledDay && startTimeHm === cancelledHm) continue;
      const key = `${day}|${startTimeHm}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const slotCap =
        typeof option.maxSpotsPerSlot === 'number' && option.maxSpotsPerSlot >= 1
          ? Math.floor(option.maxSpotsPerSlot)
          : schedules.reduce((max, s) => {
              const n = typeof s.maxSpotsPerSlot === 'number' ? s.maxSpotsPerSlot : 0;
              return Math.max(max, n);
            }, 0) || null;

      const { available, remaining } = tourPublicAvailabilityRemaining({
        date: day,
        guests,
        dayCapacityOverride: dayCapByDate.has(day) ? (dayCapByDate.get(day) ?? null) : null,
        paidGuestsDay: paidByDay[day] ?? 0,
        fallbackDayCapacity: fallbackCap,
        startTimeHm,
        slotMaxSpots: slotCap && slotCap >= 1 ? slotCap : null,
        paidGuestsSlot: paidBySlot[tourPaidSlotKey(day, startTimeHm)] ?? 0,
      });
      if (!available || remaining < guests) continue;
      out.push({
        date: day,
        startTimeHm,
        remaining,
        label: `${formatBookingDateDisplay(day)} · ${startTimeHm}`,
      });
      if (out.length >= 24) return out;
    }
  }
  return out;
}
