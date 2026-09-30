# TRAVERION PHASE 1758 — charge.refunded meta must match booking payment_intent

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

When Stripe refunded an orphan/superseded PaymentIntent after Pay-now rotate, `charge.refunded` fell back to `booking_id` metadata without checking `bookings.payment_intent_id`. That could mark the **live paid** booking refunded, reverse earnings, and email refund while the current PI was still captured.

## Fix

Select `payment_intent_id` on refund lookup. Meta fallback applies only when the booking PI is empty or equals the event PI (`chargeRefundMetaBookingMatchesPaymentIntent`).

## Verification

- Vitest helper + webhook wiring.
- Redeploy `stripe-webhook`.
