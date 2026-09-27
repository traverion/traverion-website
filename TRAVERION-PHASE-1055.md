# Traverion — Phase 1055

**Mission:** Marketplace completeness continuum after Phase 1054  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** Local=Remote through **124**

---

## Problem

`cancel_booking_as_traveler` always interpreted `booking_date + start_time` in `Europe/Helsinki`. Listings with another `departureTimezone` (frozen on `purchase_snapshot`) disagreed with quote/Trips/review eligibility — free-cancel eligibility could be wrong by hours. Client UI used browser-local `Date.parse`.

## Fix

1. **Migration 124:** SQL uses snapshot → listing extras → Helsinki (invalid IANA → Helsinki), same precedence as review start gate (123).
2. **Client:** `travelerSelfCancelRefundChoice` uses `wallTimeInZoneToUtcMs` + `resolveDepartureTimezone`; Trips passes snapshotted TZ.
3. Vitest: America/New_York 24h window determinism.

Remote `db push` applied **124**.

## Certification

| Label | Evidence |
|-------|----------|
| AUTOMATED-TESTED | cancellation-policy.test.ts |
| INTEGRATION | remote migration 124 |

## Explicitly not done

- Stay private check-in address  
- notify dual-mode JWT  
- LIVE Stripe / FOUNDER money  
