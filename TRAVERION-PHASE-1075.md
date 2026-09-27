# Traverion — Phase 1075

**Mission:** Marketplace completeness continuum after Phase 1074  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **127** (no new migration)

---

## Problem

1. When a purchase snapshot existed but `duration` / `optionLabel` / `startTimeHm` / `cancellationPolicy` was empty, display helpers resurrected **live** listing/ops values — rewriting purchased truth after edits.
2. Partner Bookings Today/Tomorrow/Upcoming/Past still used browser `localYmd`, disagreeing with experience-local Dashboard/Trips (1074).

## Fix

- Snapshot-present display helpers return snap fields only (empty if absent); live only for pre-snapshot rows.
- Partner Bookings schedule views use `scheduleTodayIsoForBooking` + `addCalendarDaysYmd`.

## Certification

- AUTOMATED-TESTED: `purchase-snapshot.test.ts`, `trip-views.test.ts`
- Typecheck: `tsc -p tsconfig.app.json --noEmit`
