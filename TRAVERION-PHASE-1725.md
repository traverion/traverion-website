# TRAVERION PHASE 1725 — Money Collected keeps late no_refund cancels

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Traveler cancels inside the no-free-cancel window → `refund_choice = no_refund`, Stripe keeps the charge, Bookings shows **No refund**, and the ledger does not reverse `booking_earnings`. Partner Money **Collected / Available** still dropped that `amount_paid` because `isCollectedBooking` rejected every cancelled row.

## Fix

Treat cancelled + paid + `refund_choice = no_refund` as still collected. Refund due / refunded / unpaid cancels stay out. Align `docs/MANUAL_REFUND.md` §5.

## Verification

- Vitest payment-states + Money Available cert.
