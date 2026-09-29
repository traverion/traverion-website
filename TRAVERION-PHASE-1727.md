# TRAVERION PHASE 1727 — Distinct Inbox/note emails must not hit entity cooldown

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Phases 1710/1723 added content-hashed idempotency keys so each distinct Inbox message or Trips note change could email. `claimTransactionalSend` still applied a 900s **entity** cooldown on `guest_message` / `booking_detail_changed` / `new_booking_message` / `your_details_updated`, so message 2+ within 15 minutes returned `{ skipped: true, reason: 'cooldown' }` while the thread UI succeeded.

## Fix

Remove entity-level `cooldownSeconds` on those four templates. Dedup remains via content-hashed idempotency keys. Contact inquiry keeps its 900s cooldown.

## Verification

- Vitest wiring cert.
- Deploy `notify-customer-booking` + `notify-supplier-event`.
