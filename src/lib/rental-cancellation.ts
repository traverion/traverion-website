/**
 * Shared rental cancellation labels.
 * Windows are stored with the listing. Traverion does not automatically refund rentals.
 */

export const RENTAL_CANCELLATION_REFUND_NOTE =
  'A cancellation request is not a guaranteed refund. Traverion does not issue automatic rental refunds.';

export const RENTAL_CANCELLATION_PRESETS = [
  {
    id: 'flexible_24h',
    title: 'Flexible',
    /** Bolded in the creator UI. */
    deadline: '24 hours',
    body: 'Customers may request cancellation until 24 hours before pickup.',
  },
  {
    id: 'moderate_72h',
    title: 'Moderate',
    deadline: '72 hours',
    body: 'Customers may request cancellation until 72 hours before pickup.',
  },
  {
    id: 'firm_7d',
    title: 'Firm',
    deadline: '7 days',
    body: 'Customers may request cancellation until 7 days before pickup.',
  },
] as const;

export type RentalCancellationPresetId = (typeof RENTAL_CANCELLATION_PRESETS)[number]['id'];

export function isRentalCancellationPreset(id: string | null | undefined): id is RentalCancellationPresetId {
  return RENTAL_CANCELLATION_PRESETS.some((preset) => preset.id === id);
}

export function rentalCancellationById(id: string | null | undefined) {
  return RENTAL_CANCELLATION_PRESETS.find((preset) => preset.id === id) ?? null;
}

/** Customer-facing sentence. Never returns a raw preset id. */
export function rentalCancellationCustomerText(id: string | null | undefined): string {
  const hit = rentalCancellationById(id);
  if (!hit) {
    return `Cancellation terms were not stored with this rental. ${RENTAL_CANCELLATION_REFUND_NOTE}`;
  }
  return `${hit.title}. ${hit.body} ${RENTAL_CANCELLATION_REFUND_NOTE}`;
}

/** Compact checkout line — full policy stays in rentalCancellationCustomerText. */
export function rentalCancellationShortSummary(id: string | null | undefined): string {
  const hit = rentalCancellationById(id);
  if (!hit) return 'Cancellation terms apply to this rental.';
  return `${hit.title} · request until ${hit.deadline} before pickup`;
}
