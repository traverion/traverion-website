# TRAVERION PHASE 1772 — Signed-out browse shows wishlist Save hearts

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Signed-out wishlist set `ready=false`, so `heartsKnown` was false and browse cards omitted Save. Tour/Stay detail still offered Save→auth; browse was a silent dead-end.

## Fix

When Supabase is enabled and there is no user, set `ready=true` with an empty id set so hearts render as unsaved and toggle can open auth resume.

## Verification

- Vitest wiring cert.
