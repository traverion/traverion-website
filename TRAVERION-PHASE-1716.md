# TRAVERION PHASE 1716 — Host pickup save reaches traveler Trips

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Host saved meeting/pickup place in Pickup Planner → UI success → traveler Trips still showed **Pickup needed**. Confirmation promised Trips would update.

## Root cause

Overrides live in `special_requests` (`meeting_point:` / `pickup_instructions:`). Partners use `resolvePartnerPickupCopy` (notes → snapshot). Traveler Trips/confirmation used snapshot/listing only and stripped machine note lines from guest-facing notes. Save also sent no email (unlike schedule-time updates).

## Fix

- Trips + confirmation: `resolvePartnerPickupCopy` including `special_requests`.
- `updateBookingPickupCopy`: traveler email (`pickup_confirmed` / `host_updated_schedule`) with fieldDiffs.

## Verification

- Vitest: note override resolution + wiring certs.
