# Traverion — Phase 1076

**Mission:** Marketplace completeness continuum after Phase 1075  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **127** (no new migration)  
**Founder parked (unchanged):** auto-refund; take-rate / commission

---

## Zoom-out (rentals)

Honest rentals audit — **do not build a rentals vertical now**.

| Surface | Classification |
|---------|----------------|
| Schema / inventory family | MISSING (`LIVE_INVENTORY_FAMILIES` = tour + stay only) |
| Creation UI | UI ONLY — `PartnerCreateListingPage` “Not available to list yet” |
| Editing / publish / availability / pricing | MISSING |
| Traveler discovery / PDP / quote / checkout | MISSING |
| Booking snapshot / Trips / supplier ops | MISSING |
| Cancellation / reviews / emails / RLS | NOT REQUIRED YET |

**Verdict:** Rentals are an honest placeholder. Higher ROI remains tour/stay P1 correctness. Rentals vertical slice deferred until tours/stays operational completeness is stronger.

---

## Problem (P1)

Traveler “today or later” gates used **browser local calendar** (UI) or **UTC date** (Deno `quoteListingBooking` default `toISOString().slice(0,10)`). A traveler ahead of the experience timezone could not select a still-bookable local day; checkout could disagree with PDP.

Canonical truth: listing `departureTimezone` (else Europe/Helsinki) — same axis as cutoff, cancel, reminders.

## Fix

- `experienceTodayIsoForListing` + quote/stay quote defaults
- Deno checkout quote defaults to experience-local today
- Tour/Stay PDP + BookingPage calendars / `dateNotInPast` use experience today
- Availability fetch `fromDate` aligned to experience today (or browse filter date)

## Certification

- AUTOMATED-TESTED: `booking-quote.test.ts`, `booking-quote-deno-authoritative.test.ts`
- Typecheck: `tsc -p tsconfig.app.json --noEmit`
- Deploy: `create-booking-checkout-session` (shared booking-quote)
