# Traverion — Phase 1056

**Mission:** Marketplace completeness continuum after Phase 1055  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** Local=Remote through **124** (no new migration)

---

## Problem

Stay hosts could only set city/country. Trips showed city-only “place,” so booked guests had no street/entry address to arrive. Phase 859 already flagged this as the highest stay residual.

## Fix

1. `StayDetails.checkInAddress` in listing extras (host form + publish/step gate).
2. Frozen onto `purchase_snapshot.checkInAddress` at TEST checkout.
3. Trips prefers snapshotted address (label “Check-in address”); public StayDetails still shows city/country only (does not render the field).
4. Vitest: snapshot freeze helper.

Deployed `create-booking-checkout-session`.

## Honest residual

`checkInAddress` lives in `listing_extras` JSON on published rows (same class as house rules). UI never shows it publicly; full column-level privacy would need a FOUNDER/architecture follow-up.

## Certification

| Label | Evidence |
|-------|----------|
| AUTOMATED-TESTED | purchase-snapshot.test.ts |
| CODE-INSPECTED | form + Trips + publish gate |
| INTEGRATION | checkout function redeployed |

## Explicitly not done

- Private address table / RLS column strip  
- Geo/map pin  
- LIVE Stripe / FOUNDER money  
