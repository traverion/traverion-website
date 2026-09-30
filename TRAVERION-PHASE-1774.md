# TRAVERION PHASE 1774 — Verification storage SELECT requires editors

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Verification doc writes were editor-locked (224) but SELECT stayed account-side — finance/viewer could still open KYC files via signed URLs.

## Fix

Migration 228: SELECT uses `is_supplier_account_editor` (same as writes).

## Verification

- Vitest wiring cert.
- `supabase db push` applies 228.
