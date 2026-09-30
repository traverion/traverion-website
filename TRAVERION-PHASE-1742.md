# TRAVERION PHASE 1742 — Partner Bookings/Dashboard show pickup note overrides

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

After host saved Pickup planner overrides, Trips + reminders showed them (1716/1741) but Partner Bookings list/detail and Dashboard Today still rendered purchase_snapshot / live listing Meet copy — ops could run departures from stale place text.

## Fix

Use `resolvePartnerPickupCopy` (notes → snapshot → listing) for Bookings row/detail and Dashboard Today Meet lines.

## Verification

- Vitest wiring cert.
