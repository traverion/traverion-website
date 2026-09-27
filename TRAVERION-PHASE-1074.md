# Traverion — Phase 1074

**Mission:** Marketplace completeness continuum after Phase 1073  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **127**

---

## Problem

1. Stay free-cancel used midnight (or tour start) instead of purchased **check-in** wall clock (`checkInTime`).
2. Trips upcoming/past and partner Today/upcoming used **browser** `localYmd`, so experience-local midnight could mis-bucket bookings.

## Canonical truth

| Workflow | Event | Clock |
|----------|--------|--------|
| Stay cancel 24h window | Check-in begins stay | `purchase_snapshot.checkInTime` (default 16:00) + departureTimezone |
| Trip list / partner Today | Calendar day of departure / stay nights | Experience-local today from snapshot TZ |

## Fix

1. Migration **127**: `cancel_booking_as_traveler` stay branch uses `checkInTime`.
2. Trips cancel UI mirrors that.
3. `scheduleTodayIsoForBooking` + Trips/Dashboard schedule filters.

## Certification

- AUTOMATED-TESTED: cancellation-policy, trip-views
- INTEGRATION: remote `db push` **127**
