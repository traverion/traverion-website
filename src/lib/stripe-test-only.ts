/** Client mirror of edge Stripe TEST-only guard (documentation + unit cert). */
export function isStripeTestSecretKey(secret: string | null | undefined): boolean {
  return (secret ?? '').trim().startsWith('sk_test_');
}

export function stripeLiveSecretBlockedMessage(): string {
  return 'Stripe LIVE secret keys are blocked on Traverion. Use a TEST secret (sk_test_…).';
}
