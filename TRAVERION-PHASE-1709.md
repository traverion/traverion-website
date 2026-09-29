# TRAVERION PHASE 1709 — Leave a review after tour season ends

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

`review_request` email → Open Trips → **Leave a review** missing for season-ended published tours (common when the cron fires). Browse CTA correctly hidden; review wrongly used the same gate. Tour PDP also refused to load season-ended tours.

## Root cause

Phase 1678 gated Leave a review on `tripAllowsBrowseLiveListing` (requires upcoming season). Phase 1266 blocked TourDetails for season-ended listings.

## Fix

- `tripAllowsLeaveReview`: published only (no season).
- Trips Leave a review uses that helper + `bookingEligibleForReview`.
- TourDetails: load season-ended published tour when traveler `canReview`; `canBook` still requires upcoming season.

## Verification

- Vitest: trip-views + wiring certs.
