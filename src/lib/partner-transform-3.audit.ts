/**
 * Traverion Supplier Premium Transform 3.0 — Phase 01 complete platform audit.
 *
 * Source of truth: `partnerNav.ts`, `SupplierLayout.tsx` section switch,
 * `partnerPortalPaths.ts`, `partner-analytics.ts`, listing-creation workspaces.
 * No booking / ledger / Connect logic changed in this audit artifact.
 */

/** Canonical authenticated app sections under `/partner/*`. */
export const TRANSFORM3_SUPPLIER_ROUTES = [
  { id: 'dashboard', path: '/partner', title: 'Home', page: 'SupplierDashboard' },
  { id: 'listings', path: '/partner/listings', title: 'Listings', page: 'SupplierListings' },
  { id: 'inbox', path: '/partner/inbox', title: 'Inbox', page: 'SupplierInbox' },
  { id: 'bookings', path: '/partner/bookings', title: 'Tour Bookings', page: 'SupplierBookings(tour)' },
  {
    id: 'availability',
    path: '/partner/availability',
    title: 'Departures & Availability',
    page: 'SupplierAvailability',
  },
  { id: 'pickup', path: '/partner/pickup', title: 'Pickups', page: 'SupplierPickupPlanner' },
  {
    id: 'reservations',
    path: '/partner/reservations',
    title: 'Stay Reservations',
    page: 'SupplierBookings(stay)',
  },
  {
    id: 'stay-calendar',
    path: '/partner/stay-calendar',
    title: 'Stay Calendar',
    page: 'SupplierStayCalendar',
  },
  { id: 'earnings', path: '/partner/earnings', title: 'Income & Payouts', page: 'SupplierEarnings' },
  {
    id: 'verification',
    path: '/partner/verification',
    title: 'Verification',
    page: 'SupplierVerificationPage',
  },
  {
    id: 'performance',
    path: '/partner/performance',
    title: 'Analytics',
    page: 'SupplierPerformance',
  },
  { id: 'reviews', path: '/partner/reviews', title: 'Reviews', page: 'SupplierReviews' },
  { id: 'discounts', path: '/partner/discounts', title: 'Offers', page: 'SupplierDiscountsOffers' },
  { id: 'support', path: '/partner/support', title: 'Support', page: 'PartnerSupportPage' },
  { id: 'help', path: '/partner/help', title: 'Support (legacy alias)', page: 'PartnerSupportPage' },
  {
    id: 'business-profile',
    path: '/partner/business-profile',
    title: 'Settings',
    page: 'SupplierSettingsPages / BusinessProfilePage',
  },
  {
    id: 'account-settings',
    path: '/partner/account-settings',
    title: 'Account',
    page: 'SupplierSettingsPages',
  },
  { id: 'create', path: '/partner/create', title: 'Create listing', page: 'PartnerCreateListingPage' },
  { id: 'onboarding', path: '/partner/onboarding', title: 'Get ready', page: 'PartnerOnboarding' },
  {
    id: 'change-password',
    path: '/partner/change-password',
    title: 'Password',
    page: 'SupplierChangePassword',
  },
] as const;

/** Auth / host entry surfaces (outside main shell section switch). */
export const TRANSFORM3_AUTH_AND_ENTRY = [
  '/login',
  '/signup',
  '/reset-password',
  '/email-verified',
  '/for-partners',
] as const;

/** Nested tabs / desks discovered in pages (not separate routes). */
export const TRANSFORM3_NESTED_SURFACES = [
  'Income: Overview | Earnings | Payouts | Documents | Settings',
  'Analytics: Summary | Sales | Bookings | Customers | Supplier Score',
  'Settings: company / legal / team / payout deep-links into Income Settings',
  'Listings: Live | Draft filters + create tour/stay chooser + row action menus',
  'Bookings/Reservations: filters, expand cards, TourOps/StayOps detail panels',
  'Availability: Agenda | Week | Month + bulk/individual editors',
  'Stay Calendar: Agenda | Week | Month + property selector',
  'Pickup: date range, departure cards, manage-pickups expanders',
  'Inbox: thread list + chat + InboxBookingPanel',
  'Offers: cards + DiscountOfferWizardModal',
  'Verification: intro | wizard | status (Connect lifecycle)',
  'Tour creator: Basics → options → schedule → media → preview/publish',
  'Stay creator: StayOnboardingFlow nested steps + one-night earnings example',
] as const;

/** Shared shell / UI primitives to keep consistent (no duplicates). */
export const TRANSFORM3_SHARED_FOUNDATION = [
  'SupplierLayout + PartnerSidebar + partner bottom nav',
  'supplierUi: SupplierPageHero, modals, empty states, section headers',
  'PartnerConfirmModal, PartnerSelect, PartnerTimeSelect',
  'TourOpsBookingCard / StayOpsReservationCard / BookingOps* panels',
  'listing-creation workspace tokens (.listing-creation-*)',
  'index.css partner-app-shell tokens (--partner-*)',
] as const;

/**
 * Phase checklist — every route must show visible improvement by Phase 25.
 * Status is updated as Transform 3.0 commits land.
 */
export const TRANSFORM3_PHASE_CHECKLIST = {
  '01_audit': 'done',
  '02_foundation': 'done',
  '03_controls': 'done',
  '04_sidebar': 'done',
  '05_page_structure': 'done',
  '06_home': 'done',
  '07_listings': 'done',
  '08_inbox': 'done',
  '09_tour_bookings': 'done',
  '10_availability': 'done',
  '11_pickups': 'done',
  '12_stay_reservations': 'done',
  '13_stay_calendar': 'done',
  '14_income': 'done',
  '15_analytics': 'done',
  '16_reviews': 'done',
  '17_offers': 'done',
  '18_settings': 'done',
  '19_support': 'done',
  '20_tour_creator': 'done',
  '21_stay_creator': 'done',
  '22_overlays': 'done',
  '23_responsive': 'done',
  '24_motion_a11y': 'done',
  '25_delivery': 'done',
} as const;

/** Priority inconsistencies observed before Transform 3.0 implementation. */
export const TRANSFORM3_AUDIT_FINDINGS = [
  'Page title weight/scale still varies between tv-* page systems and partner-page-title',
  'Income / Analytics / Reviews / Offers use parallel CSS namespaces needing token alignment',
  'Tour booking cards still lead with long product titles before departure time',
  'Inbox empty pane improved but thread/composer density can go further',
  'Listings long titles can dominate row identity — need stronger truncation hierarchy',
  'Pickup departure cards need clearer urgency vs meeting-point-only states',
  'Stay calendar cell density and selected-day states need cohesive polish',
  'Creator workspaces still feel form-heavy on some steps',
  'Modal padding and action alignment not fully unified across Confirm vs detail drawers',
  'Must preserve Period Sales vs Period Earnings semantics and Connect lifecycle',
] as const;

export const PARTNER_TRANSFORM_3_AUDIT = true as const;
