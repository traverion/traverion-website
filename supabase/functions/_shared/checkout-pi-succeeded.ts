/**
 * Mirror of src/lib/checkout-pi-succeeded.ts for Deno edge runtime.
 */
export function paymentIntentSucceededShouldPromote(params: {
  status?: string | null;
  bookingId?: string | null;
}): boolean {
  if (String(params.status ?? '').trim() !== 'succeeded') return false;
  return Boolean(String(params.bookingId ?? '').trim());
}
