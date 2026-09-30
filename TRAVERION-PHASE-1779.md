# TRAVERION PHASE 1779 — Orphan-refund traveler email uses auth email fallback

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Paid confirmation resolved traveler email via `auth.admin.getUserById` when `guest_email` was empty. `notifyTravelerCheckoutCaptureReversed` returned early with no email — silent skip after auto-refund / capture reverse.

## Fix

Same auth-email fallback before skipping notify.

## Verification

- Vitest wiring cert.
- Redeploy functions that bundle promote-paid-from-checkout (`stripe-webhook`, `create-booking-checkout-session` already redeployed paths as needed).
