# Traverion — Phase 1071

**Mission:** Marketplace completeness continuum after Phase 1050  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **125**

---

## Problem

1. Review UI preferred `purchase_snapshot.startTimeHm`; SQL `booking_experience_started_for_review` used live `bookings.start_time`. Ops day edits made “Write a review” disagree with RLS.
2. Stay UI unlocked from checkout **notes**; SQL only when `check_out` column is set.
3. Traveler cancel UI/SQL used live `start_time` while Trips display preferred purchased departure — free-cancel window could disagree.
4. Income collected rows still labeled with live listing titles after rename.

## Fix

1. **Migration 125:** review + `cancel_booking_as_traveler` prefer `purchase_snapshot.startTimeHm`, else live `start_time`.
2. Review UI: stay path only when `check_out` column is present.
3. Trips cancel refund choice uses purchased start + TZ.
4. Income list/CSV prefer purchased listing title.

## Certification

- AUTOMATED-TESTED: `review-eligibility.test.ts`
- INTEGRATION: remote `db push` migration **125**
