/**
 * Shared Edge bootstrap: resolve Stripe secret + optional publishable consistency.
 * LIVE remains disabled unless STRIPE_LIVE_PAYMENTS_ENABLED is explicitly set.
 */
import {
  assertSecretMatchesPublishable,
  resolveStripeSecretKey,
  type ResolveStripeSecretResult,
  type StripePaymentMode,
} from './stripe-payment-mode.ts';

export type ResolvedStripeMoney =
  | {
      ok: true;
      secret: string;
      mode: StripePaymentMode;
      livePaymentsEnabled: boolean;
    }
  | { ok: false; error: string; status: number };

export function resolveStripeMoneySecretFromEnv(env: {
  get: (key: string) => string | undefined;
}): ResolvedStripeMoney {
  const resolved = resolveStripeSecretKey({
    secret: env.get('STRIPE_SECRET_KEY'),
    livePaymentsEnabledRaw: env.get('STRIPE_LIVE_PAYMENTS_ENABLED'),
  });
  if (!resolved.ok) {
    const status = resolved.code === 'missing_secret' ? 500 : 503;
    return { ok: false, error: resolved.error, status };
  }
  const pub = assertSecretMatchesPublishable({
    secretMode: resolved.mode,
    publishableKey: env.get('VITE_STRIPE_PUBLISHABLE_KEY'),
  });
  if (!pub.ok) {
    return { ok: false, error: pub.error, status: 503 };
  }
  return {
    ok: true,
    secret: resolved.secret,
    mode: resolved.mode,
    livePaymentsEnabled: resolved.livePaymentsEnabled,
  };
}

export type { ResolveStripeSecretResult, StripePaymentMode };
