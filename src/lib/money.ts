/**
 * Single currency formatter for traveler + partner surfaces.
 * Source of truth for a price is the ISO code on that record (listing, quote, or booking).
 * Do not infer € from locale or swap symbols without the stored code.
 */

import {
  isStripeLivePaymentsEnabledFlag,
  isStripeLivePublishableKey,
  isStripeTestPublishableKey,
  resolveStripePublishableKey,
} from './stripe-payment-mode';

export {
  isStripeTestPublishableKey,
  isStripeLivePublishableKey,
  isStripeLivePaymentsEnabledFlag,
  resolveStripePublishableKey,
};

export const DEFAULT_CURRENCY = 'EUR';

/** Stripe-supported codes Traverion will charge. Do not expose arbitrary ISO codes in Partner UI. */
export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK', 'CHF', 'CAD', 'AUD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const ISO4217 = /^[A-Z]{3}$/;

export function isSupportedCurrency(raw: string | null | undefined): raw is SupportedCurrency {
  const c = (raw ?? '').trim().toUpperCase();
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c);
}

export function normalizeCurrency(raw: string | null | undefined): string {
  const c = (raw ?? '').trim().toUpperCase();
  return ISO4217.test(c) ? c : DEFAULT_CURRENCY;
}

export function formatMoney(amount: number | null | undefined, currency?: string | null): string {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  const code = normalizeCurrency(currency);
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: Number.isInteger(safe) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${code} ${safe.toFixed(Number.isInteger(safe) ? 0 : 2)}`;
  }
}

export function isStripeTestCheckoutSession(sessionId: string | null | undefined): boolean {
  return (sessionId ?? '').trim().startsWith('cs_test_');
}

export function isStripeLiveCheckoutSession(sessionId: string | null | undefined): boolean {
  return (sessionId ?? '').trim().startsWith('cs_live_');
}

/** True when the configured publishable key is TEST (default production posture). */
export function appStripeIsTestMode(): boolean {
  return isStripeTestPublishableKey(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
}

/**
 * Traveler checkout may proceed only when publishable key mode matches the
 * explicit VITE_STRIPE_LIVE_PAYMENTS_ENABLED flag (LIVE off by default).
 */
export function appStripeCheckoutAllowed():
  | { ok: true }
  | { ok: false; error: string } {
  const resolved = resolveStripePublishableKey({
    publishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
    livePaymentsEnabledRaw: import.meta.env.VITE_STRIPE_LIVE_PAYMENTS_ENABLED,
  });
  if (resolved.ok) return { ok: true };
  return { ok: false, error: resolved.error };
}

export function appStripeLivePaymentsEnabled(): boolean {
  return isStripeLivePaymentsEnabledFlag(import.meta.env.VITE_STRIPE_LIVE_PAYMENTS_ENABLED);
}
