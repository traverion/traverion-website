import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { isStripeTestPublishableKey } from './stripe-test-only';

let stripePromise: Promise<Stripe | null> | null = null;

/** TEST-only Stripe.js instance for tokenization (never LIVE). */
export function getTraverionStripeJs(): Promise<Stripe | null> {
  if (!stripePromise) {
    const pk =
      typeof import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY === 'string'
        ? import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY.trim()
        : '';
    if (!pk || !isStripeTestPublishableKey(pk)) {
      stripePromise = Promise.resolve(null);
    } else {
      stripePromise = loadStripe(pk);
    }
  }
  return stripePromise;
}

export async function createBankAccountToken(input: {
  country: string;
  currency: string;
  accountNumber: string;
  accountHolderName: string;
  accountHolderType: 'company' | 'individual';
}): Promise<{ tokenId: string } | { error: string }> {
  const stripe = await getTraverionStripeJs();
  if (!stripe) {
    return { error: 'Payment configuration is unavailable. Contact Traverion support.' };
  }
  const result = await stripe.createToken('bank_account', {
    country: input.country.toUpperCase().slice(0, 2),
    currency: input.currency.toLowerCase(),
    account_number: input.accountNumber.replace(/\s+/g, ''),
    account_holder_name: input.accountHolderName.trim(),
    account_holder_type: input.accountHolderType,
  });
  if (result.error || !result.token?.id) {
    return { error: result.error?.message || 'Could not secure bank details. Check the account number and try again.' };
  }
  return { tokenId: result.token.id };
}
