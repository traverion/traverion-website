import { remainingCapacity } from './availability-ops';

/** Public pre-checkout capacity check (paid + live holds; matches checkout occupancy). */
export function tourPublicAvailabilityRemaining(params: {
  date: string;
  guests: number;
  /** listing_availability row for this date */
  dayCapacityOverride: number | null;
  paidGuestsDay: number;
  fallbackDayCapacity: number;
  startTimeHm?: string | null;
  slotMaxSpots?: number | null;
  paidGuestsSlot?: number;
}): { available: boolean; remaining: number; scope: 'day' | 'departure' } {
  const guests = Math.max(1, Math.floor(params.guests));
  const dayOverride =
    params.dayCapacityOverride != null && Number.isFinite(params.dayCapacityOverride)
      ? Math.max(0, Math.floor(params.dayCapacityOverride))
      : null;
  const start = (params.startTimeHm ?? '').trim();
  const slotCap =
    typeof params.slotMaxSpots === 'number' && Number.isFinite(params.slotMaxSpots) && params.slotMaxSpots >= 1
      ? Math.floor(params.slotMaxSpots)
      : null;
  // Phase 1112: day override only tightens; with a departure keep slot occupancy.
  if (start && slotCap != null) {
    const cap = dayOverride != null ? Math.min(slotCap, dayOverride) : slotCap;
    const remaining = remainingCapacity(cap, params.paidGuestsSlot ?? 0);
    return { remaining, available: remaining >= guests, scope: 'departure' };
  }
  if (dayOverride != null) {
    const remaining = remainingCapacity(dayOverride, params.paidGuestsDay);
    return { remaining, available: remaining >= guests, scope: 'day' };
  }
  const remaining = remainingCapacity(params.fallbackDayCapacity, params.paidGuestsDay);
  return { remaining, available: remaining >= guests, scope: 'day' };
}

export function tourAvailabilityCheckMessages(
  remaining: number,
  guests: number,
  scope: 'day' | 'departure',
  startTimeHm?: string | null
): { title: string; description: string } {
  const spotsWord = remaining === 1 ? 'spot' : 'spots';
  const dep = (startTimeHm ?? '').trim();
  const depPhrase = scope === 'departure' && dep ? ` for the ${dep} departure` : ' this day';
  if (remaining < guests) {
    return {
      title:
        remaining <= 0
          ? scope === 'departure' && dep
            ? `This departure is fully booked`
            : 'This date is fully booked'
          : `Only ${remaining} ${spotsWord} left`,
      description:
        scope === 'departure' && dep
          ? 'Not enough capacity for your party on this departure. Try another time, fewer guests, or another date.'
          : 'Not enough capacity for your party. Try fewer guests or another date.',
    };
  }
  return {
    title: 'This date is available',
    description: `${remaining} ${spotsWord} left${depPhrase} · ${guests} ${guests === 1 ? 'guest' : 'guests'}`,
  };
}
