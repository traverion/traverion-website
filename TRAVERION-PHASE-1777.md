# TRAVERION PHASE 1777 — Stay private check-in address SELECT requires editors

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

`listing_stay_private` writes were editor-locked (218) but SELECT stayed account-side — finance/viewer could still read raw stay check-in addresses.

## Fix

Migration 229: SELECT uses `is_supplier_account_editor`.

## Verification

- Vitest wiring cert.
- `supabase db push` applies 229.
