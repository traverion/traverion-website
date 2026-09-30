# TRAVERION PHASE 1733 — Host email when Stripe records a full refund

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

After a paid booking was fully refunded in Stripe, the webhook reversed earnings and emailed the traveler (`refund_completed`), but the host never got a Traverion email — Money silently dropped.

## Fix

Add supplier event `refund_completed` and call `notify-supplier-event` from `stripe-webhook` after successful `reverse_paid_booking_earnings` (full refund only; same gate as traveler mail).

## Verification

- Vitest wiring cert.
- Deploy `notify-supplier-event` + `stripe-webhook`.
