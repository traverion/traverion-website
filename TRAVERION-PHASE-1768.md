# TRAVERION PHASE 1768 — Bookings/Pickup CSV export includes finance

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

1763 gated Bookings/Pickup Export to editors only, but finance already exports guest names on Money CSV and `supplier_export_runs` INSERT allows finance (227). Finance hit a silent dead-end on Bookings Export.

## Fix

Allow `canManageBookings || canManageFinance` for Bookings and Pickup Export (viewer still blocked).

## Verification

- Vitest wiring cert.
