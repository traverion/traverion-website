# Traverion — Phase 1089

**Mission:** Marketplace completion continuum after Phase 1088  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** unchanged

---

## Problem (P1)

`fetchListingOpsByIds` returned `{}` on error. On Trips that could clear live titles/status and, when combined with the outer load catch, risked treating ops failure as a full Trips outage.

## Fix

- Throw on listing ops query error.
- Trips: isolate ops fetch; keep bookings + prior ops; snap titles still render.
- Booking confirmation: snap-only fallback when ops fail.

## Certification

- Typecheck: `tsc -p tsconfig.app.json --noEmit`
- Browser/E2E: not performed
