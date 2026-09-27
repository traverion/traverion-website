# Traverion — Phase 1080

**Mission:** Marketplace completeness continuum after Phase 1079  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **127** (no new migration)  
**Founder parked (unchanged):** auto-refund; take-rate / commission

---

## Problem (P0)

1. Trips / confirmation **Pay now** (`resumePendingBookingCheckout`) sends only `bookingId`. Checkout resume never restored `startTime` from `purchase_snapshot` / `start_time`, so multi-departure quotes failed (“Choose a departure time”) or day-wide assert used the wrong capacity slice.
2. `promotePaidFromCheckoutSession` asserted inventory with **live** `bookings.start_time`. After ops schedule edits, counting (mig 126) still used purchased `startTimeHm`, but assert could clear/overbook the wrong slot.

Canonical truth: sold seat = `purchase_snapshot.startTimeHm`, else `start_time` (`inventoryStartTimeHmFromBooking`).

## Fix

- Resume path loads snapshot + `start_time` and sets effective `startTime` before quote / `assert_checkout_inventory`.
- Promote path uses `inventoryStartTimeHmFromBooking` for `p_start_time`.

## Certification

- AUTOMATED-TESTED: `booking-hold.test.ts` (Phase 1080 prefer-snapshot)
- Deploy: `create-booking-checkout-session`, `stripe-webhook`, `reconcile-checkout-session`
- Browser/E2E: not performed
