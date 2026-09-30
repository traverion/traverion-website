# TRAVERION PHASE 1747 — Availability UI role gate + listing-image storage editors

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

1. Availability calendar had no partner role gate — finance/viewer could attempt capacity edits (RLS 1746 would fail closed with a confusing error, or appear interactive).
2. `listing-images` storage INSERT/UPDATE/DELETE still used `is_supplier_account_side`, so finance/viewer could upload/replace listing photos under the owner prefix.

## Fix

- Gate Availability writes with `canManageBookings` + honest NoticeCallout.
- Migration `219_listing_images_storage_editor_roles.sql` — storage writes use `is_supplier_account_editor`.

## Verification

- Vitest wiring cert.
- `supabase db push`.
