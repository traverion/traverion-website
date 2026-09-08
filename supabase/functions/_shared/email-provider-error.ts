/** Client-safe email failures. Do not forward provider/auth text. */

export const EMAIL_PROVIDER_UNAVAILABLE =
  'Email could not be sent. Delivery is not available right now.';

export function clientErrorForEmailProvider(_status: number, _providerMessage: unknown): string {
  return EMAIL_PROVIDER_UNAVAILABLE;
}
