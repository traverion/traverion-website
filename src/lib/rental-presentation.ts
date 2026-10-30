import { rentalCancellationCustomerText } from './rental-cancellation';
import { rentalCategoryConfig, rentalItemTypeLabel } from './rental-categories';
import {
  effectiveVariantDurationLimits,
  effectiveVariantDurationMode,
  formatMinorAsEuro,
  rentalHoursWindow,
  rentalHoursWindowsEqual,
  rentalListingOffersUnit,
  rentalLowestDayPriceMinor,
  rentalLowestHourPriceMinor,
} from './rental-details';
import type { RentalOpsStatus, RentalPurchaseSnapshot } from './rental-booking-domain';
import type { RentalDetails, RentalOperatingDay, RentalVariant, RentalWeekday } from '../types/rental';

const WEEKDAY_ORDER: RentalWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const WEEKDAY_LABEL: Record<RentalWeekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

const WEEKDAY_SHORT: Record<RentalWeekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

export type RentalMapPoint = {
  address: string;
  lat: number | null;
  lng: number | null;
};

function rentalMapPoint(address: unknown, lat: unknown, lng: unknown): RentalMapPoint {
  const latOk = typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null;
  const lngOk = typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null;
  const paired = latOk != null && lngOk != null;
  return {
    address: typeof address === 'string' ? address.trim() : '',
    lat: paired ? latOk : null,
    lng: paired ? lngOk : null,
  };
}

export function rentalPickupPoint(source: {
  pickupAddress?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
}): RentalMapPoint {
  return rentalMapPoint(source.pickupAddress, source.pickupLat, source.pickupLng);
}

/** Same-as-pickup uses the pickup point. A different place keeps its own address and pin. */
export function rentalReturnPoint(source: {
  pickupAddress?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  returnSameAsPickup?: boolean | null;
  returnAddress?: string | null;
  returnLat?: number | null;
  returnLng?: number | null;
}): RentalMapPoint & { sameAsPickup: boolean } {
  const sameAsPickup = source.returnSameAsPickup !== false;
  if (sameAsPickup) return { ...rentalPickupPoint(source), sameAsPickup: true };
  return { ...rentalMapPoint(source.returnAddress, source.returnLat, source.returnLng), sameAsPickup: false };
}

