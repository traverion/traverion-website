# Traverion — Phase 1052

**Mission:** Marketplace completeness continuum after Phase 1051  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** Local=Remote through **123** (no new migration)

---

## Problem

`notify-customer-booking` already re-derived **recipient** (and paid/refund amounts) from the bookings row, but still trusted caller body for **content**: listing title, guest name, date, guests, booking number, listing kind, meeting point. Anyone citing a real `bookingId` could email the real guest forged commercial copy (including after a supplier rename).

## Fix

1. Pure guard `resolveBookingTiedContent` (src + Deno mirror): prefer `purchase_snapshot.listingTitle` / meeting / pickup; else live listing + booking columns.
2. Edge loads booking (`guest_*`, dates, snapshot, `listing_id`) + listing (`title`, `listing_extras`, `experience_kind`) and applies overrides before HTML/PDF/subject.
3. Left caller-supplied (same as supplier Phase 579): `fieldDiffs`, `unpaidCheckout`, `refundStatusNote`, Stripe receipt ids.

Deployed to `xcopqllkulxfkpunetbc`.

## Certification

| Label | Evidence |
|-------|----------|
| AUTOMATED-TESTED | `notify-customer-content.test.ts` 6/6; mirror sync includes new pair |
| CODE-INSPECTED | Edge wiring in `notify-customer-booking` |
| INTEGRATION | Function redeployed |

## Explicitly not done

- Full dual-mode JWT on booking-tied notify (nuisance invoke with real bookingId still possible; content+recipient now DB-true)
- fieldDiffs authenticity
- LIVE Stripe / FOUNDER money decisions
