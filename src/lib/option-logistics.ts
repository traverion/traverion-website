export type PickupTiming = 'at_start' | 'before_start';
export type PickupTimeConfirmation = 'at_booking' | 'day_before';
export type OptionDropoffMode = 'same' | 'different' | 'none';

export const TRANSPORT_VEHICLES = [
  { value: 'car', label: 'Car' },
  { value: 'minivan', label: 'Minivan' },
  { value: 'van', label: 'Van / shuttle' },
  { value: 'bus', label: 'Bus / coach' },
  { value: 'suv', label: 'SUV / 4×4' },
  { value: 'limousine', label: 'Limousine' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'boat', label: 'Boat' },
  { value: 'other', label: 'Other' },
] as const;

export type TransportVehicleMode = (typeof TRANSPORT_VEHICLES)[number]['value'];
export type OptionTransportMode = TransportVehicleMode | 'none';

const TRANSPORT_LABEL: Record<TransportVehicleMode, string> = {
  car: 'Car',
  minivan: 'Minivan',
  van: 'Van / shuttle',
  bus: 'Bus / coach',
  suv: 'SUV / 4×4',
  limousine: 'Limousine',
  motorcycle: 'Motorcycle',
  boat: 'Boat',
  other: 'Other',
};

export function isTransportVehicleMode(value: unknown): value is TransportVehicleMode {
  return typeof value === 'string' && value in TRANSPORT_LABEL;
}

/** Traveler-facing vehicle. "No transportation" and an empty choice produce no label. */
export function transportVehicleLabel(mode: unknown, other?: string | null): string | null {
  if (!isTransportVehicleMode(mode)) return null;
  if (mode === 'other') {
    const custom = (other ?? '').trim();
    return custom || 'Other';
  }
  return TRANSPORT_LABEL[mode];
}

export type OptionLogistics = {
  fulfillment?: 'pickup' | 'meeting_point' | null;
  pickupTiming?: PickupTiming | null;
  pickupWindowMinutes?: number | null;
  pickupTimeConfirmation?: PickupTimeConfirmation | null;
  dropoffMode?: OptionDropoffMode | null;
  dropoffPlace?: string | null;
  transportMode?: OptionTransportMode | null;
  transportOther?: string | null;
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
  const vehicle = transportVehicleLabel(input.transportMode, input.transportOther);
  if (vehicle) lines.push(`Transport: ${vehicle}`);
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
  if (isTransportVehicleMode(v.transportMode) || v.transportMode === 'none') out.transportMode = v.transportMode;
  if (typeof v.transportOther === 'string' && v.transportOther.trim()) {
    out.transportOther = v.transportOther.trim();
  }
  return out;
}
