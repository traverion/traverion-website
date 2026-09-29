# TRAVERION PHASE 1723 — Trips notes vs Inbox host email cooldown

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

After Trips note save or Inbox message, the other host email was skipped for 900s (`cooldown` on shared `guest_message` template key). Phase 1710 fixed idempotency keys only.

## Fix

Route Trips note updates to `booking_detail_changed` (separate cooldown bucket). Keep Inbox on `guest_message`.

## Verification

- Vitest wiring cert.
