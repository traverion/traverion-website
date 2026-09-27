# Traverion — Phase 1068

**Mission:** Marketplace completeness continuum after Phase 1050  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **124** (no new migration)

---

## Problem

Listing `includes` / `excludes` were never frozen onto `purchase_snapshot`. After purchase, a supplier could edit what’s included and travelers only had the live PDP (“View tour/listing”) as a deep surface — rewriting purchased inclusion truth.

## Fix

1. Checkout selects and freezes `includes` / `excludes` onto the snapshot (capped list).
2. Trips shows “Included / Not included (when you booked)” from the snapshot for tours.

## Certification

- AUTOMATED-TESTED: `purchase-snapshot.test.ts`
- Deployed: `create-booking-checkout-session`
