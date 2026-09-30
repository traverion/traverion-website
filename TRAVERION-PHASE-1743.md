# TRAVERION PHASE 1743 — Bookings UPDATE requires editor team roles

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Partner UI treats finance/viewer as read-only for bookings (`canManageBookings`), but RLS UPDATE only required `is_listing_supplier_side`. Finance/viewer JWTs could still mutate status, schedule, pickup notes, and acknowledgements via the anon client — including false success when PostgREST returned no error on zero rows.

## Fix

- Migration `215_bookings_update_editor_roles.sql`: `is_listing_supplier_bookings_editor` (listing owner or team role owner/manager/ops); UPDATE policy uses it. SELECT unchanged.
- Client booking writers use `.select('id').maybeSingle()` and fail closed on zero rows.

## Verification

- Vitest wiring cert.
- `supabase db push`.
