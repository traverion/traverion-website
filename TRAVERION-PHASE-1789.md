# TRAVERION PHASE 1789 — Refund webhook auth email fallback

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

`charge.refunded` skipped traveler `partial_refund_recorded` / `refund_completed`
when `guest_email` was blank — Money updated, traveler never emailed.

## Fix

Always invoke `notify-customer-booking`; edge Phase 1788 resolves via
`guest_user_id` when the column is empty.

## Verification

- Vitest wiring cert.
- Deploy: `stripe-webhook`.
