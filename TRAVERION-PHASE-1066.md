# Traverion — Phase 1066

**Mission:** Marketplace completeness continuum after Phase 1050  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **124** (no new migration)

---

## Problem

Phases 1056/1065 freeze stay `checkInAddress` / `checkInTime` / `checkOutTime` onto `purchase_snapshot`, and Trips shows them. Customer emails still only re-derived tour `meetingPoint` + `pickupInstructions`, so stay confirmation/reminders omitted purchased arrival logistics and could label logistics “Meeting / pickup”.

## Fix

1. `resolveBookingTiedContent` exposes stay snap address + house times; stays do not inherit tour meeting copy.
2. `buildDetailRows` adds Check-in address / Check-in from / Check-out by for stays.
3. `experience_reminder` uses stay-aware labels and house-time copy.

## Certification

- AUTOMATED-TESTED: `notify-customer-content.test.ts`, `edge-function-deno-mirror-sync.test.ts`
- Deployed: `notify-customer-booking`
