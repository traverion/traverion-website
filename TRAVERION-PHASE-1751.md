# TRAVERION PHASE 1751 — Bookings pickup ops filter honors note overrides

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

After Phase 1742 fixed Meet display, the Bookings `ops=pickup` filter still built meeting copy from snapshot/listing helpers before calling `partnerBookingHasPickupAttention`, making the queue argument path inconsistent with display. Also removed an unused Dashboard meeting import after 1742.

## Fix

Resolve pickup copy with `resolvePartnerPickupCopy` in the filter (same precedence as Meet lines).

## Verification

- Vitest wiring cert.
