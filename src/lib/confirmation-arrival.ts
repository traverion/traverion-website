export type ConfirmationArrival = {
  label: 'Pickup location' | 'Meeting point';
  /** Saved place. Null when the booking does not have one yet. */
  value: string | null;
  /** Saved pickup time. Never invented, and never shown for a meeting point. */
  time: string | null;
};

function placeOfStay(notes: string | null | undefined): string {
  const line = (notes ?? '')
    .split(/\n+/)
    .map((part) => part.trim())
    .find((part) => /^place of stay:/i.test(part));
  return line ? line.replace(/^place of stay:/i, '').trim() : '';
}

function clock(raw: string | null | undefined): string | null {
  const hm = (raw ?? '').trim().slice(0, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hm) ? hm : null;
}

/**
 * Confirmation logistics from the purchased option.
 * A pickup booking shows the traveler's saved location, not the supplier meeting point.
 * A meeting-point booking shows that address and never a hotel search result.
 */
export function confirmationArrival(input: {
  fulfillment: 'pickup' | 'meeting_point' | null;
  meetingPoint?: string | null;
  specialRequests?: string | null;
  pickupTime?: string | null;
  travelerPickupAddress?: string | null;
}): ConfirmationArrival | null {
  const meeting = (input.meetingPoint ?? '').trim();
  const stay = (input.travelerPickupAddress ?? '').trim() || placeOfStay(input.specialRequests);
  const time = clock(input.pickupTime);

  if (input.fulfillment === 'pickup') {
    return {
      label: 'Pickup location',
      value: stay.length >= 3 ? stay : null,
      time,
    };
  }
  if (input.fulfillment === 'meeting_point') {
    return {
      label: 'Meeting point',
      value: meeting || null,
      time: null,
    };
  }
  if (meeting) {
    return { label: 'Meeting point', value: meeting, time: null };
  }
  if (stay.length >= 3) {
    return { label: 'Pickup location', value: stay, time };
  }
  return null;
}
