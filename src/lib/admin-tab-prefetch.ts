/**
 * Warm Admin panel chunks on nav intent (hover/focus).
 * Never prefetches booking/PII payloads — JS modules only.
 */

import { shouldPrefetchRoutes } from './routePrefetch';

const warmed = new Set<string>();

function warm(id: string, loader: () => Promise<unknown>): void {
  if (!shouldPrefetchRoutes()) return;
  if (warmed.has(id)) return;
  warmed.add(id);
  void loader().catch(() => {
    warmed.delete(id);
  });
}

/** Prefetch the lazy Admin panel module for a tab id. */
export function prefetchAdminTab(tab: string): void {
  switch (tab) {
    case 'bookings':
      warm(tab, () => import('../components/admin/AdminBookingsPanel'));
      break;
    case 'finance':
      warm(tab, () => import('../components/admin/AdminFinancePanel'));
      break;
    case 'commercial':
      warm(tab, () => import('../components/admin/AdminCommercialPanel'));
      break;
    case 'listings':
      warm(tab, () => import('../components/admin/AdminListingsModerationPanel'));
      break;
    case 'suppliers':
      warm(tab, () => import('../components/admin/AdminSupplierVerificationPanel'));
      break;
    case 'past_verifications':
      warm(tab, () => import('../components/admin/AdminPastVerificationsPanel'));
      break;
    case 'inquiries':
      warm(tab, () => import('../components/admin/AdminInquiriesPanel'));
      break;
    case 'reports':
      warm(tab, () => import('../components/admin/AdminContentReportsPanel'));
      break;
    case 'portal_messages':
      warm(tab, () => import('../components/admin/AdminSupplierPortalMessagesPanel'));
      break;
    default:
      break;
  }
}
