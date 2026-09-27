# Traverion — Phase 1084

**Mission:** Marketplace completion continuum after Phase 1083  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** unchanged (no new migration)

---

## Problem (P1)

`fetchCancellationRequestsForBookings` swallowed query errors as `[]`, so Trips Accept/Decline, partner Bookings cancel badges, Dashboard open-cancel attention, and Inbox cancel-thread listing treated infrastructure failure as “no open cancellation.”

## Fix

- Throw on cancel-request query error (`queryRowsOrThrow`).
- Isolate cancel fetch from bookings load on Trips / Bookings / Dashboard / Inbox.
- Keep prior open-cancel state on failure; surface a warn callout — never blank the trip/booking list.

## Certification

- AUTOMATED-TESTED: `query-rows-or-throw.test.ts`
- Typecheck: `tsc -p tsconfig.app.json --noEmit`
- Browser/E2E: not performed