export function rentalMapHref(lat: number | null | undefined, lng: number | null | undefined): string | null {
  const latOk = typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90;
  const lngOk = typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
  if (!latOk || !lngOk) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

export function rentalItemLabel(rental: RentalDetails): string {
  if (rental.itemType === 'custom') return (rental.customItemType ?? '').trim();
  return rentalItemTypeLabel(rental.category, rental.itemType);
}

export function rentalCategoryTitle(rental: RentalDetails): string {
  return rentalCategoryConfig(rental.category)?.title ?? 'Rental';
}

/** Quantity nouns for the booking stepper — never “guest”. */
export function rentalQuantityUnits(rental: RentalDetails): { singular: string; plural: string } {
  switch (rental.category) {
    case 'cameras_electronics':
      return { singular: 'camera', plural: 'cameras' };
    case 'bikes':
      return { singular: 'bicycle', plural: 'bicycles' };
    case 'vehicles':
      return { singular: 'vehicle', plural: 'vehicles' };
    default:
      return { singular: 'unit', plural: 'units' };
  }
}

/** Traveler-facing quantity line — never “guest(s)” for rentals. */
export function formatRentalQuantityLabel(
  quantity: number,
  category?: RentalDetails['category'] | string | null
): string {
  const q = Math.max(0, Math.floor(Number(quantity) || 0));
  if (q <= 0) return '—';
  const units = rentalQuantityUnits({
    category: category as RentalDetails['category'],
  } as RentalDetails);
  return `${q} ${q === 1 ? units.singular : units.plural}`;
}

export function rentalSpecLabel(rental: RentalDetails, key: string): string {
  return rentalCategoryConfig(rental.category)?.listingSpecKeys.find((row) => row.key === key)?.label ?? 'Detail';
}

export function rentalRequirementLabel(rental: RentalDetails, key: string): string {
  return rentalCategoryConfig(rental.category)?.requirementKeys.find((row) => row.key === key)?.label ?? 'Requirement';
}

export function rentalPickupHandoverLabel(source: { staffAssisted?: boolean | null }): string | null {
  if (source.staffAssisted === true) return 'Staff handover';
  if (source.staffAssisted === false) return 'Self-service pickup';
  return null;
}

export function rentalReturnHandoverLabel(source: { returnStaffAssisted?: boolean | null }): string | null {
  if (source.returnStaffAssisted === true) return 'Staff return';
  if (source.returnStaffAssisted === false) return 'Self-service return';
  return null;
}

function rentalHoursWindowLabel(day: RentalOperatingDay): string {
  const window = rentalHoursWindow(day);
  const pickup = [window.earliestPickupHm, window.latestPickupHm].filter(Boolean).join('–');
  const ret = [window.earliestReturnHm, window.latestReturnHm].filter(Boolean).join('–');
  return `Pickup ${pickup || 'during open hours'} · Return ${ret || 'during open hours'}`;
}

function rentalWeekdayRangeLabel(days: RentalWeekday[]): string {
  if (days.length === 1) return WEEKDAY_LABEL[days[0]];
  const first = days[0];
  const last = days[days.length - 1];
  const consecutive =
    days.length > 1 &&
    days.every((day, index) => WEEKDAY_ORDER.indexOf(day) === WEEKDAY_ORDER.indexOf(first) + index);
  if (consecutive) return `${WEEKDAY_SHORT[first]}–${WEEKDAY_SHORT[last]}`;
  return days.map((day) => WEEKDAY_SHORT[day]).join(', ');
}

/** Open days collapsed when consecutive weekdays share the same pickup/return window. */
export function rentalHoursLines(days: RentalOperatingDay[] | undefined): string[] {
  const open = WEEKDAY_ORDER.map((day) => (days ?? []).find((row) => row.day === day && row.open)).filter(
    (row): row is RentalOperatingDay => Boolean(row)
  );
  if (open.length === 0) return [];

  const groups: { days: RentalWeekday[]; sample: RentalOperatingDay }[] = [];
  for (const day of open) {
    const prev = groups[groups.length - 1];
    if (
      prev &&
      rentalHoursWindowsEqual(rentalHoursWindow(prev.sample), rentalHoursWindow(day)) &&
      WEEKDAY_ORDER.indexOf(day.day) === WEEKDAY_ORDER.indexOf(prev.days[prev.days.length - 1]) + 1
    ) {
      prev.days.push(day.day);
      continue;
    }
    groups.push({ days: [day.day], sample: day });
  }

  return groups.map((group) => `${rentalWeekdayRangeLabel(group.days)} · ${rentalHoursWindowLabel(group.sample)}`);
}

export function rentalDepositMethodLabel(method: RentalDetails['depositCollectionMethod']): string | null {
  if (method === 'cash_at_pickup') return 'Cash at pickup';
  if (method === 'card_at_pickup') return 'Card at pickup, handled by the operator';
  if (method === 'other') return 'Collected by the operator at pickup';
  return null;
}

export function rentalDepositCustomerText(rental: RentalDetails): string {
  if (rental.depositRequired === false) {
    return 'No security deposit is listed for this rental.';
  }
  const amount =
    rental.depositRequired && rental.depositAmountMinor
      ? formatMinorAsEuro(rental.depositAmountMinor)
      : null;
  const method = rentalDepositMethodLabel(rental.depositCollectionMethod);
  const parts = [
    amount ? `${amount} security deposit` : rental.depositRequired ? 'A security deposit is required' : null,
    'Traverion does not charge or hold rental deposits online',
    method,
    rental.depositReturnNotes?.trim() || null,
    rental.depositDisclosure?.trim() || null,
  ].filter(Boolean);
  return parts.join('. ').replace(/\.\./g, '.');
}

/** One-line deposit cue for checkout chrome (full text stays in rentalDepositCustomerText). */
export function rentalDepositShortSummary(rental: RentalDetails): string {
  if (rental.depositRequired === false) return 'No security deposit listed.';
  const amount =
    rental.depositRequired && rental.depositAmountMinor
      ? formatMinorAsEuro(rental.depositAmountMinor)
      : null;
  if (amount) return `${amount} security deposit · collected by the operator`;
  if (rental.depositRequired) return 'Security deposit required · collected by the operator';
  return 'Deposit terms apply.';
}

export function rentalDurationCustomerText(rental: RentalDetails): string {
  const offersHour = rentalListingOffersUnit(rental, 'hour');
  const offersDay = rentalListingOffersUnit(rental, 'day');
  const modeLabel =
    offersHour && offersDay ? 'Hourly or daily' : offersHour ? 'Hourly' : 'Daily';
  const bits = [modeLabel];
  const variants = rental.variants ?? [];
  if (offersHour) {
    const mins = variants.map((v) => effectiveVariantDurationLimits(rental, v, 'hour').min);
    const maxes = variants.map((v) => effectiveVariantDurationLimits(rental, v, 'hour').max);
    const minH = mins.length ? Math.min(...mins) : (rental.minDurationHours ?? undefined);
    const maxH = maxes.length ? Math.max(...maxes) : (rental.maxDurationHours ?? undefined);
    if (minH) bits.push(`at least ${minH} hour${minH === 1 ? '' : 's'}`);
    if (maxH) bits.push(`up to ${maxH} hours`);
  }
  if (offersDay) {
    const mins = variants.map((v) => effectiveVariantDurationLimits(rental, v, 'day').min);
    const maxes = variants.map((v) => effectiveVariantDurationLimits(rental, v, 'day').max);
    const minD = mins.length ? Math.min(...mins) : (rental.minDurationDays ?? undefined);
    const maxD = maxes.length ? Math.max(...maxes) : (rental.maxDurationDays ?? undefined);
    if (minD) bits.push(`at least ${minD} day${minD === 1 ? '' : 's'}`);
    if (maxD) bits.push(`up to ${maxD} days`);
  }
  if (rental.bookingNoticeHours) {
    bits.push(`book at least ${rental.bookingNoticeHours} hour${rental.bookingNoticeHours === 1 ? '' : 's'} ahead`);
  }
  if (rental.bufferMinutes) bits.push(`${rental.bufferMinutes} minutes between rentals`);
  return bits.join(' · ');
}

export type RentalDurationLengthRow = {
  key: 'hour' | 'day';
  title: string;
  range: string;
};

function rentalDurationRangeLabel(min: number, max: number, unitSingular: string, unitPlural: string): string {
  if (min === max) return `${min} ${min === 1 ? unitSingular : unitPlural}`;
  return `${min}–${max} ${unitPlural}`;
}

/**
 * Compact PDP rows for supported rental length modes on the selected option.
 * Falls back to listing-wide min/max when no option is selected.
 */
export function rentalDurationLengthRows(
  rental: RentalDetails,
  variant?: RentalVariant | null,
): RentalDurationLengthRow[] {
  const rows: RentalDurationLengthRow[] = [];
  const mode = variant ? effectiveVariantDurationMode(rental, variant) : null;
  const offersHour = variant
    ? mode === 'hourly' || mode === 'both'
    : rentalListingOffersUnit(rental, 'hour');
  const offersDay = variant
    ? mode === 'daily' || mode === 'both'
    : rentalListingOffersUnit(rental, 'day');
  const variants = rental.variants ?? [];

  if (offersHour) {
    const { min, max } = variant
      ? effectiveVariantDurationLimits(rental, variant, 'hour')
      : {
          min: variants.length
            ? Math.min(...variants.map((v) => effectiveVariantDurationLimits(rental, v, 'hour').min))
            : (rental.minDurationHours ?? 1),
          max: variants.length
            ? Math.max(...variants.map((v) => effectiveVariantDurationLimits(rental, v, 'hour').max))
            : (rental.maxDurationHours ?? 8),
        };
    rows.push({
      key: 'hour',
      title: 'Hourly rental',
      range: rentalDurationRangeLabel(min, max, 'hour', 'hours'),
    });
  }
  if (offersDay) {
    const { min, max } = variant
      ? effectiveVariantDurationLimits(rental, variant, 'day')
      : {
          min: variants.length
            ? Math.min(...variants.map((v) => effectiveVariantDurationLimits(rental, v, 'day').min))
            : (rental.minDurationDays ?? 1),
          max: variants.length
            ? Math.max(...variants.map((v) => effectiveVariantDurationLimits(rental, v, 'day').max))
            : (rental.maxDurationDays ?? 14),
        };
    rows.push({
      key: 'day',
      title: 'Daily rental',
      range: rentalDurationRangeLabel(min, max, 'day', 'days'),
    });
  }
  return rows;
}

/** Option rates a guest would pay for this option's duration mode. */
export function rentalOptionRateLabel(
  rental: RentalDetails,
  pricing: { pricePerHourMinor?: number | null; pricePerDayMinor?: number | null },
  variant?: RentalVariant | null,
): string {
  const mode = variant
    ? effectiveVariantDurationMode(rental, variant)
    : rentalListingOffersUnit(rental, 'hour') && rentalListingOffersUnit(rental, 'day')
      ? 'both'
      : rentalListingOffersUnit(rental, 'hour')
        ? 'hourly'
        : 'daily';
  const parts: string[] = [];
  if ((mode === 'hourly' || mode === 'both') && pricing.pricePerHourMinor != null && pricing.pricePerHourMinor > 0) {
    parts.push(`${formatMinorAsEuro(pricing.pricePerHourMinor)} / hour`);
  }
  if ((mode === 'daily' || mode === 'both') && pricing.pricePerDayMinor != null && pricing.pricePerDayMinor > 0) {
    parts.push(`${formatMinorAsEuro(pricing.pricePerDayMinor)} / day`);
  }
  return parts.join(' · ');
}

/** Lowest applicable option rate, for catalog cards. Hour-only listings use the hour rate. */
export function rentalFromPrice(rental: RentalDetails): { label: string; minor: number } | null {
  const hourlyOnly = rentalListingOffersUnit(rental, 'hour') && !rentalListingOffersUnit(rental, 'day');
  const minor = hourlyOnly ? rentalLowestHourPriceMinor(rental) : rentalLowestDayPriceMinor(rental);
  if (minor == null) {
    const fallback = hourlyOnly ? rentalLowestDayPriceMinor(rental) : rentalLowestHourPriceMinor(rental);
    if (fallback == null) return null;
    return { minor: fallback, label: `${formatMinorAsEuro(fallback)} / ${hourlyOnly ? 'day' : 'hour'}` };
  }
  return { minor, label: `${formatMinorAsEuro(minor)} / ${hourlyOnly ? 'hour' : 'day'}` };
}

export function rentalSnapshotCancellationText(snap: {
  cancellationLabel?: string | null;
  cancellationPreset?: string | null;
}): string | null {
  if (snap.cancellationLabel?.trim()) return snap.cancellationLabel.trim();
  if (snap.cancellationPreset) return rentalCancellationCustomerText(snap.cancellationPreset);
  return null;
}

export function formatRentalInstant(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Compact partner-desk date · time for collection / return rows. */
export function formatRentalOpsInstant(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Partner rental handover chip — collection/return ops, not tour pickup language.
 * awaiting_pickup → Awaiting collection; collected → Awaiting return; returned → Returned.
 */
export function rentalHandoverStatusLabel(
  ops: RentalOpsStatus | string | null | undefined
): string {
  const s = String(ops ?? 'awaiting_pickup').trim().toLowerCase();
  if (s === 'collected') return 'Awaiting return';
  if (s === 'returned') return 'Returned';
  if (s === 'cancelled') return 'Cancelled';
  return 'Awaiting collection';
}

export function rentalHandoverCompletedLabel(
  ops: RentalOpsStatus | string | null | undefined
): string | null {
  const s = String(ops ?? '').trim().toLowerCase();
  if (s === 'returned') return 'Handover complete';
  if (s === 'collected') return 'Collected';
  return null;
}

export function rentalTripFacts(snap: RentalPurchaseSnapshot): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (snap.listingTitle?.trim()) rows.push({ label: 'Rental', value: snap.listingTitle.trim() });
  if (snap.variantName?.trim()) rows.push({ label: 'Option', value: snap.variantName.trim() });
  rows.push({ label: 'Quantity', value: String(snap.quantity) });
  const pickup = formatRentalInstant(snap.pickupAt);
  const ret = formatRentalInstant(snap.returnAt);
  if (pickup) rows.push({ label: 'Pickup', value: pickup });
  if (ret) rows.push({ label: 'Return', value: ret });
  const pickupPoint = rentalPickupPoint(snap);
  const returnPoint = rentalReturnPoint(snap);
  if (pickupPoint.address) rows.push({ label: 'Pickup place', value: pickupPoint.address });
  if (returnPoint.address) {
    rows.push({
      label: 'Return place',
      value: returnPoint.sameAsPickup ? `Same as pickup · ${returnPoint.address}` : returnPoint.address,
    });
  }
  const policy = rentalSnapshotCancellationText(snap);
  if (policy) rows.push({ label: 'Cancellation', value: policy });
  if (snap.depositDisclosure?.trim()) rows.push({ label: 'Deposit', value: snap.depositDisclosure.trim() });
  else if (snap.depositAmountMinor && snap.depositAmountMinor > 0) {
    rows.push({
      label: 'Deposit',
      value: `${formatMinorAsEuro(snap.depositAmountMinor)} at pickup. Traverion does not charge deposits online.`,
    });
  }
  return rows;
}
