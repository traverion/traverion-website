# TRAVERION PHASE 1771 — Traveler session survives supplier_profiles lookup null

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

`travelerUserAllowed` treated `userHasSupplierProfile === null` (network/RLS blip) as not allowed, which wiped real traveler sessions on restore/`onAuthStateChange`. Sign-in path already erred honestly; session restore did not.

## Fix

On `null`, keep the session (`return true`). Only wipe when partner-only is confirmed (`hasSupplierProfile === true` without consumer profile).

## Verification

- Vitest wiring cert.
