# Traverion — Phase 1088

**Mission:** Marketplace completion continuum after Phase 1087  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** unchanged  
**Deployed:** `create-booking-checkout-session` (discount fail-closed)

---

## Problem (P1)

`listing_discounts` query failures were treated as “no offers.” Checkout could quote full price while PDP/browse had (or should have) shown a discount. Partner Offers cleared to empty on failure.

## Fix

- Checkout: discount select error → 500, never quote with empty discounts.
- Client fetchers: `queryRowsOrThrow`.
- Partner Offers / browse / PDP: keep prior offer state on failure.

## Certification

- Typecheck: `tsc -p tsconfig.app.json --noEmit`
- Edge Function: `create-booking-checkout-session` deployed
- Browser/E2E: not performed
