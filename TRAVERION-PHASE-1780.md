# TRAVERION PHASE 1780 — Consumer profile lookup errors do not wipe travelers

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

`fetchConsumerProfile` mapped SELECT errors to `null` (same as missing row). Dual-role users with a supplier profile then looked partner-only and were wiped on www when consumer fetch blipped.

## Fix

Throw on error; `travelerUserAllowed` catches and keeps the session (`return true`).

## Verification

- Vitest wiring cert.
