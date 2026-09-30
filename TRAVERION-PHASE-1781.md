# TRAVERION PHASE 1781 — Admin payout record requires supplier_profiles

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

`admin_record_supplier_payout` only checked `auth.users` — payouts could be recorded against traveler UUIDs and pollute Money / finance_summary.

## Fix

Migration 230: require `supplier_profiles.id`.

## Verification

- Vitest wiring cert.
- `supabase db push` applies 230.
