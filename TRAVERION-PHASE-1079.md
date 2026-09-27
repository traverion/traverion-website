# Traverion — Phase 1079

**Mission:** Marketplace completeness continuum after Phase 1078  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **127** (no new migration)  
**Founder parked (unchanged):** auto-refund; take-rate / commission

---

## Problem (P1)

1. Deactivate/unpublish “upcoming paid” count used browser `localYmd`, disagreeing with experience-local Past/Upcoming on Bookings.
2. Stay blocked-night fetches defaulted `fromDate` to browser today, so experience-local “today” blocks could be missing for travelers ahead of the property timezone.

## Fix

- `countUpcomingPaidTripsForListing` defaults to `scheduleTodayIsoForBooking` per row.
- `fetchPublishedStayBlockedNights({ fromDate })` wired from Stay PDP / Stays browse with experience-local today.

## Certification

- AUTOMATED-TESTED: `listing-unpublish-impact.test.ts`
- Typecheck: `tsc -p tsconfig.app.json --noEmit`
