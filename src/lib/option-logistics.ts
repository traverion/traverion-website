export type PickupTiming = 'at_start' | 'before_start';
export type PickupTimeConfirmation = 'at_booking' | 'day_before';
export type OptionDropoffMode = 'same' | 'different' | 'none';
export type OptionTransportMode = 'car' | 'minivan' | 'bus' | 'other';

export type OptionLogistics = {
  fulfillment?: 'pickup' | 'meeting_point' | null;
  pickupTiming?: PickupTiming | null;
  pickupWindowMinutes?: number | null;
  pickupTimeConfirmation?: PickupTimeConfirmation | null;
  dropoffMode?: OptionDropoffMode | null;
  dropoffPlace?: string | null;
  transportMode?: OptionTransportMode | null;
};

const TRANSPORT_LABEL: Record<OptionTransportMode, string> = {
  car: 'Car',
  minivan: 'Minivan',
  bus: 'Bus / coach',
  other: 'Other',
};

/**
 * Traveler-facing logistics. A pickup window is never turned into a clock time.
 * Drop-off is omitted when the option has no drop-off service.
 */
export function optionLogisticsLines(input: OptionLogistics | null | undefined): string[] {
  if (!input) return [];
  const lines: string[] = [];
  if (input.fulfillment === 'pickup') {
    if (input.pickupTiming === 'at_start') {
      lines.push('Pickup is at the departure time.');
    } else if (input.pickupTiming === 'before_start' && input.pickupWindowMinutes && input.pickupWindowMinutes >= 5) {
      lines.push(`Pickup window: up to ${input.pickupWindowMinutes} minutes before departure.`);
      if (input.pickupTimeConfirmation === 'at_booking') {
        lines.push('The exact pickup time is confirmed when the booking is confirmed.');
      } else if (input.pickupTimeConfirmation === 'day_before') {
        lines.push('The exact pickup time is confirmed the day before the activity.');
      }
    }
  }
  if (input.dropoffMode === 'same') {
    lines.push('Drop-off is at the same place.');
  } else if (input.dropoffMode === 'different') {
    const place = (input.dropoffPlace ?? '').trim();
    if (place) lines.push(`Drop-off: ${place}`);
  }
  if (input.transportMode && TRANSPORT_LABEL[input.transportMode]) {
    lines.push(`Transport: ${TRANSPORT_LABEL[input.transportMode]}`);
  }
  return lines;
}

export function readOptionLogistics(raw: unknown): OptionLogistics | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  const out: OptionLogistics = {};
  if (v.fulfillment === 'pickup' || v.fulfillment === 'meeting_point') out.fulfillment = v.fulfillment;
  if (v.pickupTiming === 'at_start' || v.pickupTiming === 'before_start') out.pickupTiming = v.pickupTiming;
  if (typeof v.pickupWindowMinutes === 'number' && v.pickupWindowMinutes >= 5 && v.pickupWindowMinutes <= 180) {
    out.pickupWindowMinutes = Math.round(v.pickupWindowMinutes);
  }
  if (v.pickupTimeConfirmation === 'at_booking' || v.pickupTimeConfirmation === 'day_before') {
    out.pickupTimeConfirmation = v.pickupTimeConfirmation;
  }
  if (v.dropoffMode === 'same' || v.dropoffMode === 'different' || v.dropoffMode === 'none') {
    out.dropoffMode = v.dropoffMode;
  }
  if (typeof v.dropoffPlace === 'string' && v.dropoffPlace.trim()) out.dropoffPlace = v.dropoffPlace.trim();
  if (v.transportMode === 'car' || v.transportMode === 'minivan' || v.transportMode === 'bus' || v.transportMode === 'other') {
    out.transportMode = v.transportMode;
  }
  return out;
}
