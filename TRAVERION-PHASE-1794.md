# TRAVERION PHASE 1794 — Await booking-note thread post

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Guest note save fired `void postBookingMessage` — Inbox Unread could stay dark
while the note persisted and host email may have sent.

## Fix

Await the thread post; on failure return success with a soft warning so the
traveler knows to message from Trips.

## Verification

- Vitest wiring cert.
