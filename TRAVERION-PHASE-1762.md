# TRAVERION PHASE 1762 — Mark messages read requires editor roles

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

`mark_booking_messages_read` treated any listing-side teammate as host. Finance/viewer opening Inbox cleared `read_by_supplier_at` and hid Unread from owner/manager/ops.

## Fix

Migration 226: supplier stamp requires `is_listing_supplier_bookings_editor`; finance/viewer stay party for read with a no-op stamp path.

## Verification

- Vitest wiring cert.
- Applied with `supabase db push` (alongside 225).
