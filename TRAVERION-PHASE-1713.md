# TRAVERION PHASE 1713 — Release hold + late Stripe pay traveler emails

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Partner **Release hold** cancelled unpaid checkout with no traveler email. If the traveler still paid Stripe, webhook auto-refunded silently (`payment_status=failed`) so `refund_completed` never ran — bank charge + refund with no Traverion mail.

## Fix

1. `updateBookingStatus` unpaid cancel: `booking_cancelled` + `unpaidCheckout` to traveler (idempotency `partner_release_hold`).
2. `promote-paid-from-checkout` after `cancelled_checkout_refund`: service-role `booking_cancelled` explaining Stripe reverse (key includes session id).

## Verification

- Vitest wiring certs.
- Redeploy stripe-webhook / reconcile paths that import `promote-paid-from-checkout` (shared module).
