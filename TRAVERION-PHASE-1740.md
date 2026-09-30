# TRAVERION PHASE 1740 — Partial Stripe refund on cancelled Refund due

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Partial `charge.refunded` on a cancelled Refund due booking (earnings already reversed at cancel) still called `shrink_paid_booking_earnings` (ledger net went negative) and emailed “stays Paid / inventory held”.

## Fix

- Load `status` / `refund_choice` in the webhook; skip earnings shrink when cancelled and not `no_refund`.
- Still shrink `amount_paid` so Refund due totals match remaining charge.
- Customer + host partial email copy branches for cancelled Refund due.

## Verification

- Vitest wiring cert.
- Deploy `stripe-webhook`, `notify-customer-booking`, `notify-supplier-event`.
