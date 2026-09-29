# TRAVERION PHASE 1712 — Host cancel re-request traveler email

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Host requests cancellation → traveler declines → host requests again → UI succeeds → **traveler never gets the second** `cancellation_requested_by_supplier` email.

## Root cause

Idempotency key was permanent `customer:cancellation_requested_by_supplier:{bookingId}`. RPC allows a new request after decline; email claim still `already_sent`.

## Fix

Suffix with `cancellation_requests.id` (`requestId` from RPC). Partner Bookings passes `res.id`.

## Verification

- Vitest wiring certs.
