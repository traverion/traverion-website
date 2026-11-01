import type { PartnerUnifiedCalendarEvent } from './partner-unified-calendar';
import { partnerUnifiedEventKindLabel } from './partner-unified-calendar';

export const PARTNER_UNIFIED_MONTH_CELL_MAX = 3;

function truncateLabel(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

function monthListingName(event: PartnerUnifiedCalendarEvent, max = 16): string {
  return truncateLabel((event.listingTitle ?? '').trim() || 'Listing', max);
}

/** Compact month chip copy — listing name first, never option-only labels like "Standard". */
export function monthChipLabel(event: PartnerUnifiedCalendarEvent): string {
  const title = monthListingName(event);
  const time = event.timeHm ? `${event.timeHm} ` : '';
  const qty = (event.quantityLabel ?? '').trim();

  if (event.kind === 'tour_departure' || event.kind === 'tour') {
    const avail =
      event.departureStatus === 'closed'
        ? ' · Blocked'
        : event.departureStatus === 'sold_out'
          ? ' · Full'
          : event.departureStatus === 'cutoff'
            ? ' · Cutoff'
            : event.bookedCount != null && event.capacityCount != null
              ? ` · ${event.bookedCount}/${event.capacityCount}`
              : '';
    return `${time}${title}${avail}`.trim();
  }

  if (event.kind === 'stay_listing' || event.kind === 'stay_blocked') {
    const status = qty || (event.kind === 'stay_blocked' ? 'Blocked' : 'Available');
    return `${title} · ${status}`;
  }

  if (event.kind === 'rental_listing' || event.kind === 'rental_block') {
    const status = qty || (event.kind === 'rental_block' ? 'Blocked' : 'Stock');
    return `${title} · ${status}`;
  }

  if (event.kind === 'rental_collection' || event.kind === 'rental_return') {
    return `${time}${title} · ${partnerUnifiedEventKindLabel(event.kind)}`.trim();
  }

  if (
    event.kind === 'stay_check_in' ||
    event.kind === 'stay_check_out' ||
    event.kind === 'stay_occupied' ||
    event.kind === 'rental_ongoing'
  ) {
    return `${title} · ${partnerUnifiedEventKindLabel(event.kind)}`;
  }

  return `${time}${title}`.trim();
}

export function monthChipTitle(event: PartnerUnifiedCalendarEvent): string {
  const parts = [
    event.listingTitle?.trim(),
    event.timeHm ? `at ${event.timeHm}` : null,
    event.optionLabel?.trim() &&
    event.optionLabel !== 'Property availability' &&
    event.optionLabel !== 'Inventory'
      ? event.optionLabel.trim()
      : null,
    partnerUnifiedEventKindLabel(event.kind),
    event.quantityLabel?.trim(),
    event.guestName?.trim(),
    event.reference?.trim(),
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Prefer bookings / blocked inventory over routine Available presence rows in month cells. */
export function monthEventPriority(event: PartnerUnifiedCalendarEvent): number {
  if (event.kind === 'tour_departure' || event.kind === 'tour') return 0;
  if (
    event.kind === 'rental_collection' ||
    event.kind === 'rental_return' ||
    event.kind === 'stay_check_in' ||
    event.kind === 'stay_check_out'
  ) {
    return 1;
  }
  if (event.kind === 'stay_occupied' || event.kind === 'rental_ongoing') return 2;
  const qty = (event.quantityLabel ?? '').trim().toLowerCase();
  if (
    event.departureStatus === 'closed' ||
    event.kind === 'stay_blocked' ||
    event.kind === 'rental_block' ||
    qty === 'blocked'
  ) {
    return 3;
  }
  if (qty === 'occupied' || (event.bookedCount != null && event.bookedCount > 0)) return 4;
  if (event.kind === 'stay_listing' || event.kind === 'rental_listing') return 6;
  return 5;
}

export function sortMonthCellEvents(
  events: PartnerUnifiedCalendarEvent[]
): PartnerUnifiedCalendarEvent[] {
  return [...events].sort((a, b) => {
    const byPri = monthEventPriority(a) - monthEventPriority(b);
    if (byPri) return byPri;
    const byTime = (a.timeHm ?? '99:99').localeCompare(b.timeHm ?? '99:99');
    if (byTime) return byTime;
    return a.key.localeCompare(b.key);
  });
}
