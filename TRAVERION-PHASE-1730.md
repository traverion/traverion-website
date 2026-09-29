# TRAVERION PHASE 1730 — new_review host email after listing unpublish

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Traveler could leave a review on a paid booking after the listing was force-unpublished (RLS allows insert via booking). `submitReview` then loaded `supplier_id` with a traveler `listings` SELECT that hides drafts, so `new_review` never emailed the host while Trips showed success.

## Fix

Resolve listing meta via `fetchListingSupplierMetaForParty` before `notifySupplierEvent` (same family as Phases 1707 / 1729).

## Verification

- Vitest wiring cert.
