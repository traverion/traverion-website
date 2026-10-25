import { supabase } from '../lib/supabase';

/**
 * Server reads RENTAL_CHECKOUT_ENABLED. A client flag must not enable payment.
 * Any error, including an older function that does not understand the probe, stays closed.
 */
export async function fetchRentalCheckoutCapability(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.functions.invoke('create-booking-checkout-session', {
      body: { intent: 'rental_checkout_capability' },
    });
    if (error || !data || typeof data !== 'object') return false;
    const row = data as { success?: unknown; rentalCheckoutEnabled?: unknown };
    return row.success === true && row.rentalCheckoutEnabled === true;
  } catch {
    return false;
  }
}
