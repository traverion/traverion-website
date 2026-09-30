# TRAVERION PHASE 1765 — Export runs INSERT excludes viewer

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

After Money/Bookings/Pickup UI gated exports, `supplier_export_runs` INSERT stayed `is_supplier_account_side` — viewers could still forge audit rows via PostgREST.

## Fix

Migration 227: `is_supplier_account_export_actor` allows owner + team owner/manager/ops/finance; viewers cannot insert.

## Verification

- Vitest wiring cert.
- `supabase db push` applies 227.
