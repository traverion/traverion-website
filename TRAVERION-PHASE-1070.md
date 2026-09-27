# Traverion — Phase 1070

**Mission:** Marketplace completeness continuum after Phase 1050  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **124** (no new migration)

---

## Problem

Phases 1067–1068 froze stay `houseRules` and tour `includes`/`excludes` onto `purchase_snapshot`, and Trips/partner Bookings surfaced them — but confirmation and reminder emails still omitted those purchased fields. After a listing edit, email copy could disagree with Trips.

Partner Dashboard attention chips and “Recent bookings” still preferred live listing titles after rename.

## Fix

1. `resolveBookingTiedContent` re-derives `houseRules` / `includes` / `excludes` from the snapshot.
2. `notify-customer-booking` renders them on `booking_confirmed_paid` and `experience_reminder`.
3. Dashboard `bookingLabel` + recent list use `displayListingTitleFromPurchase`.

## Certification

- AUTOMATED-TESTED: `notify-customer-content.test.ts`
- Deployed: `notify-customer-booking`
