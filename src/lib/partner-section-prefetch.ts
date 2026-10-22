/**
 * Warm Partner section JS chunks on nav intent (hover/focus) so section
 * switches avoid blank Suspense flashes when the chunk is cold.
 */

import type { PartnerNavSectionId } from './partnerNav';
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

/** Prefetch the lazy Partner page module for a sidebar/section id. */
export function prefetchPartnerSection(section: string): void {
  const id = section as PartnerNavSectionId;
  switch (id) {
    case 'dashboard':
      warm(id, () => import('../pages/supplier/SupplierDashboard'));
      break;
    case 'listings':
      warm(id, () => import('../pages/supplier/SupplierListings'));
      break;
    case 'bookings':
    case 'reservations':
      warm(id, () => import('../pages/supplier/SupplierBookings'));
      break;
    case 'availability':
      warm(id, () => import('../pages/supplier/SupplierAvailability'));
      break;
    case 'stay-calendar':
      warm(id, () => import('../pages/supplier/SupplierStayCalendar'));
      break;
    case 'inbox':
      warm(id, () => import('../pages/supplier/SupplierInbox'));
      break;
    case 'earnings':
      warm(id, () => import('../pages/supplier/SupplierEarnings'));
      break;
    case 'performance':
      warm(id, () => import('../pages/supplier/SupplierPerformance'));
      break;
    case 'reviews':
      warm(id, () => import('../pages/supplier/SupplierReviews'));
      break;
    case 'pickup':
      warm(id, () => import('../pages/supplier/SupplierPickupPlanner'));
      break;
    case 'discounts':
      warm(id, () => import('../pages/supplier/SupplierDiscountsOffers'));
      break;
    case 'create':
      warm(id, () => import('../pages/supplier/PartnerCreateListingPage'));
      break;
    case 'support':
    case 'help':
      warm('support', () => import('../pages/supplier/PartnerSupportPage'));
      break;
    case 'business-profile':
    case 'account-settings':
      warm('settings', () => import('../components/supplier/SupplierSettingsPages'));
      break;
    case 'onboarding':
      warm(id, () => import('../pages/supplier/PartnerOnboarding'));
      break;
    default:
      break;
  }
}
