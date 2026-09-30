# TRAVERION PHASE 1773 — Pay now resume fills empty lead guest name

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

`resumePendingBookingCheckout` sent only `bookingId`. Edge requires lead guest name ≥ 2 chars; empty `guest_name` on unpaid holds failed with no UI to enter a name.

## Fix

Accept optional `customerName` on resume (edge already merges into empty booking guest_name). Trips and Confirmation pass booking guest name, else profile full_name, else email local-part.

## Verification

- Vitest wiring cert.
