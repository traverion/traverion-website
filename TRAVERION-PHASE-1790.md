# TRAVERION PHASE 1790 — Narrow supplier_profiles SELECT past viewers

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Profile SELECT used `is_supplier_account_side` — viewers could read
`payout_iban`, tax IDs, and verification document paths after writes were
editor-locked.

## Fix

Migration 232: SELECT requires `is_supplier_account_export_actor`
(owner/manager/ops/finance — not viewer).

## Verification

- Vitest wiring cert.
- `supabase db push` applies 232.
