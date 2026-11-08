/**
 * Deno mirror of src/lib/stripe-payment-mode.ts — keep behavior identical.
 * LIVE is never inferred from key material alone.
 */

export type StripePaymentMode = 'test' | 'live';

export type StripeModeRejectCode =
  | 'missing_secret'
  | 'invalid_secret'
  | 'live_disabled'
  | 'live_requires_live_secret'
  | 'test_requires_test_secret'
  | 'missing_publishable'
  | 'invalid_publishable'
  | 'publishable_mode_mismatch'
  | 'livemode_mismatch'
  | 'account_mismatch';

export function isStripeTestSecretKey(secret: string | null | undefined): boolean {
  return (secret ?? '').trim().startsWith('sk_test_');
}

export function isStripeLiveSecretKey(secret: string | null | undefined): boolean {
  return (secret ?? '').trim().startsWith('sk_live_');
}

export function isStripeTestPublishableKey(key: string | null | undefined): boolean {
  return (key ?? '').trim().startsWith('pk_test_');
}

export function isStripeLivePublishableKey(key: string | null | undefined): boolean {
  return (key ?? '').trim().startsWith('pk_live_');
}

export function isStripeLivePaymentsEnabledFlag(raw: string | null | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function stripeLiveSecretBlockedMessage(): string {
  return 'Stripe LIVE payments are disabled on Traverion. Set STRIPE_LIVE_PAYMENTS_ENABLED=1 and use matching LIVE credentials only after founder approval.';
}

export function stripeLivePublishableBlockedMessage(): string {
  return 'Stripe LIVE publishable keys are disabled on Traverion. Keep pk_test_ until LIVE payments are explicitly enabled.';
}

export function stripeModeMismatchMessage(detail: string): string {
  return `Stripe payment mode misconfigured: ${detail}`;
}

export function secretKeyMode(secret: string | null | undefined): StripePaymentMode | null {
  if (isStripeTestSecretKey(secret)) return 'test';
  if (isStripeLiveSecretKey(secret)) return 'live';
  return null;
}

export function publishableKeyMode(key: string | null | undefined): StripePaymentMode | null {
  if (isStripeTestPublishableKey(key)) return 'test';
  if (isStripeLivePublishableKey(key)) return 'live';
  return null;
}

export type ResolveStripeSecretResult =
  | { ok: true; mode: StripePaymentMode; secret: string; livePaymentsEnabled: boolean }
  | { ok: false; error: string; code: StripeModeRejectCode };

export function resolveStripeSecretKey(input: {
  secret: string | null | undefined;
  livePaymentsEnabledRaw: string | null | undefined;
}): ResolveStripeSecretResult {
  const livePaymentsEnabled = isStripeLivePaymentsEnabledFlag(input.livePaymentsEnabledRaw);
  const secret = (input.secret ?? '').trim();
  if (!secret) {
    return { ok: false, error: 'STRIPE_SECRET_KEY not configured', code: 'missing_secret' };
  }
  const mode = secretKeyMode(secret);
  if (!mode) {
    return {
      ok: false,
      error: 'STRIPE_SECRET_KEY must be sk_test_… or sk_live_…',
      code: 'invalid_secret',
    };
  }
  if (mode === 'live' && !livePaymentsEnabled) {
    return { ok: false, error: stripeLiveSecretBlockedMessage(), code: 'live_disabled' };
  }
  if (livePaymentsEnabled && mode !== 'live') {
    return {
      ok: false,
      error: stripeModeMismatchMessage(
        'STRIPE_LIVE_PAYMENTS_ENABLED is on but STRIPE_SECRET_KEY is not sk_live_…'
      ),
      code: 'live_requires_live_secret',
    };
  }
  return { ok: true, mode, secret, livePaymentsEnabled };
}

export function assertSecretMatchesPublishable(input: {
  secretMode: StripePaymentMode;
  publishableKey: string | null | undefined;
}): { ok: true } | { ok: false; error: string; code: StripeModeRejectCode } {
  const pk = (input.publishableKey ?? '').trim();
  if (!pk) return { ok: true };
  const pkMode = publishableKeyMode(pk);
  if (!pkMode) {
    return { ok: false, error: 'Invalid VITE_STRIPE_PUBLISHABLE_KEY prefix', code: 'invalid_publishable' };
  }
  if (pkMode !== input.secretMode) {
    return {
      ok: false,
      error: stripeModeMismatchMessage(
        `secret mode (${input.secretMode}) does not match publishable mode (${pkMode})`
      ),
      code: 'publishable_mode_mismatch',
    };
  }
  return { ok: true };
}

export type WebhookSecretCandidate = { mode: StripePaymentMode; secret: string };

export function webhookSigningSecrets(input: {
  livePaymentsEnabled: boolean;
  webhookSecret: string | null | undefined;
  webhookSecretLive?: string | null | undefined;
  webhookSecretTest?: string | null | undefined;
}): { ok: true; candidates: WebhookSecretCandidate[] } | { ok: false; error: string } {
  const primary = (input.webhookSecret ?? '').trim();
  const live = (input.webhookSecretLive ?? '').trim();
  const testExplicit = (input.webhookSecretTest ?? '').trim();
  const candidates: WebhookSecretCandidate[] = [];

  if (input.livePaymentsEnabled) {
    const liveSecret = live || primary;
    if (!liveSecret) {
      return {
        ok: false,
        error: 'STRIPE_WEBHOOK_SECRET_LIVE (or STRIPE_WEBHOOK_SECRET) required when LIVE payments are enabled',
      };
    }
    candidates.push({ mode: 'live', secret: liveSecret });
    const testSecret = testExplicit || (live && primary ? primary : '');
    if (testSecret && testSecret !== liveSecret) {
      candidates.push({ mode: 'test', secret: testSecret });
    }
  } else {
    const testSecret = testExplicit || primary;
    if (!testSecret) {
      return { ok: false, error: 'STRIPE_WEBHOOK_SECRET not configured' };
    }
    candidates.push({ mode: 'test', secret: testSecret });
  }

  return { ok: true, candidates };
}

export function stripeEventLivemodeDecision(input: {
  eventLivemode: boolean;
  platformMode: StripePaymentMode;
}): { action: 'accept' } | { action: 'ignore'; reason: 'livemode_mismatch' } {
  const eventMode: StripePaymentMode = input.eventLivemode ? 'live' : 'test';
  if (eventMode !== input.platformMode) {
    return { action: 'ignore', reason: 'livemode_mismatch' };
  }
  return { action: 'accept' };
}

export function stripeEventAccountDecision(input: {
  expectedAccountId: string | null | undefined;
  eventAccountId: string | null | undefined;
}): { action: 'accept' } | { action: 'ignore'; reason: 'account_mismatch' } {
  const expected = (input.expectedAccountId ?? '').trim();
  if (!expected) return { action: 'accept' };
  const got = (input.eventAccountId ?? '').trim();
  if (!got || got !== expected) {
    return { action: 'ignore', reason: 'account_mismatch' };
  }
  return { action: 'accept' };
}
