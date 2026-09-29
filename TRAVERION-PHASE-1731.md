# TRAVERION PHASE 1731 — Leave a review after force-unpublish

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

`review_request` still emailed travelers after a listing was force-unpublished, but Trips hid **Leave a review** (`tripAllowsLeaveReview` required `published`) and Tour/Stay PDPs 404’d (draft hidden by listings RLS; render gate also blocked season-ended review loads from Phase 1709). Phase 1730 only fixed host email after a successful submit.

## Fix

- Allow `draft` in `tripAllowsLeaveReview`.
- TourDetails / StayDetails: for review-eligible travelers, hydrate a review-only PDP from `listing_ops_for_booking_party` when the listing row is hidden; unlock render via `reviewOnlyAccess` (also fixes season-ended review PDP dead-end).
- Stay checkout blocked when `reviewOnlyAccess`.

## Verification

- Vitest trip-views + wiring certs.
