# TRAVERION PHASE 1745 — Host cancel request requires editor team roles

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Partner UI gates host cancel requests with `canEditBookings`, but `request_supplier_cancellation` accepted any `supplier_team_members` row. Finance/viewer JWTs could open Refund-due cancel requests via RPC.

## Fix

Migration `217_request_cancel_editor_roles.sql` — authorize with `is_listing_supplier_bookings_editor` (owner/manager/ops).

## Verification

- Vitest wiring cert.
- `supabase db push`.
