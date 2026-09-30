# TRAVERION PHASE 1769 — Guest note Inbox post only after paid

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

1766 always `void postBookingMessage` after note diffs. Notes RPC allows unpaid pending holds; chat RPC rejects non-paid. Note+email succeeded while Inbox post failed silently.

## Fix

Select `payment_status` and only post the thread row when `bookingPaymentWasCollected` (email path unchanged).

## Verification

- Vitest wiring cert.
