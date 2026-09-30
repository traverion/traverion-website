# TRAVERION PHASE 1736 — Full-refund email amount after partials

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

After Phase 1735 shrinks `amount_paid` on partial refunds, a later full-refund traveler email re-derived Refunded from the remaining `amount_paid` and understated Stripe’s cumulative refund.

## Fix

`refund_completed` keeps the service-role caller amount (Stripe `amount_refunded`); still gates on `payment_status = refunded` and re-derives recipient/currency from the booking. Deno auth also requires service-role for `partial_refund_recorded`.

## Verification

- Vitest recipient cert.
- Deploy `notify-customer-booking`.
