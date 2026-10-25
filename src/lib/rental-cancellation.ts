/**
 * Shared rental cancellation labels.
 * Windows are stored with the listing. Traverion does not automatically refund rentals.
 */

export const RENTAL_CANCELLATION_PRESETS = [
  {
    id: 'flexible_24h',
    title: 'Flexible',
    body: 'Customers may request cancellation until 24 hours before pickup. Traverion does not issue automatic rental refunds.',
  },
  {
    id: 'moderate_72h',
    title: 'Moderate',
    body: 'Customers may request cancellation until 72 hours before pickup. Traverion does not issue automatic rental refunds.',
  },
  {
    id: 'firm_7d',
    title: 'Firm',
    body: 'Customers may request cancellation until 7 days before pickup. Traverion does not issue automatic rental refunds.',
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
    return 'Cancellation terms were not stored with this rental. Traverion does not issue automatic rental refunds.';
  }
  return `${hit.title}. ${hit.body}`;
}
