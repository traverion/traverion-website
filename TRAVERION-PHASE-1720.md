# TRAVERION PHASE 1720 — Refund before paid must email the traveler

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Full Stripe refund while booking still pending → `payment_status: failed` → no Traverion email (`refund_completed` requires paid). Same silent-money class as 1713–1719, unwired on webhook + promote `refunded_before_promote`.

## Fix

Export `notifyTravelerCheckoutCaptureReversed`; call after both refund-before-paid event inserts with `ensureCancelled: true`.

## Verification

- Vitest wiring cert.
- Redeploy stripe-webhook + reconcile-checkout-session.
