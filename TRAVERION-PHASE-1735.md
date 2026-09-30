# TRAVERION PHASE 1735 — Partial Stripe refunds: Money + emails

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Partial refunds only logged `partial_refund_recorded` while `amount_paid` stayed full (Collected lied) and neither traveler nor host was emailed. Full refunds already reversed earnings and emailed both (1733).

## Fix

- Shrink `bookings.amount_paid` to remaining charge (`remainingPaidMajorFromCharge`).
- Email traveler + host with `partial_refund_recorded` (idempotent per Stripe event id).
- Keep `payment_status = paid` until fully refunded.

## Verification

- Vitest + deploy `stripe-webhook`, `notify-customer-booking`, `notify-supplier-event`.
