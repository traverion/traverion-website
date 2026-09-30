# TRAVERION PHASE 1752 — Host booking chat requires editor roles

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

After bookings/listings/cancel/ops were locked to owner/manager/ops, `post_booking_message` still let any account-side team JWT (finance/viewer) post as the host. Partner Inbox and Bookings also offered compose UI that RLS/RPC would reject.

## Fix

- Migration 223: supplier-side posts require `is_listing_supplier_bookings_editor`; finance/viewer stay `is_booking_party` for read with an honest cannot-send error.
- Inbox + Bookings: `canCompose` ANDs `canManageBookings`; compose block `role` explains read-only.

## Verification

- Vitest wiring cert.
- `supabase db push` applies 223.
