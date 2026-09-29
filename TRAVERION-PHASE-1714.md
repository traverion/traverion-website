# TRAVERION PHASE 1714 — Cutoff / listing / self-book auto-refund traveler emails

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Late Stripe pay after departure cutoff (and listing-unavailable / self-book gates) auto-refunded the capture with **no** Traverion email. Phase 1713 only covered `cancelled_checkout_refund`. `refund_completed` never runs (`payment_status` → failed).

## Fix

Shared `notifyTravelerCheckoutCaptureReversed`: after refund event insert, optionally cancel pending/confirmed holds (lifecycle for `booking_cancelled`), then service-role traveler email with reason-specific fieldDiffs. Wired for:

- `departure_cutoff_checkout_refund`
- `listing_unavailable_checkout_refund`
- `self_book_checkout_refund`
- (refactor) `cancelled_checkout_refund`

## Verification

- Vitest wiring cert.
- Redeployed stripe-webhook + reconcile-checkout-session.
