# Traverion — Phase 1064

**Mission:** Marketplace completeness continuum after Phase 1050  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **124** (no new migration)

---

## Problem

After Phase 1063, catalog capacity used per-departure remaining. TourDetails / BookingPage `selectedDaySpotsLeft` still fell back to **day-total** paid seats when no departure was selected. A sold-out morning could show “Fully booked this day” and block Book while evening chips still had seats.

## Fix

`maxSpotsLeftAcrossDepartures` — when no slot is selected and there is no day-level `listing_availability` cap, report the **max** remaining across still-bookable departure times (same set as PDP chips).

## Certification

- AUTOMATED-TESTED: `departure-slot-remaining.test.ts`
- CODE-INSPECTED: TourDetails + BookingPage `selectedDaySpotsLeft`
