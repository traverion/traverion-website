# TRAVERION PHASE 1744 — Listings writes require editor team roles

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Partner UI gates listing create/edit/delete with `canManageBookings` (owner/manager/ops), but listings INSERT/UPDATE/DELETE RLS only required `is_supplier_account_side`. Finance/viewer JWTs could mutate or delete catalog inventory. `deleteListing` also treated zero-row deletes as success.

## Fix

- Migration `216_listings_write_editor_roles.sql`: `is_supplier_account_editor`; INSERT/UPDATE/DELETE use it. SELECT unchanged.
- `deleteListing` uses `.select('id').maybeSingle()` and fails closed.

## Verification

- Vitest wiring cert.
- `supabase db push`.
