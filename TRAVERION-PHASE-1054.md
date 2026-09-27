# Traverion — Phase 1054

**Mission:** Marketplace completeness continuum after Phase 1053  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** Local=Remote through **123** (no new migration)

---

## Problem

`purchase_snapshot.departureTimezone` was frozen at checkout, but Trips only showed wall-clock `HH:MM`. Remote travelers could read `20:00` as their device local time instead of experience-local (e.g. Rovaniemi / Europe/Helsinki).

## Fix

1. `displayDepartureTimezoneFromPurchase` + `formatTripDepartureWithTimezone` → `20:00 · Europe/Helsinki local` when snapshotted.
2. Trips list/detail + cancel confirm + booking confirmation use the formatted clock.
3. Vitest coverage on snapshot helpers.

Pre-TZ snapshots (no `departureTimezone`) keep bare `HH:MM` — no invented zone.

## Certification

| Label | Evidence |
|-------|----------|
| AUTOMATED-TESTED | purchase-snapshot.test.ts 11/11 |
| CODE-INSPECTED | MyBookings + BookingConfirmationPage |

## Explicitly not done

- Migrating cancel RPC off hardcoded Europe/Helsinki to listing TZ (separate SQL phase)  
- Stay private check-in address  
- LIVE Stripe / FOUNDER money  
