# TRAVERION PHASE 1737 — Restore amount_paid on full refund after partials

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Phase 1735 shrinks `amount_paid` on partial refunds. A later full refund only flipped `payment_status` to `refunded`, leaving the shrunk remainder. Trips and Bookings still display `amount_paid` for Refunded rows, understating what was paid/refunded.

## Fix

On full Stripe refund, set `amount_paid` to the cumulative Stripe refunded amount (equals original charge when fully refunded) when flipping to `refunded`.

## Verification

- Vitest wiring cert.
- Deploy `stripe-webhook`.
