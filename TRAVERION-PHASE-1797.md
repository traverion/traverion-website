# TRAVERION PHASE 1797 — Accept/Decline always notifies

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Traveler Accept/Decline gated `notifyCancellationResolved` on
`guest_email || ops.supplier_id` — both blank skipped all cancel mail even
though helpers resolve auth email and party supplier.

## Fix

Always call `notifyCancellationResolved` after successful respond.

## Verification

- Vitest wiring cert.
