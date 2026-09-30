# TRAVERION PHASE 1749 — Logo storage editors + review reply UI gate

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

1. `supplier-logos` storage writes still used `is_supplier_account_side` after listing-image editors (1747).
2. Reviews UI still invited every role to compose public replies after RLS 1748 locked writes to editors.

## Fix

- Migration `221_supplier_logos_storage_editor_roles.sql`.
- Gate Reviews reply compose/edit with `canManageBookings` + NoticeCallout.

## Verification

- Vitest wiring cert.
- `supabase db push`.
