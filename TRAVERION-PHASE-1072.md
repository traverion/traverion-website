# Traverion — Phase 1072

**Mission:** Marketplace completeness continuum after Phase 1050  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **126**

---

## Problem

Partner Pickup can edit `bookings.start_time` for day-of logistics while Trips keep `purchase_snapshot.startTimeHm`. Inventory (`assert_checkout_inventory`, `published_tour_paid_guests_by_slot`, client occupancy helpers) keyed off live `start_time`, so moving 09:00 → 14:00 freed morning seats and consumed afternoon capacity → overbooking risk.

## Fix

1. **Migration 126:** `booking_inventory_start_time_hm(snapshot, start_time)` = coalesce(snap `startTimeHm`, `start_time`); used by checkout assert + public by-slot counts.
2. Client/Deno `tourCheckoutOccupiedGuests` + schedule-edit occupancy use the same rule.
3. Checkout session selects `purchase_snapshot` for occupancy rows.

## Certification

- AUTOMATED-TESTED: `booking-hold.test.ts`, `schedule-edit-impact.test.ts`, mirror sync
- INTEGRATION: remote `db push` **126**
- Deployed: `create-booking-checkout-session`
