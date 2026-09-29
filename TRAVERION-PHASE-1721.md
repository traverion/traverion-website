# TRAVERION PHASE 1721 — Cancel Accept/Decline emails after host re-request

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

After traveler Declines once, host re-requests (1712 fixed traveler request mail), second Decline succeeds in Trips but `cancellation_declined` host/traveler emails stay `already_sent` under permanent booking-scoped keys.

## Fix

Suffix customer + supplier idempotency keys with `cancellation_requests.id` (`requestId`). MyBookings passes `req.id`.

## Verification

- Vitest wiring certs.
