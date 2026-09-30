# TRAVERION PHASE 1757 — Wire Create CTA canCreate through Layout

**Date:** 2026-09-30  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

Phase 1755 computed `canCreateListings` but never passed `canCreate` to the sidebar or gated the mobile Create button — finance still saw Create CTAs.

## Fix

Pass `canCreate={canCreateListings}` and hide Create when false (sidebar + mobile More sheet).

## Verification

- Vitest 1755 cert (expects Layout wiring).
