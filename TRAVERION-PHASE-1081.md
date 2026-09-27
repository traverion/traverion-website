# Traverion — Phase 1081

**Mission:** Marketplace completion continuum after Phase 1080  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** **128** (listing_stay_private)

---

## Problem (P1 / privacy)

Stay `checkInAddress` lived in `listing_extras` on published listings. RLS allows anon SELECT of published rows (mig 052), so exact property addresses were API-extractable despite StayDetails UI never rendering them.

## Canonical truth

- **PRE-BOOKING (public):** city/country only  
- **HOST:** `listing_stay_private` (owner RLS)  
- **CHECKOUT / PURCHASE:** service_role reads private → `purchase_snapshot.checkInAddress`  
- **POST-BOOKING traveler:** Trips / emails from snapshot on party-scoped booking  

## Fix

- Table `listing_stay_private` + owner RLS; migrate + strip JSON key  
- Client never writes address into public extras; strips on public map  
- Owner merge for edit UI; checkout snapshot override from private table  

## Certification

- AUTOMATED-TESTED: `listingExtras.privacy.test.ts`  
- Typecheck: `tsc -p tsconfig.app.json --noEmit`  
- Migration applied remote **128**  
- Deploy: `create-booking-checkout-session`  
- Browser/E2E: not performed  
- SQL RLS smoke: `listing_stay_private_rls.test.sql` (existence + RLS enabled)
