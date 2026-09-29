# TRAVERION PHASE 1724 — Supplier cancel email refund_choice honesty

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Traveler self-cancel always emailed partners the vague “when a refund applies…” copy. Guests could also forge cancel `fieldDiffs`. Paid cancels with `refund_choice = full_refund` vs `no_refund` looked the same in the host inbox.

## Fix

`notify-supplier-event` loads `refund_choice` from the booking row, rebuilds cancel `fieldDiffs` server-side (guest cannot forge), and branches HTML/text subcopy on unpaid / `full_refund` / `no_refund` without claiming Traverion auto-refunds.

## Verification

- Vitest wiring + copy certs.
- Deploy `notify-supplier-event`.
