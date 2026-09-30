# TRAVERION PHASE 1792 — Dashboard recent amounts match Money Collected

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Dashboard Recent showed `amount_paid` for any `bookingPaymentWasCollected`
status — including Refunded — while Money Collected uses `isCollectedBooking`.

## Fix

Gate Recent amounts with `isCollectedBooking`.

## Verification

- Vitest wiring cert.
