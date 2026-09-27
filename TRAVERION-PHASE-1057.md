# Traverion — Phase 1057–1058

**Mission:** Follow-up on post-1050 marketplace audits  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **124**

---

## Phase 1057 — Browse date filter honors booking cutoff (P0)

**Problem:** Tour catalog with a date set used `listingRunsOnDate` only (weekday/season). Tours past `bookingCutoffHoursBeforeStart` still appeared, then failed on TourDetails/quote.

**Fix:** `listingHasBookableDepartureOnDate` — requires ≥1 selling departure still bookable in listing TZ (same as PDP chips). Packages browse uses it for `runsOnDate`.

**Certification:** AUTOMATED-TESTED (`booking-quote.test.ts`).

## Phase 1058 — Snapshotted fulfillment + duration on Trips / partner

**Problem:** Trips always labeled “Meeting point”; partner Bookings/Today used “Meet ·” and live listing duration.

**Fix:** `displayFulfillmentFromPurchase` → Pickup area / Meeting point (Trips) and Pickup/Meet prefix (Bookings + Dashboard Today). Duration prefers purchase snapshot.

**Certification:** CODE-INSPECTED.

## Audit sources

Marketplace browse cutoff from [Repo audit](f5f57d9a-0f60-48b9-85b7-1ee0e45d86e9); support/contact/stay/TZ items already closed in 1051–1056 ([lifecycle audit](ab8b1c5f-2dfd-48e2-a7ce-539daae123e8)). Tour pickup/meeting field split remains next product completeness item ([tour fields audit](3710f0d7-098d-44f0-a9ce-78d52bc82e97)).
