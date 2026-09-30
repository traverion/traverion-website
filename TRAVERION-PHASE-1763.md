# TRAVERION PHASE 1763 — Bookings and Pickup CSV export gate + audit

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Money CSV gained finance gate + `supplier_export_runs` (1760), but Bookings and Pickup Export still let any role download guest-PII CSVs with no audit row.

## Fix

Gate both Exports with `canManageBookings`; insert `kind: bookings` export runs with `surface: bookings|pickup`.

## Verification

- Vitest wiring cert.
