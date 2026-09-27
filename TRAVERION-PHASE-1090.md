# Traverion — Phase 1090

**Mission:** Marketplace completion continuum after Phase 1089  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** unchanged  
**Deployed:** none (client + prior checkout deploy from 1088)

---

## Problem (P1)

After Phase 1088, checkout fails closed on discount load errors, but BookingPage still quoted from a possibly empty browse-time `discountsByListing` map. A failed offer load on PDP could show full price while Stripe applied discounts (or block inconsistently).

## Fix

- At Pay, refetch `fetchDiscountsByListingId` and gate via `payTimeDiscountsOrBlock`.
- Block submit with a clear error when offers cannot be verified.
- Empty offer list after a successful fetch remains legitimate.

## Certification

- AUTOMATED-TESTED: `pay-time-discounts.test.ts`
- Typecheck: `tsc -p tsconfig.app.json --noEmit`
- Browser/E2E: not performed
