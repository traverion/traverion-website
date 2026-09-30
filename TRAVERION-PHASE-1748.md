# TRAVERION PHASE 1748 — Wire real partner roles + review reply editors

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

1. `useSupplierRole` always returned `owner`, so every `canManageBookings` UI gate (Listings, Bookings, Pickup, Offers, Availability) was inert for real team JWTs.
2. `review_replies` INSERT/UPDATE still used `is_supplier_account_side`, so finance/viewer could publish traveler-visible reply copy.

## Fix

- `useSupplierRole` loads `supplier_team_members` via `fetchSupplierTeamMembers` and sets the signed-in user's role (default viewer if missing).
- Migration `220_review_replies_editor_roles.sql` — reply writes use `is_supplier_account_editor`.

## Verification

- Vitest wiring cert.
- `supabase db push`.
