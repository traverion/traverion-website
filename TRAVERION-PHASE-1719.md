# TRAVERION PHASE 1719 — Orphan checkout reverse emails actually send

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Phase 1715 orphan paths called `notifyTravelerCheckoutCaptureReversed` with `booking_cancelled` while keeping the booking paid (`ensureCancelled: false`). Lifecycle gate returned **409**; promote ignored `res.ok` → silent money reverse.

## Fix

- New service-role kind `checkout_payment_reversed` (active booking OK).
- Helper: `booking_cancelled` when cancelled; else `checkout_payment_reversed`.
- Log non-OK notify responses.

## Verification

- Vitest wiring certs.
- Redeploy notify-customer-booking, stripe-webhook, reconcile-checkout-session.
