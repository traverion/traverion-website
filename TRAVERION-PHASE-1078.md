# Traverion — Phase 1078

**Mission:** Marketplace completeness continuum after Phase 1077  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **127** (no new migration)  
**Founder parked (unchanged):** auto-refund; take-rate / commission

---

## Problem (P1)

1. Partner Calendar swallowed `fetchBookingsForSupplier` failures as `[]`, so sold occupancy vanished and capacity warnings went dark (backend error → empty state).
2. Capacity override fetch cleared month rows on failure — same empty-state lie.
3. Listing form occupancy fetch cleared bookings on failure, disabling schedule sold-seat / move warnings (amplifies 1077).
4. Calendar “today” used browser `localYmd` while Dashboard/Trips use experience-local day.

## Fix

- Surface bookings / caps load errors; keep prior data; never pretend zero occupancy.
- Block schedule ready-save and delete when occupancy cannot be verified.
- Selected listing calendar “today” uses `experienceTodayIsoForListing`.

## Certification

- Typecheck: `tsc -p tsconfig.app.json --noEmit`
- Browser/E2E: not performed this phase
