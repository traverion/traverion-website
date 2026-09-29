# TRAVERION PHASE 1726 — Traveler cancel uses server refund_choice

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Near the free-cancel cutoff, client guessed `full_refund` while `cancel_booking_as_traveler` coerced `no_refund`. Trips success toast and traveler cancel email still promised Refund due; Money (1725) and host mail (1724) told the truth.

## Fix

`cancelBookingAsCustomer` drives email diffs + return value from RPC/DB `refund_choice`. Trips toast uses the returned choice. `notify-customer-booking` rebuilds `booking_cancelled` fieldDiffs/footer from DB unpaid + `refund_choice` so guests cannot forge Refund due.

## Verification

- Vitest wiring cert.
- Deploy `notify-customer-booking`.
