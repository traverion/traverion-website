# Traverion — Phase 1063

**Mission:** Marketplace completeness continuum after Phase 1050  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **124** (no new migration)

---

## Problem

Phase 1057 made browse *presence* cutoff-aware, but catalog capacity and PDP/Booking sold-out calendars still counted seats on departures past `bookingCutoffHoursBeforeStart`. A morning slot with seats but past cutoff could keep a date “open” while the only still-bookable evening slot was sold out — search disagreed with PDP chips / checkout.

## Fix

1. `tourBookableSellingDeparturesOnDate` — selling departures filtered by `isDepartureTimeStillBookable` (shared with PDP chips).
2. Packages capacity, TourDetails / BookingPage sold-out calendars use that set.
3. `tourDateLacksCapacityForParty` / `tourSoldOutDates` treat a single remaining bookable departure with slot data as capacity-authoritative (not only multi-departure days).

## Certification

- AUTOMATED-TESTED: `booking-quote.test.ts` (Phase 1063 case), existing `tour-calendar.test.ts`
