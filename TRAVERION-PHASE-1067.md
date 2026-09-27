# Traverion — Phase 1067

**Mission:** Marketplace completeness continuum after Phase 1050  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **124** (no new migration)

---

## Problem

Stay `houseRules` were never frozen onto `purchase_snapshot`. Trips “View stay” opened the live PDP (`StayDetails`), so a host edit after purchase could rewrite guest-facing house rules (and clocks) even though Trips already showed snapshotted house times (1065).

## Fix

1. `resolveStayFieldsForSnapshot` + checkout freeze `houseRules` (max 2000 chars, same as listing extras).
2. Trips shows “House rules (when you booked)” from the snapshot.
3. CTA renamed to “View listing” so it is not mistaken for purchased operational truth.

## Certification

- AUTOMATED-TESTED: `purchase-snapshot.test.ts`
- Deployed: `create-booking-checkout-session`
