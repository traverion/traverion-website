# TRAVERION PHASE 1778 — Expire Checkout when booking update fails after create

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

After `checkout.sessions.create`, a booking update error returned 500 without expiring the session (0-row race path already expired). Left a payable orphan session tied to `metadata.booking_id`.

## Fix

Expire the new session on `updateError` before returning 500 (same as 0-row path).

## Verification

- Vitest wiring cert.
- Redeploy `create-booking-checkout-session`.
