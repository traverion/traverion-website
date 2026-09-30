# TRAVERION PHASE 1798 — Earnings/ledger SELECT exclude viewers

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Money CSV was finance-gated, but `supplier_earnings` / `supplier_ledger_entries`
SELECT stayed account-side — viewers could read revenue rows via PostgREST.

## Fix

Migration 234: SELECT requires `is_supplier_account_export_actor`.

## Verification

- Vitest + `supabase db push`.
