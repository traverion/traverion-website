/**
 * Partner Home Upcoming schedule — expands rentals into separate Collection / Return events.
 * Tour and stay rows stay one booking → one event (existing semantics).
 */

import { bookingOccupiesInventory } from './booking-hold';
import {
  lifecycleReminderAnchorYmd,
  lifecycleRentalReturnYmd,
  resolveLifecycleTimezone,
  addCalendarDaysYmd,
} from './booking-lifecycle-calendar';
import { bookingIsRental, bookingIsStayNight } from './pickup-completeness';
import { parseRentalPurchaseSnapshot } from './rental-booking-domain';
import { stayRangeFromBooking } from './stayOccupancy';
import {
  partnerBookingIsOperatingTrip,
  partnerBookingIsTodaySchedule,
  partnerBookingIsUpcomingSchedule,
  partnerStayTouchesScheduleDay,
  scheduleTodayIsoForBooking,
  type PartnerScheduleBooking,
} from './trip-views';

export type PartnerHomeScheduleEventKind =
  | 'tour'
  | 'stay_check_in'
  | 'stay_check_out'
  | 'stay_occupied'
  | 'rental_collection'
  | 'rental_return';

export type PartnerHomeScheduleEvent<B extends PartnerScheduleBooking = PartnerScheduleBooking> = {
  /** Stable unique key — never duplicate Collection/Return for the same booking+day. */
  key: string;
  booking: B;
  ymd: string;
  kind: PartnerHomeScheduleEventKind;
  /** Experience-local HH:mm when known. */
  timeHm: string | null;
  /** Collection day passed and ops still awaiting_pickup. */
  collectionOverdue: boolean;
};

function rentalOpsStatus(b: PartnerScheduleBooking): string {
  const snap = parseRentalPurchaseSnapshot(b.purchase_snapshot);
  return String(snap?.rentalOpsStatus ?? 'awaiting_pickup').trim().toLowerCase();
}

/** Completed handover — nothing left on the operational schedule. */
export function partnerHomeRentalHandoverComplete(b: PartnerScheduleBooking): boolean {
  if (!bookingIsRental(b)) return false;
  const ops = rentalOpsStatus(b);
  return ops === 'returned' || ops === 'cancelled';
}

export function partnerHomeRentalCollectionOverdue(
  b: PartnerScheduleBooking,
  todayIso: string
): boolean {
  if (!bookingIsRental(b)) return false;
  if (partnerHomeRentalHandoverComplete(b)) return false;
  if (rentalOpsStatus(b) !== 'awaiting_pickup') return false;
  const collection = lifecycleReminderAnchorYmd(b);
  return Boolean(collection && collection < todayIso);
}

function hmFromIsoInTz(iso: string | null | undefined, timeZone: string): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(ms));
    const hour = parts.find((p) => p.type === 'hour')?.value;
    const minute = parts.find((p) => p.type === 'minute')?.value;
    if (!hour || !minute) return null;
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  } catch {
    return null;
  }
}

function rentalEventTimes(b: PartnerScheduleBooking): {
  collectionHm: string | null;
  returnHm: string | null;
} {
  const snap = parseRentalPurchaseSnapshot(b.purchase_snapshot);
  const tz = resolveLifecycleTimezone(b.purchase_snapshot);
  return {
    collectionHm: hmFromIsoInTz(snap?.pickupAt, tz),
    returnHm: hmFromIsoInTz(snap?.returnAt, tz),
  };
}

function sortEvents<B extends PartnerScheduleBooking>(
  a: PartnerHomeScheduleEvent<B>,
  b: PartnerHomeScheduleEvent<B>
): number {
  const byDay = a.ymd.localeCompare(b.ymd);
  if (byDay) return byDay;
  const ta = a.timeHm ?? '99:99';
  const tb = b.timeHm ?? '99:99';
  const byTime = ta.localeCompare(tb);
  if (byTime) return byTime;
  const kindRank = (k: PartnerHomeScheduleEventKind): number => {
    if (k === 'rental_collection') return 0;
    if (k === 'rental_return') return 1;
    if (k === 'stay_check_in') return 0;
    if (k === 'stay_check_out') return 1;
    return 2;
  };
  const byKind = kindRank(a.kind) - kindRank(b.kind);
  if (byKind) return byKind;
  return a.key.localeCompare(b.key);
}

