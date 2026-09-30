# TRAVERION PHASE 1793 — Lock export-run SELECT to exporters

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

`supplier_export_runs` INSERT was export-actor locked, but SELECT stayed
account-side — viewers could read who exported guest-PII CSVs.

## Fix

Migration 233: SELECT requires `is_supplier_account_export_actor`.

## Verification

- Vitest wiring cert.
- `supabase db push` applies 233.
