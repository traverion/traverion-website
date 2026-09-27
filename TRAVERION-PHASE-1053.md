# Traverion — Phase 1053

**Mission:** Marketplace completeness continuum after Phase 1052  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** Local=Remote through **123** (no new migration)

---

## Problem

Support ticket “I paid but my booking isn’t showing” cites Stripe `cs_test_…` / `pi_…` / booking UUID. Admin `bookings_list` only searched guest name/email/`booking_number`. Checkout session was fetched only for a TEST badge — never searchable or shown as an ops id.

## Fix

1. Expand `bookings_list` search: booking UUID, exact `cs_` / `pi_`, partial Stripe fragment (≥8 chars), longer sanitize cap (128).
2. Select + return `payment_intent_id`.
3. Admin UI: searchable placeholder; monospace id / session / PI on each row.
4. Pure helper + vitest (`admin-booking-search`).
5. `docs/ADMIN_SUPPORT_READINESS.md` updated.

Deployed `admin-supplier-verification`.

## Certification

| Label | Evidence |
|-------|----------|
| AUTOMATED-TESTED | `admin-booking-search.test.ts` |
| CODE-INSPECTED | Edge + AdminBookingsPanel |
| INTEGRATION | Function redeployed |
| BROWSER-TESTED | not this phase (admin host staff demo still FOUNDER/P2) |

## Explicitly not done

- Admin host browser-cert with staff demo credentials  
- Stripe Dashboard deep-links  
- Auto-refund / LIVE Stripe  
