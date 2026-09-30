# TRAVERION PHASE 1783 — Bookings CSV audit records filter snapshot

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Bookings Export wrote `supplier_export_runs` with `{ surface: 'bookings' }` only — compliance could not reconstruct view/ops/listing/date/query for guest-PII CSVs.

## Fix

Pass `view`, `opsFilter`, listing, query, inventory family, and date_from/to into the export run.

## Verification

- Vitest wiring cert.