function pushUnique<B extends PartnerScheduleBooking>(
  out: PartnerHomeScheduleEvent<B>[],
  seen: Set<string>,
  event: PartnerHomeScheduleEvent<B>
): void {
  if (seen.has(event.key)) return;
  seen.add(event.key);
  out.push(event);
}

function stayKindForDay(
  checkIn: string,
  checkOut: string,
  dayIso: string
): PartnerHomeScheduleEventKind {
  if (checkIn === dayIso) return 'stay_check_in';
  if (checkOut === dayIso) return 'stay_check_out';
  return 'stay_occupied';
}

/**
 * Today tab: one event per tour/stay touch; separate Collection and Return when both are today.
 * Overdue uncollected rentals get a Collection warning row without hiding today’s Return.
 */
export function partnerHomeScheduleEventsForToday<B extends PartnerScheduleBooking>(
  bookings: B[],
  nowMs: number = Date.now()
): PartnerHomeScheduleEvent<B>[] {
  const out: PartnerHomeScheduleEvent<B>[] = [];
  const seen = new Set<string>();

  for (const b of bookings) {
    if (!partnerBookingIsOperatingTrip(b)) continue;
    if (!bookingOccupiesInventory(b, nowMs)) continue;
    const todayIso = scheduleTodayIsoForBooking(b, nowMs);

    if (bookingIsRental(b)) {
      if (partnerHomeRentalHandoverComplete(b)) continue;
      const collectionYmd = lifecycleReminderAnchorYmd(b);
      const returnYmd = lifecycleRentalReturnYmd(b);
      const { collectionHm, returnHm } = rentalEventTimes(b);
      const ops = rentalOpsStatus(b);
      const overdue = partnerHomeRentalCollectionOverdue(b, todayIso);

      // Overdue collection warning (collection day already passed, still awaiting pickup).
      if (overdue && collectionYmd) {
        pushUnique(out, seen, {
          key: `${b.id}:rental_collection:${collectionYmd}:overdue`,
          booking: b,
          ymd: collectionYmd,
          kind: 'rental_collection',
          timeHm: collectionHm,
          collectionOverdue: true,
        });
      }

      // Scheduled collection today — only while still awaiting pickup (not after collected).
      if (collectionYmd === todayIso && ops === 'awaiting_pickup' && !overdue) {
        pushUnique(out, seen, {
          key: `${b.id}:rental_collection:${collectionYmd}`,
          booking: b,
          ymd: collectionYmd,
          kind: 'rental_collection',
          timeHm: collectionHm,
          collectionOverdue: false,
        });
      }

      // Scheduled return today — keep even when collection is overdue / still awaiting pickup.
      if (returnYmd === todayIso && ops !== 'returned') {
        pushUnique(out, seen, {
          key: `${b.id}:rental_return:${returnYmd}`,
          booking: b,
          ymd: returnYmd,
          kind: 'rental_return',
          timeHm: returnHm,
          collectionOverdue: false,
        });
      }
      continue;
    }

    if (!partnerBookingIsTodaySchedule(b, todayIso, nowMs)) continue;

    if (bookingIsStayNight(b)) {
      const stay = stayRangeFromBooking(b);
      if (!stay || !partnerStayTouchesScheduleDay(stay.checkIn, stay.checkOut, todayIso)) continue;
      const kind = stayKindForDay(stay.checkIn, stay.checkOut, todayIso);
      pushUnique(out, seen, {
        key: `${b.id}:${kind}:${todayIso}`,
        booking: b,
        ymd: todayIso,
        kind,
        timeHm: null,
        collectionOverdue: false,
      });
      continue;
    }

    const date = (b.booking_date ?? '').trim();
    if (date !== todayIso) continue;
    pushUnique(out, seen, {
      key: `${b.id}:tour:${todayIso}`,
      booking: b,
      ymd: todayIso,
      kind: 'tour',
      timeHm: null,
      collectionOverdue: false,
    });
  }

  return out.sort(sortEvents);
}

