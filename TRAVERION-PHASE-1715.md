# TRAVERION PHASE 1715 — Inventory / underpay / currency / orphan auto-refund emails

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Sold-out race (and underpay / currency mismatch / orphan / unpromoted) auto-refunded Stripe captures with no traveler email — same silent-money class as 1713/1714, remaining paths unwired.

## Fix

Call `notifyTravelerCheckoutCaptureReversed` after each remaining refund event insert. `ensureCancelled: true` for inventory/underpay/currency/unpromoted; `false` for orphan paths (booking may already be paid on another session).

## Verification

- Vitest reasonKey certs.
- Redeploy stripe-webhook + reconcile-checkout-session.
