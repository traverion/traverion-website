import { invalidateLatestBookingMessageCache } from './supabase-booking-ops';
import { invalidateSupplierBookingsCache } from './supabase-bookings';
import { invalidateMyListingsCache } from './supabase-listings';
import { invalidateResolvedSupplierId } from './supabase-supplier-team';
import { clearPartnerBookingsDeskPrefetch } from '../lib/partner-bookings-desk-prefetch';

/** Drop account-scoped partner reads. Call on sign-out so the next account cannot reuse them. */
export function clearPartnerScopedCaches(): void {
  invalidateResolvedSupplierId();
  invalidateSupplierBookingsCache();
  invalidateMyListingsCache();
  invalidateLatestBookingMessageCache();
  clearPartnerBookingsDeskPrefetch();
}
