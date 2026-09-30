# TRAVERION PHASE 1754 — Company profile + verification docs require editors

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

After logos/listings locked to editors, `supplier_profiles` UPDATE and `supplier-verification` storage still allowed any account-side teammate (finance/viewer) to change KYC, IBAN, and guest legal copy. Settings offered Save with no role gate.

## Fix

- Migration 224: profile UPDATE + verification storage writes use `is_supplier_account_editor`.
- Business profile UI: `canManageBookings` gates Save bars and shows an honest read-only notice.

## Verification

- Vitest wiring cert.
- `supabase db push` applies 224.
