# TRAVERION PHASE 1791 — Await CSV export audit insert failures

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Money / Bookings / Pickup CSV downloads fired `void insertSupplierExportRun` —
RLS or network failure left no `supplier_export_runs` row while guest-PII/Money
CSV still downloaded.

## Fix

Await the audit insert; surface a non-blocking warning when it fails. Download
still succeeds.

## Verification

- Vitest wiring cert.
