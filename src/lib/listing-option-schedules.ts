import { listingShapeHasBookablePrice, optionHeadlineUnitPrice } from './price-categories';
import type { ListingBookingOption, ListingOptionSchedule } from '../types/listingExtras';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function newListingOptionScheduleId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `sch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function listingLocalDateKey(iso: string): string {
  return iso.trim().slice(0, 10);
}

function parseIsoDateUtc(iso: string): Date | null {
  const key = listingLocalDateKey(iso);
  if (!ISO_DATE.test(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Monday=0 … Sunday=6. Matches option.weekdays and quoteBooking. */
export function scheduleWeekdayIndexMondayFirst(isoDate: string): number | null {
  const key = listingLocalDateKey(isoDate);
  if (!ISO_DATE.test(key)) return null;
  const d = parseIsoDateUtc(key);
  if (!d) return null;
  return (d.getUTCDay() + 6) % 7;
}

function rangeStartKey(iso: string): string {
  const key = listingLocalDateKey(iso);
  return ISO_DATE.test(key) ? key : '0001-01-01';
}

function rangeEndKey(iso: string): string {
  const key = listingLocalDateKey(iso);
  return ISO_DATE.test(key) ? key : '9999-12-31';
}

function dateRangesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return rangeStartKey(aFrom) <= rangeEndKey(bTo) && rangeStartKey(bFrom) <= rangeEndKey(aTo);
}

function weekdayOverlap(a: boolean[], b: boolean[]): boolean {
  for (let i = 0; i < 7; i++) {
    if (a[i] && b[i]) return true;
  }
  return false;
}

function isoDaysInclusive(from: string, to: string): string[] {
  const a = parseIsoDateUtc(from);
  const b = parseIsoDateUtc(to);
  if (!a || !b || a.getTime() > b.getTime()) return [];
  const out: string[] = [];
  const cur = new Date(a.getTime());
  while (cur.getTime() <= b.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
    if (out.length > 800) break;
  }
  return out;
}

export function scheduleHeadlineName(s: ListingOptionSchedule, index: number): string {
  const named = s.name.trim();
  if (named) return named;
  const from = listingLocalDateKey(s.availabilityDateFrom);
  if (from) {
    const d = parseIsoDateUtc(from);
    if (d) {
      return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    }
  }
  return `Schedule ${index + 1}`;
}

export function scheduleAppliesOnDate(s: ListingOptionSchedule, localDateIso: string): boolean {
  const key = listingLocalDateKey(localDateIso);
  if (!ISO_DATE.test(key)) return false;
  const from = listingLocalDateKey(s.availabilityDateFrom);
  const to = listingLocalDateKey(s.availabilityDateTo);
  if (from && key < from) return false;
  if (to && key > to) return false;
  const wd = scheduleWeekdayIndexMondayFirst(key);
  if (wd == null) return false;
  if (Array.isArray(s.weekdays) && s.weekdays.length >= 7 && !s.weekdays[wd]) return false;
  return true;
}

export function listingOptionHasSchedules(option: ListingBookingOption): boolean {
  return Array.isArray(option.schedules) && option.schedules.length > 0;
}

export function isImplicitScheduleId(id: string): boolean {
  return id.endsWith('-implicit');
}

/** Legacy options store one season on the option row itself. */
export function hydrateImplicitSchedule(option: ListingBookingOption): ListingOptionSchedule {
  const out: ListingOptionSchedule = {
    id: `${option.id}-implicit`,
    name: option.name.trim() || 'Season',
    availabilityDateFrom: option.availabilityDateFrom,
    availabilityDateTo: option.availabilityDateTo,
    weekdays: [...option.weekdays],
    startTime: option.startTime,
    pricingMode: option.pricingMode,
    priceUsd: option.priceUsd,
    priceCategories: option.priceCategories,
    isPrivate: option.isPrivate,
    privatePricing: option.privatePricing,
    privateGroupPriceUsd: option.privateGroupPriceUsd,
    minPersons: option.minPersons,
    maxPersons: option.maxPersons,
    maxSpotsPerSlot: option.maxSpotsPerSlot,
    status: listingShapeHasBookablePrice(option) ? 'ready' : 'draft',
  };
  if (option.weekdayStartTimes) {
    out.weekdayStartTimes = option.weekdayStartTimes.map((day) => [...day]);
  }
  return out;
}

export function listingOptionSchedules(option: ListingBookingOption): ListingOptionSchedule[] {
  if (listingOptionHasSchedules(option)) return option.schedules ?? [];
  const implicit = hydrateImplicitSchedule(option);
  if (
    !implicit.availabilityDateFrom.trim() &&
    !implicit.availabilityDateTo.trim() &&
    !implicit.startTime.trim() &&
    !listingShapeHasBookablePrice(option)
  ) {
    return [];
  }
  return [implicit];
}

/** Hard ceiling so typos like 99999 cannot look “valid” as a tour departure size. */
export const LISTING_CAPACITY_MAX = 200;

/** Soft product limit for schedules per option in the supplier editor. */
export const LISTING_OPTION_SCHEDULES_MAX = 5;

/** Normalize/storage ceiling — never silently drop legacy rows above the soft product limit. */
export const LISTING_OPTION_SCHEDULES_HARD_CEILING = 24;

export function scheduleCapacityValid(
  s: Pick<ListingOptionSchedule, 'minPersons' | 'maxPersons' | 'maxSpotsPerSlot' | 'maxGroupsPerSlot'>,
  opts?: { requireGroups?: boolean }
): boolean {
  const base =
    s.minPersons >= 1 &&
    s.maxPersons >= s.minPersons &&
    s.maxPersons <= LISTING_CAPACITY_MAX &&
    s.maxSpotsPerSlot >= 1 &&
    s.maxSpotsPerSlot <= LISTING_CAPACITY_MAX &&
    // Party/group size cannot exceed the departure slot (inventory is guest-based).
    s.maxPersons <= s.maxSpotsPerSlot;
  if (!base) return false;
  if (!opts?.requireGroups) return true;
  const groups =
    typeof s.maxGroupsPerSlot === 'number' && Number.isFinite(s.maxGroupsPerSlot)
      ? Math.floor(s.maxGroupsPerSlot)
      : 0;
  if (groups < 1 || groups > LISTING_CAPACITY_MAX) return false;
  return groups * s.maxPersons <= s.maxSpotsPerSlot;
}

/**
 * How many whole groups of `maxGroupSize` fit in a guest-based slot capacity.
 * Inventory always counts travelers; this is display/planning only.
 */
export function maxWholeGroupsForSlot(spotsPerSlot: number, maxGroupSize: number): number {
  const spots = Math.floor(spotsPerSlot);
  const size = Math.floor(maxGroupSize);
  if (spots < 1 || size < 1) return 0;
  return Math.floor(spots / size);
}

/** Traveler-bookable (not a draft). Start date optional on legacy implicit rows. */
export function scheduleIsBookable(
  s: ListingOptionSchedule,
  opts?: { startMode?: ListingBookingOption['startMode'] }
): boolean {
  if (s.status === 'draft') return false;
  if (!listingShapeHasBookablePrice(s)) return false;
  if (!s.weekdays.some(Boolean)) return false;
  const from = listingLocalDateKey(s.availabilityDateFrom);
  const to = listingLocalDateKey(s.availabilityDateTo);
  if (to && !from) return false;
  if (from && to && from > to) return false;
  // Phase 1291: require from for all schedules; fixed mode needs ≥1 departure per enabled day.
  if (!from) return false;
  if (!scheduleHasFixedDepartures(s, opts?.startMode)) return false;
  if (!scheduleCapacityValid(s)) return false;
  return true;
}

export function scheduleWizardIsComplete(
  s: ListingOptionSchedule,
  opts?: { startMode?: ListingBookingOption['startMode'] }
): boolean {
  // Customer-facing schedule label — required for ready seasons (Phase 3).
  if (s.name.trim().length < 3) return false;
  const from = listingLocalDateKey(s.availabilityDateFrom);
  const to = listingLocalDateKey(s.availabilityDateTo);
  if (!from) return false;
  if (to && from > to) return false;
  if (!s.weekdays.some(Boolean)) return false;
  if (!scheduleHasFixedDepartures(s, opts?.startMode)) return false;
  if (!listingShapeHasBookablePrice(s)) return false;
  return scheduleCapacityValid(s);
}

export function listingOptionReadySchedules(option: ListingBookingOption): ListingOptionSchedule[] {
  return listingOptionSchedules(option).filter((s) =>
    scheduleIsBookable(s, { startMode: option.startMode })
  );
}

export type ScheduleOverlapConflict = {
  otherId: string;
  otherName: string;
  from: string;
  to: string;
  startTime: string;
};

/**
 * Two schedules conflict when they can both apply to the same option + calendar date + departure time.
 * Draft rows are ignored — they may exist until the supplier changes dates.
 * Multi-time schedules conflict when any shared (weekday ∩ time) pair overlaps the date window.
 */
export function findScheduleOverlap(
  candidate: ListingOptionSchedule,
  others: ListingOptionSchedule[],
  opts?: { startMode?: ListingBookingOption['startMode'] }
): ScheduleOverlapConflict | null {
  const cFrom = listingLocalDateKey(candidate.availabilityDateFrom);
  if (!cFrom) return null;
  if (candidate.status === 'draft') return null;
  const cTimes = allScheduleDepartureTimes(candidate, opts?.startMode);
  if (cTimes.length === 0) return null;
  const cTo = listingLocalDateKey(candidate.availabilityDateTo);

  for (const other of others) {
    if (other.id === candidate.id) continue;
    if (other.status === 'draft' || !scheduleIsBookable(other, opts)) continue;
    const oFrom = listingLocalDateKey(other.availabilityDateFrom);
    const oTimes = allScheduleDepartureTimes(other, opts?.startMode);
    if (!oFrom || oTimes.length === 0) continue;
    const oTo = listingLocalDateKey(other.availabilityDateTo);
    if (!dateRangesOverlap(cFrom, cTo, oFrom, oTo)) continue;
    if (!weekdayOverlap(candidate.weekdays, other.weekdays)) continue;

    const overlapFrom = rangeStartKey(cFrom) > rangeStartKey(oFrom) ? rangeStartKey(cFrom) : rangeStartKey(oFrom);
    const overlapToRaw = rangeEndKey(cTo) < rangeEndKey(oTo) ? rangeEndKey(cTo) : rangeEndKey(oTo);
    const overlapTo = overlapToRaw === '9999-12-31' ? overlapFrom : overlapToRaw;
    const overlapDays = isoDaysInclusive(overlapFrom, overlapTo).filter((iso) => {
      const wd = scheduleWeekdayIndexMondayFirst(iso);
      return wd != null && candidate.weekdays[wd] && other.weekdays[wd];
    });
    if (overlapDays.length === 0) continue;

    for (const iso of overlapDays) {
      const cDay = new Set(departureTimesForScheduleOnDate(candidate, iso, opts?.startMode));
      for (const t of departureTimesForScheduleOnDate(other, iso, opts?.startMode)) {
        if (!cDay.has(t)) continue;
        return {
          otherId: other.id,
          otherName: scheduleHeadlineName(other, 0),
          from: overlapDays[0],
          to: overlapDays[overlapDays.length - 1],
          startTime: t,
        };
      }
    }
  }
  return null;
}

export function scheduleOverlapMessage(conflict: ScheduleOverlapConflict): string {
  const from = formatScheduleDay(conflict.from);
  const to = formatScheduleDay(conflict.to);
  const span = from === to ? from : `${from}–${to}`;
  const named = conflict.otherName.trim();
  const label = named ? `your “${named}” schedule` : 'another schedule';
  return `This overlaps ${label} from ${span} at ${conflict.startTime}.`;
}

export function formatScheduleDay(iso: string): string {
  const d = parseIsoDateUtc(iso);
  if (!d) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function formatScheduleRange(from: string, to: string): string {
  const a = listingLocalDateKey(from);
  const b = listingLocalDateKey(to);
  if (!a && !b) return 'Ongoing';
  if (a && b) return `${formatScheduleDay(a)} – ${formatScheduleDay(b)}`;
  if (a) return `From ${formatScheduleDay(a)}`;
  return `Until ${formatScheduleDay(b)}`;
}

export function formatScheduleWeekdays(weekdays: boolean[]): string {
  if (!Array.isArray(weekdays) || weekdays.length < 7) return 'Every day';
  if (weekdays.every(Boolean)) return 'Every day';
  const weekdayOnly = weekdays.every((on, i) => (i < 5 ? on : !on));
  if (weekdayOnly) return 'Mon–Fri';
  const on = DAY_SHORT.filter((_, i) => weekdays[i]);
  if (on.length === 0) return 'No operating days';
  return on.join(', ');
}

/** Day-level slot used when an option runs flexible hours without a fixed clock time. */
export const FLEXIBLE_DEPARTURE_HM = '00:00';

const CLOCK_HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ScheduleDepartureShape = Pick<
  ListingOptionSchedule,
  'weekdays' | 'startTime' | 'weekdayStartTimes'
>;

/** Sanitize and pad Mon–Sun departure lists; empty days become []. */
export function sanitizeWeekdayStartTimes(
  raw: string[][] | undefined | null,
  opts?: { sort?: boolean }
): string[][] {
  const sort = opts?.sort !== false;
  const out: string[][] = [];
  for (let i = 0; i < 7; i++) {
    const day = Array.isArray(raw?.[i]) ? raw![i] : [];
    const valid = day
      .map((t) => String(t ?? '').trim().slice(0, 5))
      .filter((t) => CLOCK_HM.test(t));
    const unique = [...new Set(valid)];
    out.push(sort ? unique.sort() : unique);
  }
  return out;
}

/**
 * Derive weekdays + legacy startTime from per-day times (write path for the schedule editor).
 * Pass `{ sort: false }` while the supplier is editing a time so rows don't jump under the caret.
 */
export function syncScheduleDeparturesFromWeekdayTimes(
  weekdayStartTimes: string[][],
  opts?: { sort?: boolean }
): Pick<ListingOptionSchedule, 'weekdayStartTimes' | 'weekdays' | 'startTime'> {
  const normalized = sanitizeWeekdayStartTimes(weekdayStartTimes, opts);
  return {
    weekdayStartTimes: normalized,
    weekdays: normalized.map((times) => times.length > 0),
    startTime: normalized.flat().sort()[0] ?? '',
  };
}

/** Departures offered on one weekday (Mon=0 … Sun=6). */
export function scheduleTimesOnWeekday(
  schedule: ScheduleDepartureShape,
  weekdayIndex: number,
  startMode?: ListingBookingOption['startMode']
): string[] {
  if (weekdayIndex < 0 || weekdayIndex > 6) return [];
  if (startMode === 'flexible') {
    return schedule.weekdays[weekdayIndex] ? [FLEXIBLE_DEPARTURE_HM] : [];
  }
  if (schedule.weekdayStartTimes) {
    const day = schedule.weekdayStartTimes[weekdayIndex] ?? [];
    return [
      ...new Set(day.map((t) => t.trim().slice(0, 5)).filter((t) => CLOCK_HM.test(t))),
    ].sort();
  }
  if (schedule.weekdays[weekdayIndex]) {
    const hm = schedule.startTime.trim().slice(0, 5);
    return CLOCK_HM.test(hm) ? [hm] : hm ? [hm] : [];
  }
  return [];
}

/** Distinct clock times across the week (excludes flexible sentinel unless startMode is flexible). */
export function allScheduleDepartureTimes(
  schedule: ScheduleDepartureShape,
  startMode?: ListingBookingOption['startMode']
): string[] {
  if (startMode === 'flexible') {
    return schedule.weekdays.some(Boolean) ? [FLEXIBLE_DEPARTURE_HM] : [];
  }
  const times = new Set<string>();
  for (let i = 0; i < 7; i++) {
    for (const t of scheduleTimesOnWeekday(schedule, i, startMode)) times.add(t);
  }
  return [...times].sort();
}

export function departureTimesForScheduleOnDate(
  schedule: ScheduleDepartureShape,
  localDateIso: string,
  startMode?: ListingBookingOption['startMode']
): string[] {
  const wd = scheduleWeekdayIndexMondayFirst(localDateIso);
  if (wd == null) return [];
  return scheduleTimesOnWeekday(schedule, wd, startMode);
}

export function scheduleHasFixedDepartures(
  schedule: ScheduleDepartureShape,
  startMode?: ListingBookingOption['startMode']
): boolean {
  if (startMode === 'flexible') return schedule.weekdays.some(Boolean);
  if (!schedule.weekdays.some(Boolean)) return false;
  for (let i = 0; i < 7; i++) {
    if (!schedule.weekdays[i]) continue;
    if (scheduleTimesOnWeekday(schedule, i, startMode).length === 0) return false;
  }
  return allScheduleDepartureTimes(schedule, startMode).length > 0;
}

/** Compact label for lists/review: shared times, or per-day when they differ. */
export function formatScheduleDepartureSummary(
  schedule: ScheduleDepartureShape,
  startMode?: ListingBookingOption['startMode']
): string {
  if (startMode === 'flexible') return 'Flexible hours';
  const enabled: number[] = [];
  for (let i = 0; i < 7; i++) if (schedule.weekdays[i]) enabled.push(i);
  if (enabled.length === 0) return '';
  const sets = enabled.map((i) => scheduleTimesOnWeekday(schedule, i, startMode));
  if (sets.some((t) => t.length === 0)) return '';
  const first = sets[0].join(',');
  if (sets.every((t) => t.join(',') === first)) return sets[0].join(', ');
  return enabled
    .map((i, idx) => `${DAY_SHORT[i]} ${sets[idx].join(', ')}`)
    .join(' · ');
}

export function scheduleDepartureHm(
  schedule: ScheduleDepartureShape,
  startMode?: ListingBookingOption['startMode']
): string {
  if (startMode === 'flexible') return FLEXIBLE_DEPARTURE_HM;
  const all = allScheduleDepartureTimes(schedule, startMode);
  if (all[0]) return all[0];
  const hm = schedule.startTime.trim();
  if (hm) return hm;
  return '';
}

export function matchingSchedulesForDate(
  option: ListingBookingOption,
  localDateIso: string,
  startTime?: string
): ListingOptionSchedule[] {
  const key = listingLocalDateKey(localDateIso);
  const ready = listingOptionReadySchedules(option).filter((s) => scheduleAppliesOnDate(s, key));
  const time = startTime?.trim();
  if (time) {
    return ready.filter((s) =>
      departureTimesForScheduleOnDate(s, key, option.startMode).includes(time)
    );
  }
  return ready;
}

export function departureTimesOnDate(option: ListingBookingOption, localDateIso: string): string[] {
  const key = listingLocalDateKey(localDateIso);
  const times = new Set<string>();
  for (const s of matchingSchedulesForDate(option, localDateIso)) {
    for (const t of departureTimesForScheduleOnDate(s, key, option.startMode)) {
      if (t) times.add(t);
    }
  }
  return [...times].sort();
}

export type TourSellingDeparture = {
  optionId: string;
  optionName: string;
  scheduleId: string;
  scheduleName: string;
  startTime: string;
  maxSpotsPerSlot: number;
};

/**
 * Capacity is independent per option/schedule slot today.
 * Shared physical inventory across options (e.g. one van for Small Group + Private)
 * is not modeled — suppliers must not oversubscribe the same resource across options.
 */
/** Partner Calendar: what travelers can still book on this date (ready schedules only). */
export function tourSellingDeparturesOnDate(
  options: ListingBookingOption[] | null | undefined,
  localDateIso: string
): TourSellingDeparture[] {
  const out: TourSellingDeparture[] = [];
  for (const option of options ?? []) {
    if (!option) continue;
    const optionName = (option.name ?? '').trim() || 'Option';
    if (listingOptionHasSchedules(option)) {
      for (const s of matchingSchedulesForDate(option, localDateIso)) {
        const times = departureTimesForScheduleOnDate(s, localDateIso, option.startMode);
        for (const startTime of times) {
          out.push({
            optionId: option.id,
            optionName,
            scheduleId: s.id,
            scheduleName: scheduleHeadlineName(s, 0),
            startTime,
            maxSpotsPerSlot: s.maxSpotsPerSlot,
          });
        }
      }
      continue;
    }
    // Legacy option without schedules: use option-level window.
    // Phase 1293: require from + startTime (scheduleIsBookable / season 1292 parity).
    const from = listingLocalDateKey(option.availabilityDateFrom ?? '');
    const to = listingLocalDateKey(option.availabilityDateTo ?? '');
    const key = listingLocalDateKey(localDateIso);
    const start = (option.startTime ?? '').trim();
    if (!from || !start) continue;
    if (key < from) continue;
    if (to && key > to) continue;
    const wd = scheduleWeekdayIndexMondayFirst(key);
    if (wd == null) continue;
    const weekdays = Array.isArray(option.weekdays) ? option.weekdays : [];
    if (weekdays.length < 7 || !weekdays[wd]) continue;
    // Phase 1173/1212: require real maxSpotsPerSlot — never invent from maxPersons (1207 parity).
    const spots =
      typeof option.maxSpotsPerSlot === 'number' && Number.isFinite(option.maxSpotsPerSlot) && option.maxSpotsPerSlot >= 1
        ? Math.floor(option.maxSpotsPerSlot)
        : null;
    if (spots == null) continue;
    out.push({
      optionId: option.id,
      optionName,
      scheduleId: option.id,
      scheduleName: optionName,
      startTime: start,
      maxSpotsPerSlot: Math.min(99, spots),
    });
  }
  return out.sort((a, b) => {
    const t = a.startTime.localeCompare(b.startTime);
    if (t !== 0) return t;
    return a.optionName.localeCompare(b.optionName);
  });
}

/**
 * Resolve the unique ready schedule for a traveler date (and optional departure).
 * Returns null when none apply, or when several departure times apply and no time was given.
 */
export function resolveScheduleForDate(
  option: ListingBookingOption,
  localDateIso: string,
  startTime?: string
): ListingOptionSchedule | null {
  const ready = matchingSchedulesForDate(option, localDateIso, startTime);
  if (ready.length === 0) return null;
  const time = startTime?.trim();
  if (!time) {
    const times = new Set<string>();
    for (const s of ready) {
      for (const t of departureTimesForScheduleOnDate(s, localDateIso, option.startMode)) {
        times.add(t);
      }
    }
    if (times.size > 1) return null;
    if (ready.length === 1) return ready[0];
    if (times.size === 1) return ready[0];
    return null;
  }
  if (ready.length === 1) return ready[0];
  const times = new Set(
    ready.flatMap((s) => departureTimesForScheduleOnDate(s, localDateIso, option.startMode))
  );
  if (times.size === 1) return ready[0];
  return null;
}

export function optionHasScheduleCoverageOnDate(option: ListingBookingOption, localDateIso: string): boolean {
  if (listingOptionHasSchedules(option)) {
    return matchingSchedulesForDate(option, localDateIso).length > 0;
  }
  return listingOptionReadySchedules(option).some((s) => scheduleAppliesOnDate(s, localDateIso));
}

/** Copy schedule commercial fields onto the option so quoteBooking / inventory stay compatible. */
export function applyScheduleToOption(
  option: ListingBookingOption,
  schedule: ListingOptionSchedule,
  departureHm?: string
): ListingBookingOption {
  const chosen = (departureHm ?? '').trim().slice(0, 5);
  const startTime =
    chosen || scheduleDepartureHm(schedule, option.startMode) || schedule.startTime;
  const next: ListingBookingOption = {
    ...option,
    startTime,
    weekdays: [...schedule.weekdays],
    availabilityDateFrom: schedule.availabilityDateFrom,
    availabilityDateTo: schedule.availabilityDateTo,
    pricingMode: schedule.pricingMode,
    priceUsd: schedule.priceUsd,
    priceCategories: schedule.priceCategories,
    isPrivate: schedule.isPrivate,
    privatePricing: schedule.privatePricing,
    privateGroupPriceUsd: schedule.privateGroupPriceUsd,
    minPersons: schedule.minPersons,
    maxPersons: schedule.maxPersons,
    maxSpotsPerSlot: schedule.maxSpotsPerSlot,
  };
  if (typeof schedule.maxGroupsPerSlot === 'number' && schedule.maxGroupsPerSlot >= 1) {
    next.maxGroupsPerSlot = schedule.maxGroupsPerSlot;
  } else {
    delete next.maxGroupsPerSlot;
  }
  if (schedule.weekdayStartTimes) {
    next.weekdayStartTimes = schedule.weekdayStartTimes.map((day) => [...day]);
  } else {
    delete next.weekdayStartTimes;
  }
  return next;
}

/**
 * Phase 1123: capacity for one departure time on a date — schedule-resolved, not the
 * currently selected schedule's maxSpots (which would mis-label sibling departures).
 * Phase 1162: when schedules exist but none match date+time, fail closed (null)
 * — parity with tourDepartureSlotCapacity / assert (no option-level invent).
 */
export function optionCapacityForDepartureTime(
  option: ListingBookingOption,
  localDateIso: string,
  startTimeHm: string
): { maxSpotsPerSlot: number; maxPersons: number } | null {
  if (listingOptionHasSchedules(option)) {
    const resolved = resolveScheduleForDate(option, localDateIso, startTimeHm);
    if (!resolved) return null;
    const resolvedSpots = resolved.maxSpotsPerSlot;
    if (typeof resolvedSpots !== 'number' || !Number.isFinite(resolvedSpots) || resolvedSpots < 1) {
      return null;
    }
    return {
      maxSpotsPerSlot: Math.min(99, Math.floor(resolvedSpots)),
      maxPersons: resolved.maxPersons,
    };
  }
  // Phase 1207: legacy (no schedules) — require real maxSpotsPerSlot (no invent).
  const spots = option.maxSpotsPerSlot;
  if (typeof spots !== 'number' || !Number.isFinite(spots) || spots < 1) return null;
  return {
    maxSpotsPerSlot: Math.min(99, Math.floor(spots)),
    maxPersons: option.maxPersons,
  };
}

export function syncOptionHeadlineFromSchedules(option: ListingBookingOption): ListingBookingOption {
  const ready = listingOptionReadySchedules(option);
  if (ready.length === 0) return option;
  const froms = ready.map((s) => listingLocalDateKey(s.availabilityDateFrom)).filter(Boolean).sort();
  const tos = ready
    .map((s) => listingLocalDateKey(s.availabilityDateTo))
    .filter(Boolean)
    .sort();
  const cheapest = ready.reduce((min, s) => {
    const n = optionHeadlineUnitPrice(s);
    return n > 0 && (min === 0 || n < min) ? n : min;
  }, 0);
  const first = ready[0];
  return {
    ...option,
    availabilityDateFrom: froms[0] ?? option.availabilityDateFrom,
    availabilityDateTo: tos[tos.length - 1] ?? option.availabilityDateTo,
    startTime: ready.length === 1 ? first.startTime : option.startTime,
    weekdays: first.weekdays,
    pricingMode: first.pricingMode,
    priceUsd: cheapest > 0 ? cheapest : first.priceUsd,
    priceCategories: first.priceCategories,
    isPrivate: first.isPrivate,
    privatePricing: first.privatePricing,
    privateGroupPriceUsd: first.privateGroupPriceUsd,
    minPersons: Math.min(...ready.map((s) => s.minPersons)),
    maxPersons: Math.max(...ready.map((s) => s.maxPersons)),
    maxSpotsPerSlot: Math.max(...ready.map((s) => s.maxSpotsPerSlot)),
  };
}

export function upsertOptionSchedule(
  option: ListingBookingOption,
  schedule: ListingOptionSchedule
): ListingBookingOption {
  const current = listingOptionHasSchedules(option)
    ? [...(option.schedules ?? [])]
    : listingOptionSchedules(option).filter((s) => !isImplicitScheduleId(s.id));
  const idx = current.findIndex((s) => s.id === schedule.id);
  if (idx >= 0) {
    current[idx] = schedule;
  } else if (current.length >= LISTING_OPTION_SCHEDULES_MAX) {
    // Soft product limit — never drop existing rows on update; refuse net-new inserts.
    return option;
  } else {
    current.push(schedule);
  }
  return syncOptionHeadlineFromSchedules({ ...option, schedules: current });
}

export function removeOptionSchedule(option: ListingBookingOption, scheduleId: string): ListingBookingOption {
  const current = listingOptionHasSchedules(option) ? [...(option.schedules ?? [])] : [];
  const next = current.filter((s) => s.id !== scheduleId);
  return syncOptionHeadlineFromSchedules({ ...option, schedules: next });
}

export function duplicateOptionSchedule(source: ListingOptionSchedule, newId: string): ListingOptionSchedule {
  return {
    ...source,
    id: newId,
    name: source.name.trim() ? `${source.name.trim()} copy` : '',
    status: 'draft',
  };
}

export function blankOptionSchedule(id: string): ListingOptionSchedule {
  return {
    id,
    name: '',
    availabilityDateFrom: '',
    availabilityDateTo: '',
    weekdays: [true, true, true, true, true, true, true],
    startTime: '',
    pricingMode: 'uniform',
    priceUsd: 0,
    minPersons: 1,
    // Phase 1283: do not invent capacity 8 — partner must set max persons / spots.
    maxPersons: 0,
    maxSpotsPerSlot: 0,
    status: 'draft',
  };
}

export function ensureExplicitSchedules(option: ListingBookingOption): ListingBookingOption {
  if (option.schedules !== undefined) return option;
  const implicit = listingOptionSchedules(option);
  if (implicit.length === 0) return { ...option, schedules: [] };
  return {
    ...option,
    schedules: implicit.map((s) => ({
      ...s,
      id: isImplicitScheduleId(s.id) ? newListingOptionScheduleId() : s.id,
    })),
  };
}

export function optionScheduleCountLabel(option: ListingBookingOption): string {
  const n = listingOptionHasSchedules(option)
    ? (option.schedules ?? []).length
    : listingOptionSchedules(option).length;
  if (n === 0) return 'No schedules';
  return n === 1 ? '1 schedule' : `${n} schedules`;
}

export function optionHasReadySchedule(option: ListingBookingOption): boolean {
  if (listingOptionHasSchedules(option)) {
    const mode = { startMode: option.startMode };
    return (option.schedules ?? []).some(
      (s) => s.status !== 'draft' && scheduleWizardIsComplete(s, mode) && scheduleIsBookable(s, mode)
    );
  }
  return listingOptionReadySchedules(option).length > 0;
}
