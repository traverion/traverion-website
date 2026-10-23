/**
 * Traverion supplier premium transform — Phase 01 audit checklist (internal).
 *
 * Routes inspected via codebase inventory:
 * Home, Listings, Create (tour/stay), Availability, Bookings, Reservations,
 * Stay Calendar, Pickup, Inbox, Income & Payouts, Verification, Offers,
 * Reviews, Analytics/Performance, Support, Business/Account settings, Onboarding.
 *
 * Findings addressed in foundation phases:
 * - Inconsistent title scale / hero padding → partner tokens + SupplierPageHero
 * - Sidebar density / active treatment → PartnerSidebar + nav motion tokens
 * - Button/card hover inconsistency → shared transition + shadow tokens
 * - Topbar height bulk → --partner-topbar-h
 * - Income tabs / money typography → tv-income + tabular nums
 * - prefers-reduced-motion gaps → partner shell overrides
 *
 * Preserve: Stripe Connect, earnings ledger, verification lifecycle (be373da7/c28ed1f3),
 * booking/refund engines, listing publish rules.
 */
export const PARTNER_PREMIUM_TRANSFORM_AUDIT = true as const;
