# Traverion — Phase 1085

**Mission:** Marketplace completion continuum after Phase 1084  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** unchanged

---

## Problem (P1)

Partner Dashboard pickup-gap cutoff and stay In/Out labels used browser `localYmd`, while Today’s booking list already used experience-local `scheduleTodayIsoForBooking`. Pickup Planner Today/Tomorrow presets wrote absolute browser calendar dates into `from`/`to`, so near midnight a Helsinki departure could fall off “Today” for a partner elsewhere.

## Fix

- Pickup gaps + stay In/Out use per-booking `scheduleTodayIsoForBooking`.
- Pickup Today/Tomorrow use `day=today|tomorrow` + `partnerTourMatchesExperienceDayOffset`.
- Dashboard deep-link opens Pickup with `day=today` (not browser from/to).

## Certification

- AUTOMATED-TESTED: `trip-views.test.ts` (Helsinki midnight boundary)
- Typecheck: `tsc -p tsconfig.app.json --noEmit`
- Browser/E2E: not performed
