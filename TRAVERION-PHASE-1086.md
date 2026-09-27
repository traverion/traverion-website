# Traverion — Phase 1086

**Mission:** Marketplace completion continuum after Phase 1085  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** unchanged

---

## Problem (P1)

Trips “View tour / View listing” opened the live PDP by `listing_id`, presenting current catalog copy as if it were the purchased trip. Unpublished listings could still be offered as browse targets.

## Fix

- Relabel CTA to “Browse current tour/listing” with honest title tooltip.
- Load listing `status` in ops meta; only show CTA when `published`.
- Purchased trip details remain the primary truth on the Trips card.

## Certification

- AUTOMATED-TESTED: `tripAllowsBrowseLiveListing` in `trip-views.test.ts`
- Typecheck: `tsc -p tsconfig.app.json --noEmit`
- Browser/E2E: not performed
