# TRAVERION PHASE 1770 — Admin Bookings Collected matches Money

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Admin Bookings showed amount when `bookingPaymentWasCollected` (includes **refunded**). Partner Money and admin `finance_summary` use `isCollectedBooking` (excludes refunded). Refunded trips looked collected on Admin Bookings.

## Fix

Use `isCollectedBooking` for the amount column (pay chips still show Refunded).

## Verification

- Vitest wiring cert.
