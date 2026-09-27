# Traverion — Phase 1061

**Mission:** Marketplace completeness continuum after Phase 1050  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **124** (no new migration)

---

## Problems

1. **Cancellation policy snapshot incomplete:** Checkout/PDP show `TRAVERION_STANDARD_CANCELLATION_POLICY` when `listings.cancellation_policy` is blank, but checkout froze only the raw column (often null). Trips then hid cancellation terms for those bookings.

2. **Review eligibility UI ≠ DB timezone:** Client used browser-local `Date` parsing and `stayRangeFromBooking` (which invents check-out = booking_date+1 for every tour). SQL `booking_experience_started_for_review` uses purchase/listing departure timezone and only treats real `check_out` as stays.

## Fix

1. `resolveCancellationPolicyForSnapshot` freezes STANDARD when the listing column is blank; Trips falls back to STANDARD for legacy empty snaps.
2. `bookingEligibleForReview` uses `wallTimeInZoneToUtcMs` + snapshotted start/TZ; stay path only when `check_out` (or notes) is a real ISO date; eligibility fetch selects `purchase_snapshot`.

## Certification

- AUTOMATED-TESTED: `review-eligibility.test.ts`, `purchase-snapshot.test.ts`
- Deployed: `create-booking-checkout-session`
