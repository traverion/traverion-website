import { rentalCancellationCustomerText } from './rental-cancellation';
import { rentalCategoryConfig, rentalItemTypeLabel } from './rental-categories';
import { effectiveVariantPricing, formatMinorAsEuro } from './rental-details';
import type { RentalPurchaseSnapshot } from './rental-booking-domain';
import type { RentalDetails, RentalOperatingDay, RentalWeekday } from '../types/rental';

const WEEKDAY_LABEL: Record<RentalWeekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export function rentalItemLabel(rental: RentalDetails): string {
  if (rental.itemType === 'custom') return (rental.customItemType ?? '').trim();
  return rentalItemTypeLabel(rental.category, rental.itemType);
}

export function rentalCategoryTitle(rental: RentalDetails): string {
  return rentalCategoryConfig(rental.category)?.title ?? 'Rental';
}

export function rentalSpecLabel(rental: RentalDetails, key: string): string {
  return rentalCategoryConfig(rental.category)?.listingSpecKeys.find((row) => row.key === key)?.label ?? 'Detail';
}

export function rentalRequirementLabel(rental: RentalDetails, key: string): string {
  return rentalCategoryConfig(rental.category)?.requirementKeys.find((row) => row.key === key)?.label ?? 'Requirement';
}

export function rentalHoursLines(days: RentalOperatingDay[] | undefined): string[] {
  return (days ?? [])
    .filter((day) => day.open)
    .map((day) => {
      const pickup = [day.earliestPickupHm, day.latestPickupHm].filter(Boolean).join('–');
      const ret = [day.earliestReturnHm, day.latestReturnHm].filter(Boolean).join('–');
      return `${WEEKDAY_LABEL[day.day]} · Pickup ${pickup || 'during open hours'} · Return ${ret || 'during open hours'}`;
    });
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

export function rentalDurationCustomerText(rental: RentalDetails): string {
  const mode = rental.durationMode ?? 'daily';
  const modeLabel = mode === 'hourly' ? 'Hourly' : mode === 'both' ? 'Hourly or daily' : 'Daily';
  const bits = [modeLabel];
  if (mode === 'hourly' || mode === 'both') {
    if (rental.minDurationHours) bits.push(`at least ${rental.minDurationHours} hour${rental.minDurationHours === 1 ? '' : 's'}`);
    if (rental.maxDurationHours) bits.push(`up to ${rental.maxDurationHours} hours`);
  }
  if (mode === 'daily' || mode === 'both') {
    if (rental.minDurationDays) bits.push(`at least ${rental.minDurationDays} day${rental.minDurationDays === 1 ? '' : 's'}`);
    if (rental.maxDurationDays) bits.push(`up to ${rental.maxDurationDays} days`);
  }
  if (rental.bookingNoticeHours) {
    bits.push(`book at least ${rental.bookingNoticeHours} hour${rental.bookingNoticeHours === 1 ? '' : 's'} ahead`);
  }
  if (rental.bufferMinutes) bits.push(`${rental.bufferMinutes} minutes between rentals`);
  return bits.join(' · ');
}

/** Lowest public rate across options, for catalog cards. */
export function rentalFromPrice(rental: RentalDetails): { label: string; minor: number } | null {
  const variants = rental.variants ?? [];
  const prices: { minor: number; unit: 'hour' | 'day' }[] = [];
  const consider = variants.length > 0 ? variants : [null];
  for (const variant of consider) {
    const pricing = variant ? effectiveVariantPricing(rental, variant) : rental.sharedPricing;
    if (!pricing) continue;
    if (rental.durationMode !== 'hourly' && pricing.pricePerDayMinor && pricing.pricePerDayMinor > 0) {
      prices.push({ minor: pricing.pricePerDayMinor, unit: 'day' });
    }
    if (rental.durationMode !== 'daily' && pricing.pricePerHourMinor && pricing.pricePerHourMinor > 0) {
      prices.push({ minor: pricing.pricePerHourMinor, unit: 'hour' });
    }
  }
  if (prices.length === 0) return null;
  prices.sort((a, b) => a.minor - b.minor);
  const best = prices[0];
  return { minor: best.minor, label: `${formatMinorAsEuro(best.minor)} / ${best.unit}` };
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

export function rentalTripFacts(snap: RentalPurchaseSnapshot): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (snap.listingTitle?.trim()) rows.push({ label: 'Rental', value: snap.listingTitle.trim() });
  if (snap.variantName?.trim()) rows.push({ label: 'Option', value: snap.variantName.trim() });
  rows.push({ label: 'Quantity', value: String(snap.quantity) });
  const pickup = formatRentalInstant(snap.pickupAt);
  const ret = formatRentalInstant(snap.returnAt);
  if (pickup) rows.push({ label: 'Pickup', value: pickup });
  if (ret) rows.push({ label: 'Return', value: ret });
  if (snap.pickupAddress?.trim()) rows.push({ label: 'Pickup place', value: snap.pickupAddress.trim() });
  if (snap.returnSameAsPickup === false && snap.returnAddress?.trim()) {
    rows.push({ label: 'Return place', value: snap.returnAddress.trim() });
  } else if (snap.pickupAddress?.trim()) {
    rows.push({ label: 'Return place', value: 'Same as pickup' });
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
