# Traverion — Phase 1091

**Mission:** Marketplace completion continuum after Phase 1090  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** unchanged

---

## Problem (P1)

Catalog “From” / offer badges and partner Offers active/upcoming/ended used browser `localYmd` for “today,” so a Helsinki listing’s offer could appear inactive for a US traveler (or partner) near UTC midnight while experience-local day already included the offer window.

## Fix

- `catalogOfferTodayIso` / `catalogOfferAnchorDate` use `experienceTodayIsoForListing`.
- `getDisplayPriceForTour` applies offers against that day.
- Partner Offers status uses the listing’s experience-local today.

## Certification

- AUTOMATED-TESTED: `discount-display.test.ts` (Helsinki midnight boundary)
- Typecheck: `tsc -p tsconfig.app.json --noEmit`
- Browser/E2E: not performed
