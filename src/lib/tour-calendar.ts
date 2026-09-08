import type { ListingBookingOption } from '../types/listingExtras';
import { optionRunsOnDate } from './booking-quote';

export type TourDayState = 'past' | 'closed' | 'full' | 'available' | 'selected';

export function tourDayState(params: {
  iso: string;
  todayIso: string;
  selected: string;
  options: ListingBookingOption[];
  soldOut?: boolean;
}): TourDayState {
  if (params.iso < params.todayIso) return 'past';
  if (params.selected === params.iso) return 'selected';
  if (params.options.length === 0) return params.soldOut ? 'full' : 'available';
  const anyOpen = params.options.some((o) => optionRunsOnDate(o, params.iso) === null);
  if (!anyOpen) return 'closed';
  return params.soldOut ? 'full' : 'available';
}

export function formatTourDayAria(iso: string, state: TourDayState): string {
  const human = new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  if (state === 'past') return `${human}, past`;
  if (state === 'closed') return `${human}, not offered`;
  if (state === 'full') return `${human}, fully booked`;
  if (state === 'selected') return `${human}, selected`;
  return `${human}, available`;
}
