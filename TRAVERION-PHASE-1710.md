# TRAVERION PHASE 1710 — Note update vs Inbox guest_message idempotency

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

First Trips note update (or Inbox message) sent `guest_message` under permanent key `supplier:guest_message:{bookingId}`. Later note or Inbox sends returned `already_sent` while UI still succeeded. Same one-shot hole for traveler `your_details_updated` and host→traveler `new_booking_message`.

## Root cause

Default idempotency keys are booking-scoped per kind with no suffix. Note updates and Inbox posts share `guest_message`.

## Fix

Phase 1710 suffixes (content-hashed, Phase 1510-safe namespaces):
- Notes host: `supplier:guest_message:{id}:notes:…`
- Inbox host: `supplier:guest_message:{id}:inbox:…`
- Traveler details: `customer:your_details_updated:{id}:…`
- Traveler Inbox: `customer:new_booking_message:{id}:…`

900s cooldown still applies.

## Verification

- Vitest source certs.
