# Traverion — Phase 1065

**Mission:** Marketplace completeness continuum after Phase 1050  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **124** (no new migration)

---

## Problem

Stay house check-in/out wall times (`stay.checkInTime` / `checkOutTime`) were never frozen onto `purchase_snapshot`. Partner Bookings showed live listing times; Trips had none. A host edit after purchase rewrote ops while travelers never saw the purchased house clock.

## Fix

1. `resolveStayFieldsForSnapshot` + `buildPurchaseSnapshot` capture `checkInTime` / `checkOutTime`.
2. Display helpers prefer snapshot (no live fallthrough when snap exists).
3. Trips + partner Bookings render snapshotted house times.

## Certification

- AUTOMATED-TESTED: `purchase-snapshot.test.ts`
- Deployed: `create-booking-checkout-session`
