# TRAVERION PHASE 1729 — Inbox / cancel-resolve host email when ops lack supplier_id

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Traveler Inbox messages and Accept/Decline of host cancel requests passed `supplierId` only from Trips `listingOps` cache. Unpublished listings or a failed ops load left `supplier_id` empty → `notifySupplierEvent` 401 / skip while the thread/RPC succeeded. Phase 1707 already resolved supplier at notify time for self-cancel and notes; Inbox and cancel-resolve did not.

## Fix

`notifyNewBookingMessage` (traveler) and `notifyCancellationResolved` call `fetchListingSupplierMetaForParty` when `supplierId` is blank.

## Verification

- Vitest wiring cert.
