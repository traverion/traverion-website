/**
 * Guest-facing free-cancellation deadline for stays.
 * Only formats a clock time when check-in HH:MM is known — never invents midnight.
 */
import { travelerSelfCancelDeadlineMs } from './cancellation-policy';
import { resolveDepartureTimezone } from './tour-departure-cutoff';
import { listingShowsFreeCancellation } from './listingTruth';
import {
  freeCancelHoursForStayPreset,
  isStayCancellationPreset,
} from './stay-cancellation-preset';
import { normalizeStaySeasons } from './stay-season-quote';
import { parseListingExtras, type StayDetails } from '../types/listingExtras';
import type { TourPackage } from '../types/tour';

const HM = /^\d{2}:\d{2}$/;

export function stayCheckInHmForDate(
  stay: StayDetails | null | undefined,
  checkIn: string
): string | null {
  if (!checkIn || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return null;
  const seasons = normalizeStaySeasons(stay?.seasons);
  const hit = seasons.find(
    (row) =>
      row.enabled !== false &&
      checkIn >= row.start &&
      checkIn <= row.end &&
      typeof row.checkIn === 'string' &&
      HM.test(row.checkIn.trim().slice(0, 5))
  );
  if (hit?.checkIn) return hit.checkIn.trim().slice(0, 5);
  const base = (stay?.checkInTime ?? '').trim().slice(0, 5);
  return HM.test(base) ? base : null;
}

function hoursLabel(hours: number): string {
  if (hours === 168) return '7 days';
  if (hours === 48) return '48 hours';
  if (hours === 24) return '24 hours';
  return `${hours} hours`;
}

/** Exact deadline label when free-cancel policy applies and check-in time is known; else policy rule only. */
export function stayFreeCancelDeadlineCopy(params: {
  stay: Pick<TourPackage, 'tags' | 'cancellationPolicy' | 'listingExtras'>;
  checkIn: string;
  checkInHm: string | null;
  departureTimezone?: string | null;
  /** Override when known (e.g. from purchase snapshot). */
  freeCancelHours?: number | null;
  cancellationPreset?: string | null;
}): string | null {
  const explicitPreset = isStayCancellationPreset(params.cancellationPreset)
    ? params.cancellationPreset
    : null;
  const extrasPreset = params.stay.listingExtras
    ? parseListingExtras(params.stay.listingExtras).cancellationPreset
    : undefined;
  const preset =
    explicitPreset ??
    (isStayCancellationPreset(extrasPreset) ? extrasPreset : null);

  let hours: number | null;
  if (params.freeCancelHours !== undefined) {
    hours = params.freeCancelHours;
  } else if (preset) {
    hours = freeCancelHoursForStayPreset(preset);
  } else if (listingShowsFreeCancellation(params.stay)) {
    hours = 24;
  } else {
    return null;
  }
  if (hours == null || hours <= 0) return null;

  if (!params.checkInHm || !HM.test(params.checkInHm)) {
    return `Free cancellation up to ${hoursLabel(hours)} before check-in (property local time).`;
  }
  const tz = resolveDepartureTimezone(params.departureTimezone);
  const deadline = travelerSelfCancelDeadlineMs({
    bookingDate: params.checkIn,
    startTimeHm: params.checkInHm,
    departureTimezone: tz,
    freeCancelHours: hours,
  });
  if (deadline == null) {
    return `Free cancellation up to ${hoursLabel(hours)} before check-in (property local time).`;
  }
  const when = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(deadline));
  return `Free cancellation until ${when} (property local time).`;
}
