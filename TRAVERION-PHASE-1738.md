# TRAVERION PHASE 1738 — Host refund emails include money figures

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Traveler partial/full Stripe refund emails cited Refunded amounts, but host `notify-supplier-event` mail only said Collected was reduced / reversed — no figures. Partners could not reconcile Money from the email alone.

## Fix

Pass `refundAmount` (+ `amountPaidRemaining` on partial) from `stripe-webhook` and render them in host plain-text and HTML refund templates.

## Verification

- Vitest wiring cert.
- Deploy `notify-supplier-event` + `stripe-webhook`.
