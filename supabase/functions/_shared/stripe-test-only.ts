/** Traverion checkout must stay on Stripe TEST until the founder enables LIVE deliberately. */
export function isStripeTestSecretKey(secret: string | null | undefined): boolean {
  return (secret ?? '').trim().startsWith('sk_test_');
}

export function stripeLiveSecretBlockedMessage(): string {
  return 'Stripe LIVE secret keys are blocked on Traverion. Use a TEST secret (sk_test_…).';
}