/**
 * Next 7 days tab: days strictly after experience-local today through +7.
 * Rentals emit Collection and Return as separate events when each falls in the window.
 * Overdue uncollected rentals that still have a return in-window also surface Collection overdue.
 */
export function partnerHomeScheduleEventsForNext7Days<B extends PartnerScheduleBooking>(
  bookings: B[],
  nowMs: number = Date.now(),
  limit = 12
): PartnerHomeScheduleEvent<B>[] {
  const out: PartnerHomeScheduleEvent<B>[] = [];
  const seen = new Set<string>();

  for (const b of bookings) {
    if (!partnerBookingIsOperatingTrip(b)) continue;
    if (!bookingOccupiesInventory(b, nowMs)) continue;
    const todayIso = scheduleTodayIsoForBooking(b, nowMs);
    const endYmd = addCalendarDaysYmd(todayIso, 7);
    if (!endYmd) continue;

    if (bookingIsRental(b)) {
      if (partnerHomeRentalHandoverComplete(b)) continue;
      const collectionYmd = lifecycleReminderAnchorYmd(b);
      const returnYmd = lifecycleRentalReturnYmd(b);
      const { collectionHm, returnHm } = rentalEventTimes(b);
      const ops = rentalOpsStatus(b);
      const overdue = partnerHomeRentalCollectionOverdue(b, todayIso);

      const collectionInWindow =
        Boolean(collectionYmd) &&
        collectionYmd! > todayIso &&
        collectionYmd! <= endYmd &&
        ops === 'awaiting_pickup';
      const returnInWindow =
        Boolean(returnYmd) && returnYmd! > todayIso && returnYmd! <= endYmd && ops !== 'returned';

      // Overdue collection stays visible when the return (or future collection) is in the week strip.
      if (overdue && collectionYmd && (returnInWindow || collectionInWindow)) {
        pushUnique(out, seen, {
          key: `${b.id}:rental_collection:${collectionYmd}:overdue`,
          booking: b,
          ymd: collectionYmd,
          kind: 'rental_collection',
          timeHm: collectionHm,
          collectionOverdue: true,
        });
      }

      if (collectionInWindow && collectionYmd) {
        pushUnique(out, seen, {
          key: `${b.id}:rental_collection:${collectionYmd}`,
          booking: b,
          ymd: collectionYmd,
          kind: 'rental_collection',
          timeHm: collectionHm,
          collectionOverdue: false,
        });
      }

      if (returnInWindow && returnYmd) {
        pushUnique(out, seen, {
          key: `${b.id}:rental_return:${returnYmd}`,
          booking: b,
          ymd: returnYmd,
          kind: 'rental_return',
          timeHm: returnHm,
          collectionOverdue: false,
        });
      }
      continue;
    }

    if (!partnerBookingIsUpcomingSchedule(b, todayIso, nowMs)) continue;

    if (bookingIsStayNight(b)) {
      const stay = stayRangeFromBooking(b);
      if (!stay || !(stay.checkIn > todayIso && stay.checkIn <= endYmd)) continue;
      pushUnique(out, seen, {
        key: `${b.id}:stay_check_in:${stay.checkIn}`,
        booking: b,
        ymd: stay.checkIn,
        kind: 'stay_check_in',
        timeHm: null,
        collectionOverdue: false,
      });
      continue;
    }

    const date = (b.booking_date ?? '').trim();
    if (!(date > todayIso && date <= endYmd)) continue;
    pushUnique(out, seen, {
      key: `${b.id}:tour:${date}`,
      booking: b,
      ymd: date,
      kind: 'tour',
      timeHm: null,
      collectionOverdue: false,
    });
  }

  return out.sort(sortEvents).slice(0, Math.max(0, limit));
}

export function partnerHomeScheduleEventKindLabel(
  kind: PartnerHomeScheduleEventKind
): string {
  switch (kind) {
    case 'rental_collection':
      return 'Collection';
    case 'rental_return':
      return 'Return';
    case 'stay_check_in':
      return 'Check-in';
    case 'stay_check_out':
      return 'Check-out';
    case 'stay_occupied':
      return 'Stay';
    default:
      return 'Tour';
  }
}
