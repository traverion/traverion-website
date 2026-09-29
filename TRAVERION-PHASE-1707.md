# TRAVERION PHASE 1707 — Trips notify after listing unpublish

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Admin/supplier force-unpublish (draft) keeps paid bookings. Traveler Accept/Decline, self-cancel host notify, and note-update host notify silently skipped — UI success, no email — because `listings` RLS hides unpublished rows from travelers so `supplier_id` was missing.

## Root cause

1. Listings SELECT: published OR supplier-side only.
2. `fetchListingOpsByIds` / direct listing SELECT returned empty for draft.
3. Accept/Decline gated **both** traveler and host emails on `ops?.supplier_id && guest_email`.

## Fix

- Migration **211**: `listing_ops_for_booking_party(uuid[])` SECURITY DEFINER — returns ops when caller is booking party.
- `fetchListingOpsByIds` fills missing ids via RPC; `fetchListingSupplierMetaForParty` for cancel/note paths.
- `notifyCancellationResolved`: traveler receipt independent of `supplierId`; host notify when id present.

## Verification

- Vitest: migration + client wiring certs.
- Apply migration 211 on live Supabase before production unpublished-listing trips notify works.
