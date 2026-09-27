# Traverion — Phase 1069

**Mission:** Marketplace completeness continuum after Phase 1050  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **124** (no new migration)

---

## Problem

1. Partner Bookings CSV, messaging thread, and cancel-notify caller still passed **live** listing titles — after a rename, exports/ops disagreed with Trips/emails (purchase snapshot).
2. Stay partner Booking detail showed house times but not purchased **check-in address** or **house rules**, so hosts operated from current listing extras while travelers/emails used the freeze.
3. Pickup planner titles + duration similarly preferred live listing over purchased truth.

## Fix

- Prefer `displayListingTitleFromPurchase` for Bookings CSV, message thread, cancel notify, Pickup cards/CSV/detail.
- Prefer purchased duration on Pickup detail.
- Surface check-in address + house rules from `purchase_snapshot` on stay Booking detail.

## Certification

- AUTOMATED-TESTED: `partner-bookings-csv.test.ts`, `purchase-snapshot.test.ts`
- Typecheck: `tsc -p tsconfig.app.json --noEmit`
