# TRAVERION PHASE 1746 — Listing child writes require editor team roles

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

After Phase 1744 locked listings writes to owner/manager/ops, availability, stay private address, and discounts INSERT/UPDATE/DELETE still used `is_supplier_account_side`. Finance/viewer could still change calendars, private check-in addresses, and offer pricing.

## Fix

Migration `218_listing_child_writes_editor_roles.sql` — child-table writes use `is_supplier_account_editor`. SELECT policies unchanged.

## Verification

- Vitest wiring cert.
- `supabase db push`.
