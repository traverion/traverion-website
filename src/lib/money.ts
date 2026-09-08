/**
 * Single currency formatter for traveler + partner surfaces.
 * Source of truth for a price is the ISO code on that record (listing, quote, or booking).
 * Do not infer € from locale or swap symbols without the stored code.
 */

export const DEFAULT_CURRENCY = 'EUR';

const ISO4217 = /^[A-Z]{3}$/;

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

export function isStripeTestPublishableKey(key: string | null | undefined): boolean {
  return (key ?? '').trim().startsWith('pk_test_');
}

export function appStripeIsTestMode(): boolean {
  return isStripeTestPublishableKey(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
}
