# TRAVERION PHASE 1761 — Ops notes and vouchers writes require editors

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

After campaigns/messages locked to editors (1750), `supplier_booking_ops_notes` and `supplier_booking_vouchers` INSERT/UPDATE/DELETE still accepted any account-side team JWT via PostgREST.

## Fix

Migration 225: write policies use `is_supplier_account_editor`; SELECT stays account-side.

## Verification

- Vitest wiring cert.
- `supabase db push` applies 225.
